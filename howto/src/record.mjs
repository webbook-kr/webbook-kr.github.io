// 웹북 사용법 영상용 단계 화면을 실제 제작기·책·의견 화면에서 찍는다. 발행·의견 서버는 가짜 응답으로 대신한다.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const H = '/tmp/claude-0/-home-user-webbook-kr-github-io/60c9817b-999b-59c1-8dab-115f1ed67ca7/scratchpad/howto';
const OUT = H + '/frames'; mkdirSync(OUT, { recursive: true });
const DEMO = readFileSync(H + '/demo.md', 'utf8');
const AICHAT = readFileSync(H + '/aichat.html', 'utf8');
const SLUG = 'demo-2026', KEY = 'demo-key-7h3k9q';
const steps = {};   // clip -> [{img, rect, cap, phone}]
let comments = [];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function stub(ctx) {
  await ctx.route(/^https:\/\/(cdn\.jsdelivr|fonts\.googleapis|fonts\.gstatic)/, r => r.abort());
  await ctx.route(/i\.ytimg\.com/, r => r.abort());
  await ctx.route('https://demo.local/aichat', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: AICHAT }));
  await ctx.route(/webbook-publish/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ url: `https://webbook-kr.github.io/b/${SLUG}/`, slug: SLUG, token: KEY }) }));
  await ctx.route(/webbook-comment/, async r => {
    const req = r.request(), u = new URL(req.url()), H2 = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...H2, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST' } });
    if (req.method() === 'GET') {
      if (u.searchParams.get('page')) { const pg = +u.searchParams.get('page'); return r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify({ round: 1, comments: comments.filter(c => c.page === pg) }) }); }
      const ro = !u.searchParams.get('token');
      return r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify({ slug: SLUG, title: '○○과 회의 결과 공유 자료집', round: 1, round_at: null, readonly: ro || undefined, comments: comments.map(c => ro ? { ...c, id: undefined } : c) }) });
    }
    const body = JSON.parse(req.postData() || '{}');
    if (body.action === 'status') { const c = comments.find(x => x.id === body.id); if (c) { c.status = body.status; c.reply = body.reply; c.replied_at = new Date().toISOString(); } }
    else if (!body.action) comments.push({ id: comments.length + 1, round: 1, page: body.page, page_title: body.page_title, name: body.name, body: body.body, status: 'open', reply: '', created_at: '2026-10-28T01:10:00Z' });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: H2, body: JSON.stringify({ ok: true, id: comments.length, round: 2 }) });
  });
}
async function rectOf(p, sel, pad = 6) {
  if (!sel) return null;
  const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, sel);
  return r ? { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 } : null;
}
async function shot(clip, p, sel, cap, opt = {}) {
  const list = steps[clip] = steps[clip] || [];
  const img = `${clip}-${String(list.length + 1).padStart(2, '0')}.png`;
  if (sel && !opt.noscroll) await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return; const r = e.getBoundingClientRect(); if (r.top < 40 || r.bottom > innerHeight - 110) e.scrollIntoView({ block: 'center', inline: 'nearest' }); for (let a = e.parentElement; a; a = a.parentElement) a.scrollLeft = 0; window.scrollTo(0, window.scrollY); }, sel);
  await p.waitForTimeout(opt.wait ?? 500);
  await p.screenshot({ path: `${OUT}/${img}` });
  list.push({ img, rect: opt.rect || await rectOf(p, sel, opt.pad), cap, phone: !!opt.phone, click: opt.click !== false && !!sel });
}
const say = (p) => p.evaluate(() => { const t = document.getElementById('toast'); return t && t.textContent; });

// ── 제작기 (PC 1280×720) ──
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, permissions: ['clipboard-read', 'clipboard-write'] });
await stub(ctx);
const m = await ctx.newPage();
await m.goto('http://localhost:8931/maker.html', { waitUntil: 'domcontentloaded' });
await m.evaluate(() => localStorage.clear()); await m.reload({ waitUntil: 'domcontentloaded' });
await m.waitForFunction(() => !document.getElementById('dl').disabled, { timeout: 60000 }); await m.waitForTimeout(800);
const pvGo = (n) => m.evaluate((n) => { const f = document.getElementById('pv'); f.contentWindow.location.hash = '#p' + n; }, n);

// 1. 원고 만들기
await shot(1, m, null, '제작기 주소로 들어갑니다 — webbook-kr.github.io/maker.html', { wait: 300 });
await m.click('#aiprompt'); await shot(1, m, '#aiprompt', "원고가 없으면 'AI 요청문 복사'를 누릅니다", { wait: 300 });
const ai = await ctx.newPage(); await ai.goto('https://demo.local/aichat');
await shot(1, ai, '.msg.me', '챗GPT·클로드 등 AI 대화창에 붙여넣고, [자료] 아래에 녹취·메모를 넣습니다', { click: false });
await shot(1, ai, '.msg.ai', '받은 답(원고)을 메모장에 붙여 .md 파일로 저장합니다', { click: false });
await ai.close(); await m.bringToFront();
await shot(1, m, '#loadb', "제작기로 돌아와 '원고 파일 불러오기'로 그 파일을 엽니다 (원고 칸에 붙여넣어도 됨)", { wait: 200 });
await m.evaluate((t) => { const f = new File([t], '회의결과.md', { type: 'text/markdown' }); const dt = new DataTransfer(); dt.items.add(f); const el = document.getElementById('loadf'); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); }, DEMO);
await m.waitForTimeout(2200);
await shot(1, m, '#md', '원고는 기호로 씁니다 — # 장 · ## 쪽 · - 항목 · ==강조== · 핵심:', { click: false });
await shot(1, m, '#pv', '오른쪽 미리보기에 책 모양이 바로 나옵니다', { click: false });

// 2. 제작·미리보기
await m.evaluate(() => { document.getElementById('bookinfo').open = true; }); await m.waitForTimeout(300);
await shot(2, m, '#bookinfo', '책 정보: 제목(| 로 줄바꿈)·글쓴이·부제·날짜·표지 그림 주소', { click: false });
await m.evaluate(() => { document.getElementById('bookinfo').open = false; });
await m.selectOption('#th', 'jjok'); await m.waitForTimeout(1200);
await shot(2, m, '#th', "책 모양: 업무 자료는 '쪽빛'");
await shot(2, m, '#sp', "글 간격: 자료집은 '촘촘' — 한 쪽에 더 많이 들어갑니다");
await pvGo(4); await m.waitForTimeout(600);
await shot(2, m, '#pv', '미리보기에서 ‹ › 로 넘기며 쪽마다 글이 잘리지 않는지 확인', { click: false });
await pvGo(5); await m.waitForTimeout(600);
await shot(2, m, '#open', "'새 창에서 보기'로 크게 확인 — 넘치는 쪽은 문장을 줄이거나 --- 로 나눕니다");

// 3. 발행
await m.evaluate(() => document.querySelector('.pub').scrollIntoView({ block: 'center' }));
await m.fill('#pem', 'hong@example.go.kr'); await m.fill('#pc', '1339');
await shot(3, m, '#pubin', '내 이메일과 기본 코드 1339를 넣습니다 (처음엔 누구나 같은 코드)', { click: false });
await m.click('#pubb'); await m.waitForTimeout(800);
await shot(3, m, '#pres', "'발행하기'를 누르면 책 주소가 나옵니다", { click: false });
await shot(3, m, '#cp', "'주소 복사' → 카톡·메일로 공유. 제목과 표지가 미리보기에 뜹니다");
await m.evaluate(() => { const d = document.getElementById('mycode'); d.open = true; d.scrollIntoView({ block: 'center' }); });
await m.fill('#cold', '1339'); await m.fill('#cnew', 'my-code-77');
await shot(3, m, '#mycode', "'내 발행 코드 만들기'에서 1339를 나만의 코드로 바꿉니다. 잊으면 이메일로 확인 번호를 받아 새로 정합니다", { click: false });
await m.evaluate(() => { document.getElementById('mycode').open = false; document.querySelector('.pub').scrollIntoView({ block: 'center' }); });
await m.click('#showkey'); await m.waitForTimeout(300);
await shot(3, m, '#keybox', "'수정 열쇠 보기' — 다른 PC에서 고칠 동료에게만 알려 줍니다", { click: false });
// 다른 PC 상황: 새 창에서 연결
const m2ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); await stub(m2ctx);
const m2 = await m2ctx.newPage(); await m2.goto('http://localhost:8931/maker.html', { waitUntil: 'domcontentloaded' }); await m2.waitForTimeout(1200);
await m2.evaluate(() => { const d = document.getElementById('attach'); d.open = true; d.scrollIntoView({ block: 'center' }); });
await m2.fill('#aslug', SLUG); await m2.fill('#atok', KEY);
await shot(3, m2, '#attach', "다른 PC에서는 '이어서 고치기'에 책 주소 끝부분과 열쇠를 넣고 '연결하기' (내 책이면 열쇠 대신 내 이메일·코드)", { click: false });
await m2ctx.close();

// 4. 회람·의견 (검토자, 폰)
const pctx = await b.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await stub(pctx);
await pctx.addInitScript((s) => { window.EBOOK_BASE = 'https://dxhmprqfgigljgbstqrg.supabase.co/storage/v1/object/public/webbook/' + s + '/index'; }, SLUG);
const ph = await pctx.newPage();
await ph.goto('http://localhost:8931/_demo.html#p1', { waitUntil: 'domcontentloaded' }); await ph.waitForTimeout(900);
await shot(4, ph, null, '검토자는 카톡으로 받은 책 주소를 폰에서 엽니다', { phone: true });
await ph.evaluate(() => { location.hash = '#p4'; }); await ph.waitForTimeout(500);
await shot(4, ph, '.s.on .cbtn', "고칠 곳이 있는 쪽에서 아래 '의견' 단추를 누릅니다", { phone: true, pad: 4, noscroll: true });
await ph.click('.s.on .cbtn'); await ph.waitForTimeout(400);
await ph.fill('#cname', '이자문 · ○○대학교'); await ph.fill('#cbody', '② 초안 공유 시점을 "2주 전"에서 "3주 전"으로 앞당기면 좋겠습니다.');
await shot(4, ph, '#cm .cbox', '이름·소속(필수)과 고칠 내용을 적고 보내기', { phone: true, click: false, noscroll: true });
await ph.click('#csend'); await ph.waitForTimeout(500);
await shot(4, ph, '#toast', '보낸 의견은 담당자에게 바로 모입니다', { phone: true, click: false, wait: 100, noscroll: true });
const rv = await ctx.newPage(); await rv.goto(`http://localhost:8931/review.html?slug=${SLUG}`, { waitUntil: 'domcontentloaded' }); await rv.waitForTimeout(900);
await shot(4, rv, '#ro', "검토자끼리는 '의견 보기' 주소(읽기 전용)로 서로의 의견을 봅니다", { click: false });
await rv.close();

// 5. 반영
const ow = await ctx.newPage(); await ow.goto(`http://localhost:8931/review.html?slug=${SLUG}&token=${KEY}`, { waitUntil: 'domcontentloaded' }); await ow.waitForTimeout(900);
await shot(5, ow, '.pg', "담당자는 제작기 발행 결과의 '의견 모아보기'에서 쪽 순서로 확인합니다", { click: false });
await m.bringToFront();
await m.evaluate(() => { const t = document.getElementById('md'); t.value = t.value.replace('다음 회의 2주 전까지 공유', '다음 회의 ++3주 전까지++ 공유'); t.dispatchEvent(new Event('input', { bubbles: true })); const i = t.value.indexOf('++3주'); t.focus(); t.setSelectionRange(i, i + 11); const line = t.value.slice(0, i).split('\n').length; t.scrollTop = Math.max(0, (line - 6) * 20); });
await m.waitForTimeout(1600);
await shot(5, m, '#md', '원고를 고치고, 바뀐 곳을 ++ ++ 로 감쌉니다 (다음 차수는 +++ +++)', { click: false });
await pvGo(4); await m.waitForTimeout(700);
await shot(5, m, '#pv', '미리보기에 바뀐 곳이 노란 바탕으로 보입니다 (+++ 는 초록)', { click: false });
await shot(5, m, '#pubb', "'다시 발행 (같은 주소)' — 주소는 그대로, 내용만 바뀝니다");
await ow.bringToFront();
await ow.selectOption('.c select', 'done'); await ow.fill('.c .st input', '"3주 전까지"로 고쳤습니다.');
await shot(5, ow, '.c .st', "의견마다 '반영'과 한 줄 답변을 저장 → 검토자가 책 안 의견 창에서 그대로 봅니다", { click: false });
await ow.click('.c .save'); await ow.waitForTimeout(500);
await shot(5, ow, '#next', "반영을 마치면 '다음 차수 회람 시작' → 이후 의견은 2차로 구분됩니다");

// 6. 최종본
await m.bringToFront();
await m.check('#fin'); await m.waitForTimeout(1400); await pvGo(4); await m.waitForTimeout(600);
await shot(6, m, '#fin', "의견이 더 없으면 '최종본'을 켭니다");
await shot(6, m, '#pv', '바뀐 곳 표시만 빠지고 글은 그대로입니다', { click: false });
await shot(6, m, '#pubb', "'다시 발행' → 같은 주소가 최종본으로 바뀝니다");
const pk = await ctx.newPage(); await pk.goto('http://localhost:8931/_demo.html#p1', { waitUntil: 'domcontentloaded' }); await pk.waitForTimeout(800);
await pk.click('#mbtn'); await pk.waitForTimeout(300);
await shot(6, pk, '#mlist', "PDF는 책 오른쪽 위 'PDF' 단추 → '인쇄로 PDF 저장'", { click: false });
await pk.close();
await ow.bringToFront(); await ow.reload({ waitUntil: 'domcontentloaded' }); await ow.waitForTimeout(900);
await shot(6, ow, '#prt', "의견 모아보기 '반영표 인쇄' → 검토 의견 반영표를 PDF로 저장");
const [pop] = await Promise.all([ctx.waitForEvent('page'), ow.evaluate(() => { const o = window.open; window.open = function () { const w = o.apply(window, arguments); if (w) w.print = () => {}; return w; }; document.getElementById('prt').click(); })]);
await pop.waitForLoadState(); await pop.waitForTimeout(600);
await shot(6, pop, 'table', '원고(.md)·PDF·반영표를 과 공유폴더 한 곳에 보관하면 끝', { click: false, pad: 4 });

writeFileSync(H + '/steps.json', JSON.stringify(steps, null, 1));
console.log(Object.entries(steps).map(([k, v]) => k + ':' + v.length + (v.some(s => !s.rect && s.click) ? '!' : '')).join(' '), 'comments', comments.length);
await b.close();
