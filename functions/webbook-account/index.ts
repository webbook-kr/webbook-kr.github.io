// 웹북 발행 계정. 이메일 + 내 발행 코드.
// 처음엔 누구나 기본 코드(webbook_codes 의 label='default')로 발행하고, 원하면 내 코드로 바꾼다.
//  POST {action:"send",   email}               → 이메일로 확인 번호(6자리, 15분) 보내기. 내 코드 처음 만들기·잊었을 때
//  POST {action:"set",    email, num, code}    → 확인 번호가 맞으면 내 코드로 정한다
//  POST {action:"change", email, old, code}    → 지금 코드(아직 안 만들었으면 기본 코드)를 알면 바로 바꾼다
//  POST {action:"check",  email, code}         → 이 이메일·코드로 발행할 수 있는지 (제작기 '확인' 단추)
// 메일: WEBBOOK_MAIL_KEY(xkeysib-… Brevo / re_… Resend), WEBBOOK_MAIL_FROM(보내는 주소) 비밀값. 다른 함수의 메일 설정과 섞이지 않게 따로 둔다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://webbook-kr.github.io";
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
const codeHash = (email: string, code: string) => sha("webbook:" + email + ":" + code);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

async function sendMail(to: string, subject: string, html: string, text: string) {
  const key = Deno.env.get("WEBBOOK_MAIL_KEY") ?? "";
  const raw = Deno.env.get("WEBBOOK_MAIL_FROM") ?? "";
  const m = raw.match(/<\s*([^>]+)\s*>/);
  const from = (m ? m[1] : raw).trim();
  if (!key || !from) return { sent: false, why: "NOT_CONFIGURED" };
  try {
    const r = key.startsWith("xkeysib-")
      ? await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sender: { name: "웹북", email: from }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `웹북 <${from}>`, to: [to], subject, html, text }),
        });
    if (!r.ok) return { sent: false, why: `${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, why: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "JSON 이 아닙니다" }, 400); }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) return json({ error: "이메일 주소를 확인해 주세요" }, 400);
  const code = String(b.code ?? "").trim().normalize("NFC");
  const { data: def } = await sb.from("webbook_codes").select("code").eq("label", "default").eq("active", true).maybeSingle();
  const { data: u } = await sb.from("webbook_users").select("*").eq("email", email).maybeSingle();
  const okCode = (c: string) => c.length >= 4 && c.length <= 30 && c !== def?.code;
  const save = async (c: string) => {
    const { error } = await sb.from("webbook_users").upsert({
      email, code_hash: await codeHash(email, c), reset_hash: null, reset_exp: null, reset_tries: 0, updated_at: new Date().toISOString(),
    });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  };

  if (b.action === "check") {
    if (u?.code_hash) return json({ ok: u.code_hash === await codeHash(email, code), own: true });
    return json({ ok: !!def && code === def.code, own: false });
  }

  if (b.action === "change") {
    const old = String(b.old ?? "").trim().normalize("NFC");
    const good = u?.code_hash ? u.code_hash === await codeHash(email, old) : (!!def && old === def.code);
    if (!good) return json({ error: "지금 코드가 맞지 않습니다. 잊었으면 '이메일로 확인 번호 받기'를 쓰세요" }, 403);
    if (!okCode(code)) return json({ error: "새 코드는 4~30자, 기본 코드와 달라야 합니다" }, 400);
    return save(code);
  }

  if (b.action === "send") {
    const now = Date.now();
    const last = u?.sent_at ? Date.parse(u.sent_at) : 0;
    if (now - last < 60_000) return json({ error: "1분 뒤에 다시 받아 주세요" }, 429);
    const count = now - last < 3_600_000 ? (u?.sent_count ?? 0) : 0;
    if (count >= 5) return json({ error: "한 시간에 다섯 번까지 받을 수 있습니다" }, 429);
    const num = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const { error } = await sb.from("webbook_users").upsert({
      email, code_hash: u?.code_hash ?? null, reset_hash: await sha(email + ":" + num),
      reset_exp: new Date(now + 15 * 60_000).toISOString(), reset_tries: 0, sent_at: new Date(now).toISOString(), sent_count: count + 1,
    });
    if (error) return json({ error: error.message }, 500);
    const subject = `웹북 확인 번호 ${num}`;
    const text = `웹북 제작기에서 내 발행 코드를 정하려면 아래 확인 번호를 넣어 주세요.\n\n확인 번호: ${num}\n(15분 동안 쓸 수 있습니다)\n\n직접 요청하지 않았다면 이 메일은 지워도 됩니다.\n${SITE}/maker.html`;
    const html = `<div style="max-width:520px;margin:0 auto;padding:24px 18px;font:15px/1.7 -apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1f2328">
<div style="font-size:13px;color:#6b7280">웹북 제작기</div>
<h1 style="font-size:19px;margin:8px 0 16px">내 발행 코드 확인 번호</h1>
<p>제작기 화면에 아래 번호를 넣어 주세요. <b>15분</b> 동안 쓸 수 있습니다.</p>
<p style="font-size:30px;font-weight:800;letter-spacing:6px;background:#f3f4f6;border-radius:10px;padding:14px 0;text-align:center;margin:18px 0">${num}</p>
<p style="font-size:13px;color:#6b7280">직접 요청하지 않았다면 이 메일은 지워도 됩니다. 코드는 바뀌지 않습니다.<br><a href="${SITE}/maker.html" style="color:#1d4ed8">${SITE}/maker.html</a></p></div>`;
    const s = await sendMail(email, subject, html, text);
    if (!s.sent) { console.error("메일 실패:", s.why); return json({ error: "메일을 보내지 못했습니다. 잠시 뒤 다시 해 보거나 관리자에게 알려 주세요", ...(s.why === "NOT_CONFIGURED" ? { why: s.why } : {}) }, 502); }
    return json({ ok: true });
  }

  if (b.action === "set") {
    const num = String(b.num ?? "").replace(/\D/g, "");
    if (!u?.reset_hash || !u.reset_exp || Date.parse(u.reset_exp) < Date.now()) return json({ error: "확인 번호를 먼저 받아 주세요 (15분이 지났으면 다시 받기)" }, 400);
    if ((u.reset_tries ?? 0) >= 5) return json({ error: "다섯 번 틀렸습니다. 확인 번호를 다시 받아 주세요" }, 429);
    if (u.reset_hash !== await sha(email + ":" + num)) {
      await sb.from("webbook_users").update({ reset_tries: (u.reset_tries ?? 0) + 1 }).eq("email", email);
      return json({ error: "확인 번호가 맞지 않습니다" }, 403);
    }
    if (!okCode(code)) return json({ error: "새 코드는 4~30자, 기본 코드와 달라야 합니다" }, 400);
    return save(code);
  }

  return json({ error: "모르는 action" }, 400);
});
