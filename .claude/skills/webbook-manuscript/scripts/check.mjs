#!/usr/bin/env node
// 웹북 원고 검산기.
//   node check.mjs 원고.md
// 제작기(maker.html)의 쪽 나눔 규칙을 그대로 흉내 내서 장·쪽 수를 세고,
// 제작기가 못 알아듣는 표기를 찾아낸다. 눈으로 세는 것보다 빠르고 안 틀린다.

import { readFileSync } from 'node:fs';

const LIMIT = 900; // maker.html 과 같은 값. 한 쪽에 들어갈 글자 수 어림치

const path = process.argv[2];
if (!path) {
  console.error('쓰는 법: node check.mjs 원고.md');
  process.exit(2);
}

let text = readFileSync(path, 'utf8').replace(/\r/g, '');

// 파일 맨 위에 "책 제목:" 같은 제작기 입력값이 있으면 본문에서 뺀다.
const meta = {};
text = text.replace(/^(?:(?:책 제목|글쓴이|부제|표지 그림|날짜)\s*:.*\n)+\s*\n/, (m) => {
  for (const line of m.trim().split('\n')) {
    const [k, ...v] = line.split(':');
    meta[k.trim()] = v.join(':').trim();
  }
  return '';
});

const lines = text.split('\n');

// ── 블록 길이 어림 (maker.html blocks() 의 len 과 같은 기준) ──────────
function blockLens(body) {
  const out = [];
  let i = 0;
  const L = body;
  while (i < L.length) {
    const s = L[i];
    if (!s.trim()) { i++; continue; }
    if (/^```/.test(s)) {
      const c = []; i++;
      while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]);
      i++;
      out.push(c.join('\n').length * 1.3 + 40); continue;
    }
    if (/^>\s?/.test(s)) {
      const q = [];
      while (i < L.length && /^>\s?/.test(L[i])) q.push(L[i++].replace(/^>\s?/, ''));
      out.push(q.join(' ').length + 60); continue;
    }
    if (/^:::\s?/.test(s)) { out.push(s.length + 40); i++; continue; }
    if (/^(발표자|연사|speaker)\s*[:：]/i.test(s)) { out.push(70); i++; continue; }
    if (/^qr:\s*\S/i.test(s)) {
      const q = s.replace(/^qr:\s*/i, '').split('|');
      out.push(340 + (q[1] ? q[1].length + 60 : 0) + (q[2] ? q[2].length : 0)); i++; continue;
    }
    if (/^(핵심|요점|결론)\s*[:：]/.test(s)) { out.push(s.length + 70); i++; continue; }
    if (/^Q\s*[:：]/i.test(s)) {
      let n = 0; const start = i;
      i++;
      while (i < L.length && L[i].trim() && !/^(A\s*[:：]|Q\s*[:：]|#|##|---)/i.test(L[i])) i++;
      if (i < L.length && /^A\s*[:：]/i.test(L[i])) {
        i++;
        while (i < L.length && L[i].trim() && !/^(A\s*[:：]|Q\s*[:：]|#|##|---)/i.test(L[i])) i++;
      }
      for (let k = start; k < i; k++) n += L[k].length;
      out.push(n + 110); continue;
    }
    if (/^(\d{1,2}:\d{2}(?::\d{2})?)\s+\S/.test(s)) {
      let rows = 0;
      while (i < L.length && /^(\d{1,2}:\d{2}(?::\d{2})?)\s+\S/.test(L[i])) { rows++; i++; }
      out.push(rows * 46 + 30); continue;
    }
    if (/^[-*]\s+/.test(s)) {
      let n = 0;
      while (i < L.length && /^[-*]\s+/.test(L[i])) n += L[i++].length;
      out.push(n); continue;
    }
    if (/^\d+[.)]\s+/.test(s)) {
      let n = 0;
      while (i < L.length && /^\d+[.)]\s+/.test(L[i])) n += L[i++].length;
      out.push(n); continue;
    }
    if (/^\|/.test(s)) {
      let rows = 0;
      while (i < L.length && /^\|/.test(L[i])) { if (!/^\|\s*:?-+/.test(L[i])) rows++; i++; }
      out.push(rows * 70 + 40); continue;
    }
    if (/^!\[([^\]]*)\]\(([^)\s]+)\)/.test(s)) { out.push(420); i++; continue; }
    if (/^youtube:\s*\S/i.test(s) || /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(s.trim())) {
      out.push(380); i++; continue;
    }
    const STOP = /^(#|##|---|>|:::|[-*]\s|\d+[.)]\s|\||!\[|```|youtube:|qr:|Q\s*[:：]|A\s*[:：]|발표자\s*[:：]|연사\s*[:：]|speaker\s*[:：]|핵심\s*[:：]|요점\s*[:：]|결론\s*[:：]|\d{1,2}:\d{2}(?::\d{2})?\s+\S|https?:\/\/(www\.)?(youtube\.com|youtu\.be))/i;
    const p = [s]; i++;
    while (i < L.length && L[i].trim() && !STOP.test(L[i])) p.push(L[i++]);
    out.push(p.join('\n').length);
  }
  return out;
}

// ── 장·쪽으로 가른다 (maker.html parse() 와 같은 규칙) ────────────────
const chapters = [];
let ch = null, sec = null, buf = [], forced = false;
const pushSec = (title, line) => { sec = { title, line, groups: [[]] }; ch.secs.push(sec); };
function flush() {
  if (!buf.length) return;
  if (!buf.some((x) => x.trim())) { buf = []; return; } // maker.html 과 같은 규칙
  if (!ch) { ch = { title: '', line: 0, secs: [] }; chapters.push(ch); }
  if (!sec) pushSec('', 0);
  if (forced) { sec.groups.push([]); forced = false; }
  sec.groups[sec.groups.length - 1].push(...buf);
  buf = [];
}
let skipTo = -1, fence = false;
lines.forEach((s, n) => {
  if (n <= skipTo) return;                       // 장 표지로 빨려 들어간 그림 줄
  if (/^```/.test(s)) { fence = !fence; buf.push(s); return; } // ``` 안의 # 은 예시 글자
  if (fence) { buf.push(s); return; }
  if (/^#\s+/.test(s)) {
    flush();
    ch = { title: s.replace(/^#\s+/, '').split('|')[0].trim(), line: n + 1, secs: [] };
    chapters.push(ch); sec = null;
    // 장 제목 바로 다음(빈 줄 건너뛰고)이 그림이면 제작기가 장 표지에 넣는다
    let j = n + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.test(lines[j])) skipTo = j;
    return;
  }
  if (/^##\s+/.test(s)) { flush(); if (!ch) { ch = { title: '', line: n + 1, secs: [] }; chapters.push(ch); } pushSec(s.replace(/^##\s+/, '').trim(), n + 1); return; }
  if (/^---\s*$/.test(s)) { flush(); forced = true; return; }
  buf.push(s);
});
flush();

// ── 쪽 수 세기 ─────────────────────────────────────────────────────
let bodyPages = 0;
const over = [];
for (const c of chapters) {
  if (c.title) bodyPages++; // 장 표지
  for (const sc of c.secs) {
    let made = 0, total = 0;
    for (const g of sc.groups) {
      const lens = blockLens(g);
      total += lens.reduce((a, b) => a + b, 0);
      let cur = 0, len = 0;
      for (const b of lens) {
        if (cur && len + b > LIMIT) { made++; cur = 0; len = 0; }
        cur++; len += b;
      }
      if (cur || !made) made++;
    }
    bodyPages += made;
    if (made > 1) over.push({ title: sc.title || '(제목 없는 쪽)', line: sc.line, size: Math.round(total), made });
  }
}
const totalPages = bodyPages + 3; // 표지 + 차례 + 마지막 쪽

// ── 못 알아듣는 표기 찾기 ───────────────────────────────────────────
const problems = [];
let pf = false;
lines.forEach((s, n) => {
  const at = n + 1;
  if (/^```/.test(s)) { pf = !pf; return; }
  if (pf) return;                                // 코드 덩어리 안은 그대로 나가므로 검사하지 않는다
  if (/^#{3,}\s+/.test(s)) problems.push([at, '### 이하 제목은 제작기가 못 읽는다. ## 로 올리거나 **굵게** 로 바꿀 것', s]);
  if (/(^|[^*])\*[^*\s][^*]*\*([^*]|$)/.test(s)) problems.push([at, '*한 별표* 이탤릭은 지원 안 된다. **두 별표** 로 바꿀 것', s]);
  if (/^\s+[-*]\s+/.test(s)) problems.push([at, '겹친 목록은 한 단계만 된다. 들여쓰기를 없앨 것', s]);
  if (/^\s*[-*]\s*\[[ xX]\]/.test(s)) problems.push([at, '체크박스는 지원 안 된다', s]);
  if (/^##?\s+(차례|목차|표지|contents?|목록)\s*$/i.test(s)) problems.push([at, '차례와 표지는 제작기가 자동으로 만든다. 지울 것', s]);
  if (/^A\s*[:：]/i.test(s) && n > 0 && !lines[n - 1].trim()) problems.push([at, 'A: 앞에 빈 줄이 있으면 질문과 따로 논다. 붙여 쓸 것', s]);
  if (/^youtube:\s*$/i.test(s)) problems.push([at, 'youtube: 뒤에 영상 ID 가 없다', s]);
});
const noChapter = chapters.filter((c) => c.title).length === 0;
if (noChapter) problems.push([0, '# 으로 시작하는 장이 하나도 없다. 차례가 비어 버린다', '']);

// ── 보고 ───────────────────────────────────────────────────────────
const chCount = chapters.filter((c) => c.title).length;
console.log('── 원고 검산 ──────────────────────────────');
for (const [k, v] of Object.entries(meta)) console.log(`${k}: ${v}`);
console.log(`장 ${chCount}개 · 쪽 약 ${totalPages}쪽 (표지·차례·끝 포함)`);
console.log('');
for (const c of chapters) {
  if (!c.title) continue;
  const named = c.secs.filter((sc) => sc.title || sc.groups.some((g) => g.some((x) => x.trim())));
  console.log(`# ${c.title}`);
  for (const sc of named) console.log(`   ## ${sc.title || '(제목 없는 쪽)'}`);
}
console.log('');

if (over.length) {
  console.log('▲ 900자를 넘겨서 "(계속)" 쪽이 생기는 곳');
  for (const o of over) console.log(`   ${o.line}줄  ## ${o.title}  약 ${o.size}자 → ${o.made}쪽으로 쪼개짐`);
  console.log('   내용을 나누고 각각 ## 제목을 붙이면 깔끔해진다.');
  console.log('');
}

if (problems.length) {
  console.log('✗ 고쳐야 할 표기');
  for (const [at, why, s] of problems) {
    console.log(`   ${at ? at + '줄' : '전체'}  ${why}`);
    if (s) console.log(`         ${s.slice(0, 60)}`);
  }
  console.log('');
  process.exit(1);
}

console.log('✓ 제작기가 못 읽는 표기는 없다.');
if (!over.length) console.log('✓ 900자를 넘는 쪽도 없다.');
