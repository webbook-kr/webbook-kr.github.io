// 빵캘 수집기 — 보건의료 기관들의 행사 공고를 모아 bbang-calender/data/events.json 으로 만듭니다.
//   node scripts/bbang-calender/collect.mjs            (전부)
//   node scripts/bbang-calender/collect.mjs --only snu-health
//   node scripts/bbang-calender/collect.mjs --dry      (파일에 쓰지 않고 결과만 봅니다)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { clean, decode, looksLikeEvent, isHealthTopic, extractDate, extractPlace, matchOrg, matchOrgs, dropRegistrationLines, ORG_ALIASES } from './parse.mjs';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const DATA = path.join(ROOT, 'bbang-calender', 'data');
const UA = 'Mozilla/5.0 (compatible; BbangCal/1.0; +https://epibrief.github.io/bbang-calender/)';
const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const DRY = args.includes('--dry');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { tries = 2, timeout = 20000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = AbortSignal.timeout(timeout);
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' }, signal: ctl, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const head = buf.subarray(0, 2048).toString('latin1');
      const cs = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1]
        || head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8';
      return new TextDecoder(cs.toLowerCase() === 'ks_c_5601-1987' ? 'euc-kr' : cs, { fatal: false }).decode(buf);
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr;
}

const abs = (href, base) => { try { return new URL(decode(href), base).href; } catch { return null; } };
const uid = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

/* ── 수집 어댑터 ───────────────────────────────────────── */

// 서울대 보건대학원 세미나정보 (KBoard). 여러 기관 행사가 한곳에 모입니다.
async function kboard(feed, orgs) {
  const items = [];
  for (let page = 1; page <= (feed.pages || 1); page++) {
    const url = feed.url + (feed.url.includes('?') ? '&' : '?') + `mod=list&pageid=${page}`;
    const html = await get(url);
    const lis = html.split(/<li class="/).slice(1);
    for (const li of lis) {
      if (li.startsWith('notice')) continue;
      const href = li.match(/<a href="([^"]+)"/)?.[1];
      const title = clean(li.match(/<div class="cut-strings">([\s\S]*?)<\/div>/)?.[1] || '');
      const posted = li.match(/<span class="date">\s*([\d-]{8,10})\s*<\/span>/)?.[1] || null;
      if (!href || !title) continue;
      items.push({ title, url: abs(href, feed.url), postedAt: posted });
    }
    await sleep(800);
  }
  return items;
}

// NKIS 정책세미나안내 — 제목·일정·주관기관·장소가 칸으로 나뉘어 있어 값이 정확합니다.
async function nkis(feed) {
  const items = [];
  for (let page = 1; page <= (feed.pages || 1); page++) {
    const url = feed.url + `&pageIndex=${page}`;
    const html = await get(url);
    // 첫 표는 기관 고르기 칸입니다. 날짜가 든 표를 골라야 합니다.
    const body = [...html.matchAll(/<tbody[\s\S]*?<\/tbody>/gi)]
      .map((m) => m[0])
      .filter((b) => /20\d{2}[-.]\d{1,2}[-.]\d{1,2}/.test(b))
      .sort((a, b) => (b.match(/<tr/gi) || []).length - (a.match(/<tr/gi) || []).length)[0];
    if (!body) break;
    for (const tr of body.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const tds = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map((td) => clean(td));
      if (tds.length < 5) continue;
      const [, title, schedule, orgText, placeText] = tds;
      if (!title) continue;
      const href = tr.match(/<a[^>]+href="(?!javascript)([^"]+)"/i)?.[1];
      items.push({
        title,
        url: href ? abs(href, feed.url) : feed.url,
        postedAt: null,
        scheduleText: schedule.replace(/\s+/g, ' '),
        orgText,
        placeText
      });
    }
    await sleep(800);
  }
  return items;
}

// 일반 게시판 — 목록 상자 이름이 기관마다 달라, 글줄을 하나씩 훑어 게시글만 골라냅니다.
async function generic(feed) {
  const html = await get(feed.url);
  const rows = html.match(/<tr[\s\S]{0,5000}?<\/tr>|<li[\s\S]{0,5000}?<\/li>/gi) || [];
  const items = [];
  const seen = new Set();
  for (const row of rows) {
    const a = row.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const title = clean(a[2])
      .split('\n')[0]
      .replace(/^\s*(?:새글|NEW|공지|새로운게시물|답변)\s*/i, '')
      .trim();
    if (title.length < 12 || title.length > 180) continue;
    if (seen.has(title)) continue;

    // 메뉴 글자가 아니라 게시글 줄인지 살핍니다. 날짜나 조회수가 붙어 있거나 제목이 깁니다.
    const rowText = clean(row);
    const posted = rowText.match(/(20\d{2})[.\-](\d{1,2})[.\-](\d{1,2})/);
    if (!posted && !/조회|등록일|작성일|게시일/.test(rowText) && title.length < 20) continue;

    const href = decode(a[1]);
    const url = /^(?:#|javascript:)/i.test(href) ? feed.url : abs(href, feed.url);
    if (!url) continue;
    seen.add(title);
    items.push({
      title,
      url,
      postedAt: posted ? `${posted[1]}-${String(posted[2]).padStart(2, '0')}-${String(posted[3]).padStart(2, '0')}` : null
    });
  }
  return items;
}

const ADAPTERS = { kboard, nkis, generic };

/* ── 본문 읽어 일시·장소 보강 ──────────────────────────── */
async function enrich(item) {
  if (!item.url) return item;
  try {
    const html = await get(item.url, { tries: 2, timeout: 15000 });
    // 게시판마다 본문 상자 이름이 달라, 제목이 나온 자리부터 읽는 편이 확실합니다.
    const known = html.match(/<div class="content-view">([\s\S]*?)<div class="document-navi"/)?.[1];
    if (known) {
      item.body = clean(known).slice(0, 4000);
    } else {
      const text = clean(html);
      const key = item.title.replace(/\s+/g, ' ').slice(0, 18);
      // 제목은 페이지 맨 위(브라우저 제목)에도 나옵니다. 마지막에 나온 자리가 본문입니다.
      const at = key.length > 6 ? text.lastIndexOf(key) : -1;
      item.body = (at >= 0 ? text.slice(at, at + 3500) : text.slice(0, 3500));
    }
  } catch { /* 본문을 못 읽어도 제목만으로 진행합니다 */ }
  await sleep(700);
  return item;
}

/* ── 메인 ──────────────────────────────────────────────── */
async function main() {
  const conf = JSON.parse(await fs.readFile(path.join(DATA, 'sources.json'), 'utf8'));
  const orgs = conf.orgs;

  let previous = { events: [] };
  try { previous = JSON.parse(await fs.readFile(path.join(DATA, 'events.json'), 'utf8')); } catch { /* 처음 실행 */ }

  let overrides = [];
  try { overrides = JSON.parse(await fs.readFile(path.join(DATA, 'overrides.json'), 'utf8')); } catch { /* 없어도 됩니다 */ }

  let manual = [];
  try { manual = JSON.parse(await fs.readFile(path.join(DATA, 'manual.json'), 'utf8')); } catch { /* 없어도 됩니다 */ }

  const status = [];
  const collected = [];

  const feeds = conf.feeds.filter((f) => f.enabled !== false && (!ONLY || f.id === ONLY));

  async function runFeed(feed) {
    const t0 = Date.now();
    try {
      const raw = await (ADAPTERS[feed.adapter] || generic)(feed, orgs);
      const candidates = raw.filter((r) => looksLikeEvent(r.title));
      const bodyCap = feed.fetchBody === false ? 0 : (feed.adapter === 'kboard' ? 40 : 15);
      for (const c of candidates.slice(0, bodyCap)) await enrich(c);

      let made = 0;
      for (const c of candidates) {
        // 제목에 적힌 날짜를 가장 믿습니다. 없으면 목록의 일정 칸, 그 다음이 본문입니다.
        const head = dropRegistrationLines([c.scheduleText || '', c.title].join('\n'));
        const bodyText = dropRegistrationLines(c.body || '');
        const fromHead = extractDate(head, c.postedAt, { loose: true });
        const fromBody = extractDate(bodyText, c.postedAt);
        let when = fromHead || fromBody;
        if (!when) continue;
        // 제목은 날짜만, 본문은 기간과 시간까지 적는 일이 많습니다. 같은 날이면 본문에서 보탭니다.
        if (fromHead && fromBody && fromBody.start === fromHead.start) {
          when = { ...fromHead, end: fromBody.end > fromHead.end ? fromBody.end : fromHead.end,
                   startTime: fromHead.startTime || fromBody.startTime,
                   endTime: fromHead.endTime || fromBody.endTime };
          when.allDay = !when.startTime;
        }
        // 주최 기관은 '주최 :' 라고 적힌 줄과 제목에서만 찾습니다.
        // 게시판 메뉴나 발표자 소속까지 읽으면 엉뚱한 기관이 주최로 붙습니다.
        const hostLines = (c.body || '')
          .split('\n')
          .filter((l) => /(주\s*최|주\s*관|공동\s*주최|공동\s*주관|공동\s*개최)/.test(l))
          .slice(0, 4)
          .join('\n');
        const hostHay = [c.orgText || '', c.title, hostLines].join('\n');
        let orgIds = matchOrgs(hostHay, orgs, ORG_ALIASES);
        if (!orgIds.length) {
          // 주최 줄이 없으면 본문 첫머리에서 가장 먼저 나온 기관 '하나만' 봅니다.
          // 여럿을 받으면 게시판 메뉴나 발표자 소속까지 주최로 붙습니다.
          const first = matchOrgs([c.orgText || '', c.title].join(' '), orgs, ORG_ALIASES)[0]
            || matchOrgs((c.body || '').slice(0, 400), orgs, ORG_ALIASES)[0];
          orgIds = first ? [first] : (feed.org ? [feed.org] : []);
        }
        const orgId = orgIds[0] || 'etc';
        // 여러 분야가 섞인 수집원은 보건의료 행사만 받습니다.
        if (feed.healthOnly && orgId === 'etc' && !isHealthTopic(c.title + ' ' + (c.orgText || ''))) continue;
        const bracket = c.title.match(/[\[【]\s*([^\]】]{2,40})\s*[\]】]/)?.[1] || null;
        // 게시판에 따라 목록 링크 안에 본문 첫 줄까지 들어 있습니다. 첫 줄만 제목으로 씁니다.
        let title = c.title.split('\n')[0].trim();
        for (let i = 0; i < 3; i++) {
          const before = title;
          title = title
            .replace(/^\s*[★☆●▶◆■]+\s*/, '')
            .replace(/^\s*사전\s*(?:신청|등록)\s*(?:필요|필수)\s*[-–,]?\s*/, '')
            .replace(/^\s*[\[(（][^\])）]{1,40}[\])）]\s*/, '')
            .replace(/^\s*\d{1,2}\s*[./월]?\s*\d{0,2}\s*일?\s*(?:\(\s*[월화수목금토일]\s*\))?\s*[,·\-~]+\s*/, '')
            .replace(/^[\s,·\-~]+/, '');
          if (title === before) break;
        }
        title = title.trim().slice(0, 140) || c.title.slice(0, 140);
        collected.push({
          id: uid(title + '|' + when.start),
          org: orgId,
          orgs: orgIds.length > 1 ? orgIds : undefined,
          orgLabel: c.orgText || (orgId === 'etc' ? bracket : null),
          title,
          start: when.start,
          end: when.end,
          startTime: when.startTime,
          endTime: when.endTime,
          allDay: when.allDay,
          place: c.placeText || extractPlace(c.body || c.title),
          url: c.url,
          source: feed.id,
          collectedAt: new Date().toISOString().slice(0, 10)
        });
        made++;
      }
      status.push({ id: feed.id, name: feed.name, ok: true, found: raw.length, events: made, ms: Date.now() - t0 });
      console.log(`[OK] ${feed.name}: 글 ${raw.length}건 → 행사 ${made}건`);
    } catch (e) {
      status.push({ id: feed.id, name: feed.name, ok: false, error: String(e.message || e), ms: Date.now() - t0 });
      console.log(`[실패] ${feed.name}: ${e.message || e}`);
    }
  }

  const queue = [...feeds];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await runFeed(queue.shift());
  }));

  // 이전 결과 + 이번 결과 + 손으로 넣은 것을 합칩니다. 수집이 실패해도 예전 일정은 남습니다.
  // 같은 제목·같은 날짜면 같은 행사입니다. 주최 기관을 다시 읽어도 둘로 갈라지지 않습니다.
  const keyOf = (e) => uid(e.title + '|' + e.start);
  const byId = new Map();
  for (const e of previous.events || []) {
    const k = keyOf(e);
    byId.set(k, { ...e, id: k });
  }
  for (const e of collected) byId.set(e.id, { ...byId.get(e.id), ...e });
  for (const e of manual) {
    const id = e.id || uid(e.title + '|' + e.start);
    byId.set(id, { org: 'etc', allDay: true, source: 'manual', ...e, id, manual: true });
  }

  // 손으로 바로잡을 것이 있으면 여기서 덮어씁니다. 포스터에만 적힌 공동 주최 같은 것입니다.
  for (const rule of overrides) {
    if (!rule || !rule.match) continue;
    for (const e of byId.values()) {
      if (!e.title || !e.title.includes(rule.match)) continue;
      const { match, ...patch } = rule;
      Object.assign(e, patch);
      if (patch.orgs && patch.orgs.length) e.org = patch.orgs[0];
    }
  }

  // 지난 행사는 60일까지만 남깁니다.
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const events = [...byId.values()]
    .filter((e) => e.start && (e.end || e.start) >= cutoff)
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  const out = {
    name: '빵캘',
    updatedAt: new Date().toISOString(),
    counts: { total: events.length, upcoming: events.filter((e) => (e.end || e.start) >= new Date().toISOString().slice(0, 10)).length },
    sources: status,
    events
  };

  if (DRY) { console.log(JSON.stringify(out, null, 2).slice(0, 3000)); return; }
  await fs.writeFile(path.join(DATA, 'events.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\n저장: bbang-calender/data/events.json (행사 ${events.length}건, 앞으로 열릴 행사 ${out.counts.upcoming}건)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
