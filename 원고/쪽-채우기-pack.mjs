// 절을 한 쪽에 길게 만든 책(_d.html)에서 문단 높이를 재어 쪽 나눔 위치를 정한다. 출력: JSON {절제목: [쪽별 문단 수]}
import { chromium } from 'playwright';
const [W,H]=[+process.argv[2]||360,+process.argv[3]||700];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:W,height:H}});
await p.goto('http://localhost:8931/_d.html',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(600);
const res=await p.evaluate(()=>{
  const S=[...document.querySelectorAll('#deck > section.s')], out={};
  S.forEach(s=>{ S.forEach(x=>x.classList.remove('on')); s.classList.add('on');
    const pin=s.querySelector('.pin'); if(!pin||!s.querySelector('.who')) return;
    const cs=getComputedStyle(pin), avail=pin.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    const kids=[...pin.children]; let fixed=0; const blocks=[];
    kids.forEach(k=>{ const r=k.getBoundingClientRect(), m=getComputedStyle(k); const h=r.height+parseFloat(m.marginTop)+parseFloat(m.marginBottom);
      if(k.classList.contains('rh')||k.tagName==='H3'){fixed+=h;return;}
      const sub=k.classList.contains('prose')&&k.tagName==='DIV'&&/^<p><b>[^<]+<\/b><\/p>$/.test(k.innerHTML.trim());
      blocks.push({h,sub}); });
    const cap=avail-fixed-2;
    function packTo(t){ const pg=[]; let cur=0,n=0; blocks.forEach(bl=>{ const lim=pg.length?t-26:t; if(n>0 && cur+bl.h>lim){ pg.push(n); cur=0; n=0; } cur+=bl.h; n++; }); if(n>0) pg.push(n); return pg; }
    let pages=packTo(cap);   // 꽉 채우기
    // 마지막 쪽이 너무 비면 마지막 두 쪽을 고르게 나눈다
    if(pages.length>=2){ const n2=pages[pages.length-2]+pages[pages.length-1]; const start=blocks.length-n2; const seg=blocks.slice(start); const tot=seg.reduce((a,b)=>a+b.h,0); const lastH=blocks.slice(blocks.length-pages[pages.length-1]).reduce((a,b)=>a+b.h,0); if(lastH<(cap-26)*0.55){ let best=null; for(let k=1;k<n2;k++){ const h1=seg.slice(0,k).reduce((a,b)=>a+b.h,0), h2=tot-h1; if(h1<=cap-26&&h2<=cap-26){ const d=Math.abs(h1-h2); if(!best||d<best.d) best={k,d}; } } if(best){ pages[pages.length-2]=best.k; pages[pages.length-1]=n2-best.k; } } }
    // 소제목이 쪽 끝에 홀로 남으면 다음 쪽으로
    let idx=0; for(let pi=0;pi<pages.length-1;pi++){ idx+=pages[pi]; if(blocks[idx-1].sub && pages[pi]>1){ pages[pi]--; pages[pi+1]++; idx--; } }
    out[s.querySelector("h3").textContent.trim()]={cap:Math.round(cap),pages,heights:blocks.map(x=>Math.round(x.h)),subs:blocks.map(x=>x.sub?1:0)};
  }); return out;});
console.log(JSON.stringify(res)); await b.close();
