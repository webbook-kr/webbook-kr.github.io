// 웹북 의견 함수 호출 도우미. 환경변수 SLUG, TOKEN 필요.
//   node review.mjs list                       의견 목록 (쪽 순, 상태 포함)
//   node review.mjs status <id> <상태> [답변]   상태: open|done|skip|hold
//   node review.mjs round <n>                  회람 차수 바꾸기
//   node review.mjs md                         "검토 의견 반영 내역" 장 (웹북 원고)
const FN = 'https://dxhmprqfgigljgbstqrg.supabase.co/functions/v1/webbook-comment';
const { SLUG, TOKEN } = process.env;
if (!SLUG || !TOKEN) { console.error('SLUG, TOKEN 환경변수를 넣어 주세요'); process.exit(1); }
const STAT = { open: '검토 중', done: '반영', skip: '미반영', hold: '보류' };
const [cmd, ...a] = process.argv.slice(2);
const post = async (body) => { const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: SLUG, token: TOKEN, ...body }) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
const list = async () => { const r = await fetch(`${FN}?slug=${SLUG}&token=${encodeURIComponent(TOKEN)}`); const j = await r.json(); if (j.error) throw new Error(j.error); return j; };
try {
  if (cmd === 'list') {
    const j = await list(); console.log(`지금 ${j.round}차 회람 · 의견 ${j.comments.length}개`);
    for (const c of j.comments) console.log(`#${c.id} [${c.round}차] ${c.page}쪽 ${c.page_title} · ${c.name}\n   ${c.body.replace(/\n/g, '\n   ')}\n   → ${STAT[c.status]}${c.reply ? ': ' + c.reply : ''}`);
  } else if (cmd === 'status') { console.log(await post({ action: 'status', id: +a[0], status: a[1], reply: a.slice(2).join(' ') })); }
  else if (cmd === 'round') { console.log(await post({ action: 'round', round: +a[0] })); }
  else if (cmd === 'md') {
    const j = await list(); const rounds = {}; for (const c of j.comments) (rounds[c.round] ??= []).push(c);
    const out = ['# 검토 의견 반영 내역 | 회람 차수별 의견과 반영 결과', ''];
    for (const r of Object.keys(rounds).sort((x, y) => x - y)) {
      out.push(`## ${r}차 회람 의견 (${rounds[r].length}건)`, ''); const by = {}; for (const c of rounds[r]) (by[c.page] ??= []).push(c);
      for (const p of Object.keys(by).sort((x, y) => x - y)) { out.push(`**${p}쪽 · ${by[p][0].page_title || ''}**`, ''); for (const c of by[p]) out.push(`- **${c.name || '익명'}** ${c.body.replace(/\s+/g, ' ')} → **${STAT[c.status]}**${c.reply ? ' ' + c.reply : ''}`, ''); }
    }
    console.log(out.join('\n'));
  } else { console.log('list | status <id> <open|done|skip|hold> [답변] | round <n> | md'); }
} catch (e) { console.error('오류:', e.message); process.exit(1); }
