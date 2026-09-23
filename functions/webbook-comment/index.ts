// 웹북 의견 함수. 읽는 사람이 쪽마다 남기는 의견을 저장하고, 회람 차수와 반영 상태를 관리한다.
//  POST {slug, page, page_title, name, body}                 → 의견 저장 (누구나). 책의 현재 차수(round)가 붙는다
//  GET  ?slug=…&page=N                                       → 그 쪽의 의견과 반영 결과 (누구나, 책 안에서 보여 줌)
//  GET  ?slug=…&token=…                                      → 전체 목록 + 책 차수 (책 주인만)
//  POST {action:"status", id, slug, token, status, reply}    → 반영 상태(open 검토중·done 반영·skip 미반영·hold 보류)와 답변 (책 주인만)
//  POST {action:"round", slug, token, round}                 → 회람 차수 바꾸기 (책 주인만)
//  POST {action:"delete", id, slug, token}                   → 의견 지우기 (책 주인만)
// 인증: 주인 작업은 webbook_books.token_hash 로 확인. JWT 불필요.
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
const STATUS = ["open", "done", "skip", "hold"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  async function book(slug: string) {
    if (!SLUG.test(slug)) return null;
    const { data } = await sb.from("webbook_books").select("slug,token_hash,round,round_at").eq("slug", slug).maybeSingle();
    return data;
  }
  async function owner(slug: string, token: string) {
    const b = await book(slug);
    return !!b && !!token && b.token_hash === await sha(token) ? b : null;
  }

  if (req.method === "GET") {
    const u = new URL(req.url);
    const slug = (u.searchParams.get("slug") ?? "").trim(), token = (u.searchParams.get("token") ?? "").trim();
    const pageQ = u.searchParams.get("page");
    if (pageQ !== null) {   // 책 안에서: 그 쪽의 의견과 반영 결과
      const b = await book(slug);
      if (!b) return json({ error: "없는 책입니다" }, 404);
      const page = Number(pageQ);
      if (!Number.isInteger(page) || page < 1) return json({ error: "쪽 번호가 이상합니다" }, 400);
      const { data, error } = await sb.from("webbook_comments").select("round,name,body,status,reply,created_at")
        .eq("slug", slug).eq("page", page).order("created_at");
      if (error) return json({ error: error.message }, 500);
      return json({ round: b.round, comments: data });
    }
    const b = await owner(slug, token);
    if (!b) return json({ error: "이 책의 주인만 볼 수 있습니다" }, 403);
    const { data, error } = await sb.from("webbook_comments").select("id,round,page,page_title,name,body,status,reply,replied_at,created_at")
      .eq("slug", slug).order("page").order("created_at");
    if (error) return json({ error: error.message }, 500);
    return json({ slug, round: b.round, round_at: b.round_at, comments: data });
  }

  if (req.method !== "POST") return json({ error: "GET/POST only" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON 이 아닙니다" }, 400); }
  const slug = String(b.slug ?? "").trim();

  if (b.action) {
    const bk = await owner(slug, String(b.token ?? "").trim());
    if (!bk) return json({ error: "이 책의 주인만 할 수 있습니다" }, 403);
    if (b.action === "delete") {
      const id = Number(b.id);
      if (!Number.isInteger(id)) return json({ error: "id 가 이상합니다" }, 400);
      const { error } = await sb.from("webbook_comments").delete().eq("slug", slug).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (b.action === "status") {
      const id = Number(b.id), status = String(b.status ?? "open"), reply = String(b.reply ?? "").trim().slice(0, 1000);
      if (!Number.isInteger(id)) return json({ error: "id 가 이상합니다" }, 400);
      if (!STATUS.includes(status)) return json({ error: "상태 값이 이상합니다" }, 400);
      const { error } = await sb.from("webbook_comments").update({ status, reply, replied_at: new Date().toISOString() }).eq("slug", slug).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }
    if (b.action === "round") {
      const round = Number(b.round);
      if (!Number.isInteger(round) || round < 1 || round > 99) return json({ error: "차수가 이상합니다" }, 400);
      const { error } = await sb.from("webbook_books").update({ round, round_at: new Date().toISOString() }).eq("slug", slug);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, round });
    }
    return json({ error: "모르는 action" }, 400);
  }

  const page = Number(b.page);
  const page_title = String(b.page_title ?? "").trim().slice(0, 120);
  const name = String(b.name ?? "").trim().slice(0, 40);
  const body = String(b.body ?? "").trim().slice(0, 3000);
  if (!SLUG.test(slug)) return json({ error: "책 주소가 이상합니다" }, 400);
  if (!Number.isInteger(page) || page < 1 || page > 5000) return json({ error: "쪽 번호가 이상합니다" }, 400);
  if (name.length < 2) return json({ error: "이름과 소속을 적어 주세요" }, 400);
  if (!body) return json({ error: "의견을 적어 주세요" }, 400);
  const bk = await book(slug);
  if (!bk) return json({ error: "없는 책입니다" }, 404);
  // 같은 책에 너무 많이 쌓이면 막는다 (장난·자동 입력 방지)
  const { count } = await sb.from("webbook_comments").select("id", { count: "exact", head: true }).eq("slug", slug);
  if ((count ?? 0) >= 2000) return json({ error: "이 책은 의견을 더 받을 수 없습니다" }, 429);
  const { data, error } = await sb.from("webbook_comments").insert({ slug, page, page_title, name, body, round: bk.round }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data.id, round: bk.round });
});
