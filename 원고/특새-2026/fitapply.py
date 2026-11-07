# fit.mjs 결과(넘치는 블록 앞 글자)를 받아 원고에서 그 줄 앞에 --- 를 넣는다
import json, re, sys, glob
res=json.loads(sys.argv[1]); files=sorted(glob.glob('s0*.md'))+['build.py']
def norm(s): return re.sub(r'(\*\*|==|\(?\d:\d\d:\d\d\)?|>\s|^-\s|^└\s|▸|▶)','',s).replace(' ','')
done=0
for r in res:
    t=r.get('text')
    if not t: continue
    key=norm(t)[:14]
    for f in files:
        L=open(f).read().split('\n'); hit=None
        for k,l in enumerate(L):
            if re.match(r'^\d:\d\d:\d\d ',l): continue   # 영상 시간 목록 줄은 건너뛴다
            if key and key in norm(l): hit=k; break
        if hit is None: continue
        if L[hit].startswith('핵심:'):   # 핵심 상자 혼자 넘어가지 않게 바로 앞 항목부터 넘긴다
            k=hit-1
            while k>0 and not L[k].strip(): k-=1
            hit=k
        if hit>0 and L[hit-1].strip()=='---': break
        L.insert(hit,"---"); L.insert(hit+1,"")
        open(f,'w').write('\n'.join(L)); done+=1; print('break',f,hit,t[:20]); break
print('inserted',done)
