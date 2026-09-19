// 빵캘 — 한국어 공고문에서 행사 날짜와 주최기관을 뽑아내는 도구
// 바깥 라이브러리 없이 동작합니다. (Node 18 이상)

export const EVENT_WORDS = [
  '공청회', '토론회', '공개토론', '세미나', '심포지엄', '심포지움', '학술대회', '학술회의',
  '포럼', '컨퍼런스', '콘퍼런스', '워크숍', '워크샵', '설명회', '간담회', '연수교육',
  '발표회', '공개회의', '정책세미나', '학술세미나', '초청강연', '콜로키움'
];

const NOISE_WORDS = [
  '채용', '입찰', '공고문 정정', '결과 발표', '낙찰', '계약', '모집공고', '구인',
  '개인정보', '청렴', '고시', '입법예고', '규격공개', '논문공모', '초록접수', '논문 공모'
];

// 등록·접수·마감 날짜가 행사 날짜로 잘못 잡히지 않도록 그 대목을 먼저 지웁니다.
const REG_WORDS = /(사전등록|사전 등록|등록기간|등록 기간|접수|마감|신청기간|신청 기간|공모|초록|납부|문의|등록일|작성일|게시일|수정일|조회수)/;
export function dropRegistrationLines(text) {
  return String(text || '')
    .replace(/[(（][^)）]{0,60}?(사전등록|등록|접수|마감|신청|공모|초록)[^)）]{0,60}[)）]/g, ' ')
    .split(/\n/)
    .filter((line) => !(REG_WORDS.test(line) && /\d/.test(line)))
    .join('\n');
}

// 여러 분야가 섞인 수집원에서는 보건의료 행사만 골라야 합니다.
const HEALTH_WORDS = [
  '보건', '의료', '건강', '질병', '감염', '방역', '백신', '역학', '간호', '의약', '약제', '약물',
  '환자', '병원', '의원', '치료', '진료', '돌봄', '요양', '정신건강', '자살예방', '장애', '고령',
  '노인', '복지', '흡연', '금연', '음주', '영양', '식품안전', '임상', '수가', '급여', '의과학',
  '헬스', '메디', '보건의료', '공중보건', '재활', '검진', '암', '치매'
];
export function isHealthTopic(text) {
  const t = String(text || '');
  return HEALTH_WORDS.some((w) => t.includes(w));
}

export function looksLikeEvent(title) {
  const t = String(title || '');
  if (!EVENT_WORDS.some((w) => t.includes(w))) return false;
  if (NOISE_WORDS.some((w) => t.includes(w))) return false;
  return true;
}

export function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

export function decode(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/ /g, ' ');
}

export function clean(text) {
  return decode(stripTags(text)).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function validDate(y, m, d) {
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 게시일을 기준으로 연도가 없는 날짜의 연도를 추정합니다.
// 공고는 앞일을 알리는 글이라, 게시일보다 두 달 넘게 이른 날짜면 다음 해로 봅니다.
function guessYear(month, day, postedISO) {
  const base = postedISO ? new Date(`${postedISO}T00:00:00Z`) : new Date();
  let y = base.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day);
  if (candidate < base.getTime() - 62 * 86400000) y += 1;
  return y;
}

const TIME = String.raw`(\d{1,2})\s*[:시]\s*(\d{2})?`;
const DOW = String.raw`\s*\(\s*[월화수목금토일]\s*\)`;

/**
 * 글 한 편에서 행사 기간을 뽑습니다.
 * 반환: { start, end, startTime, endTime, allDay } 또는 null
 */
export function extractDate(text, postedISO, opts = {}) {
  // '일시 :' 라고 적힌 줄이 있으면 그 줄을 먼저 믿습니다. 게시일과 헷갈리지 않습니다.
  if (!opts._inner) {
    const whenLines = String(text || '')
      .split(/\n|\|/)
      .filter((l) => /(일\s*시|일\s*자|개최\s*일시|행사\s*일시|개최\s*일자)\s*[:：]/.test(l) && /\d/.test(l));
    if (whenLines.length) {
      const hit = extractDate(whenLines.join('\n'), postedISO, { ...opts, _inner: true });
      if (hit) return hit;
    }
  }
  const s = decode(String(text || '')).replace(/\s+/g, ' ');

  // 1) 2026.10.15 ~ 2026.10.16 / 2026-10-15 / 2026년 10월 15일
  const full = String.raw`(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?`;
  const mdOnly = String.raw`(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?`;
  const dash = String.raw`\s*(?:~|-|–|—|부터|to)\s*`;

  const found = [];

  // 연도가 있는 범위
  for (const m of s.matchAll(new RegExp(full + dash + '(?:' + full + '|' + mdOnly + '|(\\d{1,2})\\s*일)', 'g'))) {
    const y1 = +m[1], m1 = +m[2], d1 = +m[3];
    let y2, m2, d2;
    if (m[4]) { y2 = +m[4]; m2 = +m[5]; d2 = +m[6]; }
    else if (m[7]) { y2 = y1; m2 = +m[7]; d2 = +m[8]; }
    else { y2 = y1; m2 = m1; d2 = +m[9]; }
    if (validDate(y1, m1, d1) && validDate(y2, m2, d2)) found.push({ start: iso(y1, m1, d1), end: iso(y2, m2, d2) });
  }

  // 연도가 있는 단일 날짜
  if (!found.length) {
    for (const m of s.matchAll(new RegExp(full, 'g'))) {
      const y = +m[1], mo = +m[2], d = +m[3];
      if (validDate(y, mo, d)) found.push({ start: iso(y, mo, d), end: iso(y, mo, d) });
    }
  }

  // 연도가 없는 범위 (9월 17일(목) ~ 18일(금))
  if (!found.length) {
    for (const m of s.matchAll(new RegExp(mdOnly + DOW + '?' + dash + '(?:' + mdOnly + '|(\\d{1,2})\\s*일)', 'g'))) {
      const mo1 = +m[1], d1 = +m[2];
      const mo2 = m[3] ? +m[3] : mo1;
      const d2 = m[3] ? +m[4] : +m[5];
      const y = guessYear(mo1, d1, postedISO);
      const y2 = mo2 < mo1 ? y + 1 : y;
      if (validDate(y, mo1, d1) && validDate(y2, mo2, d2)) found.push({ start: iso(y, mo1, d1), end: iso(y2, mo2, d2) });
    }
  }

  // 연도가 없는 단일 날짜 (10월 2일(금) / 10.02(금))
  if (!found.length) {
    const tail = opts.loose ? '(?:' + DOW + String.raw`|\s*(?=,|$)` + ')' : DOW;
    for (const m of s.matchAll(new RegExp(mdOnly + tail, 'g'))) {
      const mo = +m[1], d = +m[2];
      const y = guessYear(mo, d, postedISO);
      if (validDate(y, mo, d)) found.push({ start: iso(y, mo, d), end: iso(y, mo, d) });
    }
  }

  if (!found.length) return null;

  // 여러 날짜가 잡히면 가장 이른 시작일과 가장 늦은 종료일을 씁니다.
  found.sort((a, b) => a.start.localeCompare(b.start));
  const start = found[0].start;
  let end = found[0].end;
  for (const f of found) if (f.end > end && f.end <= addDays(start, 3)) end = f.end;

  // 시간
  let startTime = null, endTime = null;
  const tRange = s.match(new RegExp(TIME + String.raw`\s*(?:~|-|–|—)\s*` + TIME));
  if (tRange) {
    startTime = `${pad(+tRange[1])}:${tRange[2] || '00'}`;
    endTime = `${pad(+tRange[3])}:${tRange[4] || '00'}`;
  } else {
    const t1 = s.match(new RegExp(String.raw`(?:일시|시간|시작)[^0-9]{0,20}(\d{1,2})\s*[:시]\s*(\d{2})?`));
    const t2 = t1 || s.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (t2) startTime = `${pad(+t2[1])}:${t2[2] || '00'}`;
  }
  const pm = /오후\s*\d{1,2}/.test(s);
  const bump = (t) => {
    if (!t) return t;
    const h = +t.slice(0, 2);
    if (pm && h >= 1 && h <= 7) return `${pad(h + 12)}${t.slice(2)}`;
    return t;
  };
  startTime = bump(startTime);
  endTime = bump(endTime);
  if (startTime && (+startTime.slice(0, 2) > 23)) startTime = null;
  if (endTime && (+endTime.slice(0, 2) > 23)) endTime = null;

  return { start, end, startTime, endTime, allDay: !startTime };
}

export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 제목·본문에서 장소를 한 줄 뽑습니다. */
export function extractPlace(text) {
  const s = decode(String(text || ''));
  const m = s.match(/(?:^|\n|\s)(?:개최\s*장소|행사\s*장소|장\s*소)\s*[:：]\s*([^\n]{2,60})/);
  if (!m) return null;
  const place = m[1].replace(/\s+/g, ' ').replace(/[*·◆■●\-]+$/, '').trim();
  if (!place || place.length < 2) return null;
  if (/\d{1,2}\s*월|\d{1,2}\s*:\s*\d{2}|요일/.test(place)) return null;
  return place;
}

/** 주최기관을 찾습니다. orgs 는 sources.json 의 기관 목록입니다. */
export function matchOrg(text, orgs, aliases = {}) {
  const s = decode(String(text || ''));
  const bracket = s.match(/[\[【(]\s*([^\]】)]{2,30})\s*[\]】)]/);
  const candidates = [bracket ? bracket[1] : '', s];
  for (const c of candidates) {
    if (!c) continue;
    for (const [alias, id] of Object.entries(aliases)) if (c.includes(alias)) return id;
    for (const o of orgs) {
      if (o.id === 'etc') continue;
      if (c.includes(o.name)) return o.id;
    }
  }
  return null;
}

/** 글에 나오는 기관을 모두 찾습니다. 공동 주최를 놓치지 않기 위해서입니다. */
export function matchOrgs(text, orgs, aliases = {}) {
  const s = decode(String(text || ''));
  const found = [];
  const at = {};
  for (const [alias, id] of Object.entries(aliases)) {
    const i = s.indexOf(alias);
    if (i < 0) continue;
    if (at[id] === undefined || i < at[id]) at[id] = i;
  }
  for (const o of orgs) {
    if (o.id === 'etc') continue;
    const i = s.indexOf(o.name);
    if (i >= 0 && (at[o.id] === undefined || i < at[o.id])) at[o.id] = i;
  }
  for (const [id, i] of Object.entries(at)) found.push([id, i]);
  // 글에 먼저 나온 기관을 앞에 둡니다. 대개 주최 기관이 먼저 적힙니다.
  return found.sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

export const ORG_ALIASES = {
  '보건복지부': 'mohw', '복지부': 'mohw',
  '질병관리청': 'kdca', '질병청': 'kdca', '국립보건연구원': 'kdca',
  '식품의약품안전처': 'mfds', '식약처': 'mfds',
  '한국건강증진개발원': 'khealth',
  '국립암센터': 'ncc',
  '국민건강보험공단': 'nhis', '건보공단': 'nhis', '건강보험공단': 'nhis',
  '건강보험심사평가원': 'hira', '심사평가원': 'hira', 'HIRA': 'hira',
  '한국보건의료연구원': 'neca', 'NECA': 'neca',
  '한국보건사회연구원': 'kihasa', '보건사회연구원': 'kihasa', 'KIHASA': 'kihasa',
  '한국보건산업진흥원': 'khidi', 'KHIDI': 'khidi',
  '국립중앙의료원': 'nmc',
  '국가생명윤리정책원': 'nibp',
  '대한예방의학회': 'prevmed', '예방의학회': 'prevmed',
  '한국역학회': 'ksepi', '역학회': 'ksepi',
  '한국보건행정학회': 'kshpa', '보건행정학회': 'kshpa',
  '대한의학회': 'kams',
  '대한공공의학회': 'kspm', '공공의학회': 'kspm',
  '한국보건교육건강증진학회': 'kshep',
  '대한보건협회': 'kpha',
  '한국의료질향상학회': 'kosqua',
  '한국장애인개발원': 'koddi', '장애인개발원': 'koddi',
  '서울대학교 보건대학원': 'snuph', '서울대 보건대학원': 'snuph', '보건대학원': 'snuph',
  '수요세미나': 'snuph', '보건정책관리학전공': 'snuph',
  '한국코크란': 'cochrane', '코크란': 'cochrane'
};
