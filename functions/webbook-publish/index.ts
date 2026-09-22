// 웹북 발행 함수. 발행 코드가 맞으면 책 HTML(과 잠긴 PDF)을 공개 버킷에 올리고 읽기 주소를 돌려준다.
// 인증: 발행 코드(webbook_codes) + 수정 토큰(webbook_books.token_hash). JWT 불필요.
// 수파베이스 저장소는 HTML 을 text/plain 으로 내보내므로, 읽기는 READER 페이지가 받아서 보여준다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://webbook-kr.github.io";
const READER = SITE + "/b/?";              // 책 페이지를 못 만들었을 때의 예비 주소
const REPO = "webbook-kr/webbook-kr.github.io";
const PAGE_TPL = SITE + "/b/_book.html";   // 책마다 만드는 읽기 페이지의 틀
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function rand(n: number) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const u = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(u).map((x) => a[x % a.length]).join("");
}
// 저장 경로는 영문·숫자만 허용된다. 한글 제목이면 book-난수 로.
function slugify(t: string) {
  const s = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || "book";
}

const escA = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function pick(html: string, re: RegExp) { const m = html.match(re); return m ? unesc(m[1]).trim() : ""; }

// 책마다 읽기 페이지(b/<slug>/index.html)를 깃허브에 올린다. 카톡·문자 미리보기에 제목·설명·표지가 뜨게 하려는 것.
// GITHUB_TOKEN 비밀값(저장소 Contents 쓰기 권한)이 있어야 하고, 없거나 실패하면 예비 주소(/b/?slug)를 쓴다.
async function pushBookPage(slug: string, title: string, html: string): Promise<{ url: string; warn?: string }> {
  const tok = Deno.env.get("GITHUB_TOKEN");
  if (!tok) return { url: READER + slug, warn: "GITHUB_TOKEN 없음" };
  try {
    const tpl = await (await fetch(PAGE_TPL, { cache: "no-store" })).text();
    if (!tpl.includes("{{SLUG}}")) throw new Error("틀 파일이 이상함");
    const full = pick(html, /<title>([^<]*)<\/title>/) || title;
    const short = full.split(" — ")[0];
    const desc = pick(html, /<meta name="description" content="([^"]*)"/);
    const img = pick(html, /class="cimg"[^>]*>\s*<img[^>]*src="([^"]+)"/);
    const imgTags = img
      ? `<meta property="og:image" content="${escA(img)}">\n<meta name="twitter:card" content="summary_large_image">`
      : `<meta name="twitter:card" content="summary">`;
    const page = tpl.replace("<title>{{TITLE}}</title>", "<title>" + escA(full) + "</title>")
      .replaceAll("{{TITLE}}", escA(short)).replaceAll("{{DESC}}", escA(desc)).replaceAll("{{SLUG}}", slug).replace("{{IMAGE_TAGS}}", imgTags);
    const api = `https://api.github.com/repos/${REPO}/contents/b/${slug}/index.html`;
    const hdr = { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
    const cur = await fetch(api, { headers: hdr });
    const curJ = cur.ok ? await cur.json() : null;
    const sha = curJ?.sha;
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(page)));
    if (curJ && String(curJ.content ?? "").replace(/\s/g, "") === b64) return { url: `${SITE}/b/${slug}/` }; // 그대로면 커밋하지 않는다
    const r = await fetch(api, { method: "PUT", headers: hdr, body: JSON.stringify({ message: `책 페이지: ${short}`, content: b64, ...(sha ? { sha } : {}) }) });
    if (!r.ok) throw new Error("GitHub " + r.status + " " + (await r.text()).slice(0, 200));
    return { url: `${SITE}/b/${slug}/` };
  } catch (e) {
    return { url: READER + slug, warn: "책 페이지 만들기 실패: " + String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON 이 아닙니다" }, 400); }
  const code = String(body.code ?? "").trim().normalize("NFC");
  const title = String(body.title ?? "").trim().slice(0, 120);
  const html = String(body.html ?? "");
  const pdfEnc = body.pdfEnc ? String(body.pdfEnc) : null;
  const locked = !!body.locked;
  if (!code) return json({ error: "발행 코드를 넣어 주세요" }, 400);
  if (!title) return json({ error: "책 제목이 없습니다" }, 400);
  if (html.length < 200 || !html.includes('id="deck"')) return json({ error: "책 파일이 아닙니다" }, 400);
  if (html.length > 8_000_000) return json({ error: "책 파일이 너무 큽니다 (8MB 초과)" }, 413);
  if (pdfEnc && pdfEnc.length > 20_000_000) return json({ error: "PDF 가 너무 큽니다 (20MB 초과)" }, 413);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: ok } = await sb.from("webbook_codes").select("code").eq("code", code).eq("active", true).maybeSingle();
  if (!ok) return json({ error: "발행 코드가 맞지 않습니다" }, 403);

  // 기존 책 덮어쓰기(slug+token) 또는 새 책
  let slug = String(body.slug ?? "").trim();
  let token = String(body.token ?? "").trim();
  if (slug && token) {
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return json({ error: "주소 형식이 틀렸습니다" }, 400);
    const { data: row } = await sb.from("webbook_books").select("token_hash").eq("slug", slug).maybeSingle();
    if (!row || row.token_hash !== await sha(token)) return json({ error: "이 책의 수정 권한이 없습니다. 새 책으로 발행하세요." }, 403);
  } else {
    const base = slugify(title);
    slug = `${base}-${rand(base === "book" ? 6 : 4)}`;
    token = rand(24);
  }

  const up = await sb.storage.from("webbook").upload(`${slug}/index.html`, new TextEncoder().encode(html), { upsert: true, contentType: "text/html", cacheControl: "60" });
  if (up.error) return json({ error: "올리기 실패: " + up.error.message }, 500);
  if (pdfEnc) {
    const p = await sb.storage.from("webbook").upload(`${slug}/index.pdf.enc`, new TextEncoder().encode(pdfEnc), { upsert: true, contentType: "application/json", cacheControl: "60" });
    if (p.error) return json({ error: "PDF 올리기 실패: " + p.error.message }, 500);
  }

  const { error: dbErr } = await sb.from("webbook_books").upsert({
    slug, title, token_hash: await sha(token), locked, size_bytes: html.length + (pdfEnc?.length ?? 0), updated_at: new Date().toISOString(),
  });
  if (dbErr) return json({ error: "기록 실패: " + dbErr.message }, 500);

  const { data: pub } = sb.storage.from("webbook").getPublicUrl(`${slug}/index.html`);
  const page = await pushBookPage(slug, title, html);
  return json({ url: page.url, raw: pub.publicUrl, slug, token, ...(page.warn ? { warn: page.warn } : {}) });
});
