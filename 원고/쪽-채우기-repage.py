# pack.mjs 결과대로 원고에 --- 를 넣는다.  python3 repage.py 원고.md pack.json 출력.md
import re, json, sys
src, packf, dst = sys.argv[1:4]
text=open(src,encoding='utf-8').read(); pack=json.load(open(packf))
parts=re.split(r'(?m)^(?=## )',text); out=[parts[0]]
for sec in parts[1:]:
    lines=sec.split('\n'); title=lines[0][3:].strip(); body='\n'.join(lines[1:])
    if title not in pack: out.append(sec); continue
    body=re.sub(r'\n---\n','\n',body)
    tail=''
    m=re.search(r'(?m)^# .*$',body)
    if m: tail=body[m.start():]; body=body[:m.start()]
    blocks=[b for b in re.split(r'\n\s*\n',body) if b.strip()]
    rh=[b for b in blocks if b.startswith('머리글:')]; blocks=[b for b in blocks if not b.startswith('머리글:')]
    counts=pack[title]['pages']
    assert sum(counts)==len(blocks), (title, sum(counts), len(blocks))
    pages=[]; i=0
    for c in counts: pages.append(blocks[i:i+c]); i+=c
    if rh: pages[0].insert(1 if pages[0] and pages[0][0].startswith('발표자:') else 0, rh[0])
    out.append('## '+title+'\n\n'+'\n\n---\n\n'.join('\n\n'.join(pg) for pg in pages)+'\n\n'+tail)
open(dst,'w',encoding='utf-8').write(''.join(out)); print('ok')
