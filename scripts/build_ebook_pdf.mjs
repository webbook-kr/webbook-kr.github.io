// ebook/*.html → ebook/*.pdf  (헤드리스 크롬으로 인쇄)
// 실행:  npx playwright install chromium && node scripts/build_ebook_pdf.mjs [경로.html ...]
//   인수 없음  → ebook/*.html 전부 (잠긴 파일은 건너뜀)
//   경로 지정  → 그 파일 옆에 .pdf (예: ebook/drafts/book1.html → ebook/drafts/book1.pdf)
import { chromium } from 'playwright';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve('ebook');
const args = process.argv.slice(2);
const files = (args.length ? args.map(f => resolve(f)) : readdirSync(dir).filter(f => f.endsWith('.html')).map(f => resolve(dir, f)))
  .filter(f => { const locked = readFileSync(f, 'utf8').includes('id="cipher"'); if (locked) console.log(basename(f), '잠긴 파일, 건너뜀'); return !locked; });

const browser = await chromium.launch();
for (const html of files) {
  const pdf = html.replace(/\.html$/, '.pdf');
  const page = await browser.newPage();
  await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  console.log(basename(pdf), Math.round(statSync(pdf).size / 1024) + 'KB');
}
await browser.close();
