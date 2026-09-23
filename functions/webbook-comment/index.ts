// 웹북 의견 함수. 읽는 사람이 쪽마다 남기는 의견을 저장하고, 책 주인(수정 토큰)만 모아 본다.
//  POST {slug, page, page_title, name, body}            → 의견 저장 (누구나)
//  GET  ?slug=…&token=…                                 → 의견 목록 (책 주인만)
//  POST {action:"delete", id, slug, token}              → 의견 지우기 (책 주인만)
// 인증: 목록·삭제는 webbook_books.token_hash 로 확인. JWT 불필요.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
async function sha(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const SLUG = /^[a-z0-9-]{1,60}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function owner(slug: string, token: string) {
    if (!SLUG.test(slug) || !token) return false;
    const { data: row } = await sb.from("webbook_books").select("token_hash").eq("slug", slug).maybeSingle();
    return !!row && row.token_hash === await sha(token);
  }

  if (req.method === "GET") {
    const u = new URL(req.url);
    const slug = (u.searchParams.get("slug") ?? "").trim(), token = (u.searchParams.get("token") ?? "").trim();
    if (!await owner(slug, token)) return json({ error: "이 책의 주인만 볼 수 있습니다" }, 403);
    const { data, error } = await sb.from("webbook_comments").select("id,page,page_title,name,body,created_at")
      .eq("slug", slug).order("page").order("created_at");
    if (error) return json({ error: error.message }, 500);
    return json({ slug, comments: data });
  }

  if (req.method !== "POST") return json({ error: "GET/POST only" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON 이 아닙니다" }, 400); }

  if (b.action === "delete") {
    const slug = String(b.slug ?? "").trim(), token = String(b.token ?? "").trim(), id = Number(b.id);
    if (!await owner(slug, token)) return json({ error: "이 책의 주인만 지울 수 있습니다" }, 403);
    if (!Number.isInteger(id)) return json({ error: "id 가 이상합니다" }, 400);
    const { error } = await sb.from("webbook_comments").delete().eq("slug", slug).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  const slug = String(b.slug ?? "").trim();
  const page = Number(b.page);
  const page_title = String(b.page_title ?? "").trim().slice(0, 120);
  const name = String(b.name ?? "").trim().slice(0, 40);
  const body = String(b.body ?? "").trim().slice(0, 3000);
  if (!SLUG.test(slug)) return json({ error: "책 주소가 이상합니다" }, 400);
  if (!Number.isInteger(page) || page < 1 || page > 5000) return json({ error: "쪽 번호가 이상합니다" }, 400);
  if (name.length < 2) return json({ error: "이름과 소속을 적어 주세요" }, 400);
  if (!body) return json({ error: "의견을 적어 주세요" }, 400);
  const { data: book } = await sb.from("webbook_books").select("slug").eq("slug", slug).maybeSingle();
  if (!book) return json({ error: "없는 책입니다" }, 404);
  // 같은 책에 너무 많이 쌓이면 막는다 (장난·자동 입력 방지)
  const { count } = await sb.from("webbook_comments").select("id", { count: "exact", head: true }).eq("slug", slug);
  if ((count ?? 0) >= 2000) return json({ error: "이 책은 의견을 더 받을 수 없습니다" }, 429);
  const { data, error } = await sb.from("webbook_comments").insert({ slug, page, page_title, name, body }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id });
});
