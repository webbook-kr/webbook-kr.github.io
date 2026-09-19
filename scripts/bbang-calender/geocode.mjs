// 빵캘 — 행사 장소 글을 지도 좌표로 바꿉니다.
//   node scripts/bbang-calender/geocode.mjs
// 한 번 찾은 장소는 data/places.json 에 적어 두고 다시 묻지 않습니다.
// 자료는 OpenStreetMap 이고, 예의상 1초에 한 번만 묻습니다.
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const DATA = path.join(ROOT, 'bbang-calender', 'data');
const UA = 'BbangCalGeocoder/1.0 (+https://epibrief.github.io/bbang-calender/)';
const WAIT = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ONLINE = /온라인|on-?line|zoom|줌\s|웨비나|비대면|유튜브|라이브\s?송출/i;
const CITY = /(서울|부산|대구|인천|광주|대전|울산|세종|수원|성남|용인|고양|천안|청주|전주|창원|김해|제주|강릉|춘천|원주|포항|구미|안동|여수|목포|익산|평택|화성|속초|경주)/;

/** 장소 글에서 지도에 물어볼 말을 만듭니다. 앞쪽일수록 정확합니다. */
export function planQueries(place) {
  const raw = String(place || '').trim();
  if (!raw) return { kind: 'none', tries: [] };
  if (ONLINE.test(raw)) return { kind: 'online', tries: [] };

  const tries = [];

  // 1) 괄호 안에 적힌 도로명 주소가 가장 정확합니다.
  const addr = raw.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도)?\s*[가-힣]+[구군시]\s*[^),]*?\d+[^),]*)/);
  if (addr) tries.push(addr[1].replace(/\s+/g, ' ').trim());

  // 2) 방·층·홀 같은 세부를 걷어 낸 건물 이름
  const city = raw.match(CITY)?.[1] || null;
  const name = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+동|\d+호실?|\d+층|의원회의실|대회의실|중회의실[A-Z]?|[가-힣A-Za-z]{1,6}홀|대강당|중강당|소강당|회의실[A-Z]?|세미나실|강의실|로비|컨퍼런스룸|오디토리움|국제회의장|이벤트홀/g, ' ')
    .replace(/\s*(?:및|또는|외)\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name) {
    if (city && !name.startsWith(city)) tries.push(`${city} ${name}`);
    tries.push(name);
    // 뒷말을 하나씩 떼며 다시 묻습니다. '대한상공회의소 의원' 은 못 찾아도 '대한상공회의소' 는 찾습니다.
    const words = name.split(' ').filter(Boolean);
    for (let n = words.length - 1; n >= 1; n--) {
      const shorter = words.slice(0, n).join(' ');
      if (shorter !== city && !tries.includes(shorter)) tries.push(shorter);
    }
  }

  // 3) 그래도 못 찾으면 도시만이라도 찍어 둡니다.
  if (city) tries.push(city);

  return { kind: addr ? 'addr' : name ? 'name' : city ? 'city' : 'none', tries, city, name };
}

// '명동', '강남역', '마곡' 처럼 어디인지 짚어 주는 낱말인지 봅니다.
const NOT_PLACE = /^(연구|지구|입구|출구|도구|기구|활동|이동|운동|자동|공동|행동|노동|통로|진로|경로|참가|추가|평가|증가|효과)$/;
function isPlaceWord(w) {
  return w.length >= 2 && /(?:동|구|로|역|점|가|캠퍼스|지구)$/.test(w) && !NOT_PLACE.test(w);
}

async function ask(q) {
  const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=' + encodeURIComponent(q);
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'ko' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.length) return null;
      return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name };
    } catch {
      await sleep(2000);
    }
  }
  return null;
}

/** 지도 답에서 '서울특별시', '속초시' 같은 도시 이름을 뽑습니다. */
export function cityOf(label) {
  const parts = String(label || '').split(',').map((x) => x.trim());
  const hit = parts.find((x) => /(?:특별시|광역시|특별자치시)$/.test(x))
    || parts.find((x) => /[가-힣]{2,6}(?:시|군)$/.test(x));
  if (!hit) return null;
  return hit.replace(/특별자치시$|특별시$|광역시$/, '').replace(/시$|군$/, '') || hit;
}

async function main() {
  const db = JSON.parse(await fs.readFile(path.join(DATA, 'events.json'), 'utf8'));
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(path.join(DATA, 'places.json'), 'utf8')); } catch { /* 처음 */ }

  const places = [...new Set(db.events.map((e) => e.place).filter(Boolean))];
  let asked = 0;

  for (const place of places) {
    if (cache[place] && !cache[place].stale) continue;
    const plan = planQueries(place);
    if (plan.kind === 'online') { cache[place] = { online: true }; continue; }
    if (!plan.tries.length) { cache[place] = { none: true }; continue; }

    let hit = null, used = null;
    for (const q of plan.tries) {
      const got = await ask(q);
      asked++;
      await sleep(WAIT);
      if (!got) continue;
      // 뒷말을 떼고 물었을 때, 떼어 낸 말이 동네 이름이면 답이 그 동네인지 봅니다.
      // '코트야드 메리어트 서울 명동' 에서 '명동' 을 떼고 찾은 답이 마곡이면 다른 곳입니다.
      if (q !== plan.city && plan.name) {
        const dropped = plan.name.split(' ').filter((w) => w && !q.includes(w));
        const wrong = dropped.find((w) => isPlaceWord(w) && !got.label.includes(w));
        if (wrong) {
          console.log('  버림  |', q, '→', got.label.split(',').slice(0, 2).join(','), `(${wrong} 아님)`);
          continue;
        }
      }
      hit = got; used = q; break;
    }
    // 마지막 후보(도시)로 찾았으면 대략 위치로 봅니다.
    const approx = !hit ? false : (plan.city && used === plan.city);
    cache[place] = hit
      ? { lat: +hit.lat.toFixed(6), lng: +hit.lng.toFixed(6), q: used, label: hit.label, precision: approx ? 'approx' : 'exact' }
      : { none: true, tried: plan.tries };
    console.log((cache[place].none ? '못 찾음' : cache[place].precision === 'approx' ? '대략' : '찾음').padEnd(6), '|', place.slice(0, 40));
  }

  // 행사마다 좌표를 붙입니다.
  let mapped = 0, online = 0;
  for (const e of db.events) {
    const c = e.place ? cache[e.place] : null;
    delete e.lat; delete e.lng; delete e.geo; delete e.online;
    if (!c) continue;
    if (c.online) { e.online = true; online++; continue; }
    if (c.none) continue;
    e.lat = c.lat; e.lng = c.lng; e.geo = c.precision;
    const city = cityOf(c.label);
    if (city) e.city = city;
    mapped++;
  }
  db.map = { mapped, online, places: places.length, geocodedAt: new Date().toISOString().slice(0, 10) };

  await fs.writeFile(path.join(DATA, 'places.json'), JSON.stringify(cache, null, 1) + '\n');
  await fs.writeFile(path.join(DATA, 'events.json'), JSON.stringify(db, null, 1) + '\n');
  console.log(`\n지도에 찍을 행사 ${mapped}건, 온라인 ${online}건. 새로 물어본 횟수 ${asked}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
