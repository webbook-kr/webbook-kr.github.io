// 빵캘 — events.json 을 구글 캘린더가 읽을 수 있는 .ics 파일로 굽습니다.
//   node scripts/bbang-calender/ics.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const DATA = path.join(ROOT, 'bbang-calender', 'data');
const OUT = path.join(ROOT, 'bbang-calender', 'ics');
const SITE = 'https://epibrief.github.io/bbang-calender/';

const pad = (n) => String(n).padStart(2, '0');
const compact = (isoDate) => isoDate.replace(/-/g, '');

// 캘린더 규격은 한 줄을 75바이트로 접습니다.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 73) return line;
  const out = [];
  let cur = Buffer.alloc(0);
  for (const ch of [...line]) {
    const b = Buffer.from(ch, 'utf8');
    if (cur.length + b.length > 71) { out.push(cur.toString('utf8')); cur = Buffer.alloc(0); }
    cur = Buffer.concat([cur, b]);
  }
  out.push(cur.toString('utf8'));
  return out.map((s, i) => (i ? ' ' + s : s)).join('\r\n');
}

const esc = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function vevent(e, orgName) {
  const lines = [];
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${e.id}@bbangcal.epibrief.github.io`);
  lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`);
  const multiDay = e.end && e.end !== e.start;
  // 이틀 넘게 이어지는 행사는 날짜 칸으로 그려야 달력에서 제대로 보입니다.
  if (e.allDay || !e.startTime || multiDay) {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${compact(addDays(e.end || e.start, 1))}`);
  } else {
    const [sh, sm] = e.startTime.split(':');
    const endTime = e.endTime || `${pad(Math.min(23, +sh + 2))}:${sm}`;
    const [eh, em] = endTime.split(':');
    lines.push(`DTSTART;TZID=Asia/Seoul:${compact(e.start)}T${sh}${sm}00`);
    lines.push(`DTEND;TZID=Asia/Seoul:${compact(e.start)}T${eh}${em}00`);
  }
  lines.push(`SUMMARY:${esc(`[${orgName}] ${e.title}`)}`);
  if (e.place) lines.push(`LOCATION:${esc(e.place)}`);
  const desc = [e.orgLabel ? `주최: ${e.orgLabel}` : `주최: ${orgName}`, e.url ? `원문: ${e.url}` : '', `빵캘: ${SITE}`]
    .filter(Boolean).join('\n');
  lines.push(`DESCRIPTION:${esc(desc)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

// 서울 시간대 정의. 1988년 이후로 서머타임이 없어 고정 +09:00 입니다.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'X-LIC-LOCATION:Asia/Seoul',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900',
  'TZNAME:KST', 'DTSTART:19700101T000000', 'END:STANDARD', 'END:VTIMEZONE'
].join('\r\n');

function calendar(name, events, orgName) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//빵캘//보건의료 일정 달력//KO',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${name}`), 'X-WR-TIMEZONE:Asia/Seoul',
    fold('X-WR-CALDESC:보건의료 공공기관과 학회의 공청회·세미나·학술대회 일정. ' + SITE),
    VTIMEZONE,
    ...events.map((e) => vevent(e, orgName(e))),
    'END:VCALENDAR', ''
  ].join('\r\n');
}

async function main() {
  const conf = JSON.parse(await fs.readFile(path.join(DATA, 'sources.json'), 'utf8'));
  const db = JSON.parse(await fs.readFile(path.join(DATA, 'events.json'), 'utf8'));
  const orgById = Object.fromEntries(conf.orgs.map((o) => [o.id, o]));
  const hosts = (e) => (e.orgs && e.orgs.length ? e.orgs : [e.org]);
  const orgName = (e) => hosts(e).map((id) => orgById[id]?.name).filter(Boolean).join('·') || '기타';

  await fs.mkdir(OUT, { recursive: true });
  const written = [];

  await fs.writeFile(path.join(OUT, 'all.ics'), calendar('빵캘 · 보건의료 전체 일정', db.events, orgName));
  written.push('all.ics');

  for (const o of conf.orgs) {
    const list = db.events.filter((e) => (e.orgs && e.orgs.length ? e.orgs : [e.org]).includes(o.id));
    if (!list.length) continue;
    await fs.writeFile(path.join(OUT, `${o.id}.ics`), calendar(`빵캘 · ${o.name}`, list, orgName));
    written.push(`${o.id}.ics`);
  }

  for (const c of conf.categories) {
    const ids = new Set(conf.orgs.filter((o) => o.category === c.id).map((o) => o.id));
    const list = db.events.filter((e) => (e.orgs && e.orgs.length ? e.orgs : [e.org]).some((id) => ids.has(id)));
    if (!list.length) continue;
    await fs.writeFile(path.join(OUT, `cat-${c.id}.ics`), calendar(`빵캘 · ${c.name}`, list, orgName));
    written.push(`cat-${c.id}.ics`);
  }

  console.log(`구운 달력 ${written.length}개: ${written.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
