// 웹북 잠그기: 본문(#deck 안)과 PDF 를 코드로 암호화해 ebook/ 에 내보낸다.
//   node scripts/lock_ebook.mjs ebook/drafts/book1.html "코드"
//   → ebook/book1.html      (본문이 암호문으로 들어간 파일)
//   → ebook/book1.pdf.enc   (같은 자리에 book1.pdf 가 있으면)
// 브라우저에서 코드를 넣으면 풀립니다. 규칙은 template.html 의 decrypt() 와 같음:
//   PBKDF2-SHA256 200,000회 → AES-GCM-256, {"salt","iv","ct"} base64
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

const [src, code] = process.argv.slice(2);
if (!src || !code) { console.error('사용법: node scripts/lock_ebook.mjs ebook/drafts/책.html "코드"'); process.exit(1); }

const subtle = globalThis.crypto.subtle;
const b64 = (u8) => Buffer.from(u8).toString('base64');
async function encrypt(pw, bytes) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}

const html = readFileSync(resolve(src), 'utf8');
const m = html.match(/(<div id="deck">)([\s\S]*?)(<\/div><!-- \/#deck -->)/);
if (!m) { console.error('<div id="deck"> … </div><!-- /#deck --> 를 찾지 못했습니다. 템플릿 구조를 유지해 주세요.'); process.exit(1); }
if (html.includes('id="cipher"')) { console.error('이미 잠긴 파일입니다. 원고(drafts) 파일을 넣어 주세요.'); process.exit(1); }

const body = await encrypt(code.trim(), new TextEncoder().encode(m[2]));
const locked = html.replace(m[0], `${m[1]}${m[3]}\n<script id="cipher" type="application/json">${body}</script>`);
const outDir = resolve('ebook'), name = basename(src);
writeFileSync(join(outDir, name), locked);
console.log('잠금 →', join('ebook', name));

const pdfSrc = resolve(src).replace(/\.html?$/, '.pdf');
if (existsSync(pdfSrc)) {
  const enc = await encrypt(code.trim(), readFileSync(pdfSrc));
  const out = join(outDir, name.replace(/\.html?$/, '.pdf.enc'));
  writeFileSync(out, enc);
  console.log('PDF 잠금 →', join('ebook', basename(out)));
} else {
  console.log('PDF 없음 (같은 자리에 .pdf 를 두면 함께 잠급니다):', pdfSrc);
}
