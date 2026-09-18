#!/usr/bin/env python3
# 원고에서 지정한 쪽 번호의 ## 구간을 두 쪽으로 쪼갠다.
#   python3 split.py 원고.md 7 26 30 ...
# 쪽 번호는 measure.mjs 가 찍어 주는 번호를 그대로 쓴다.
# 번호 목록이 1번부터 시작하지 않는 쪽으로 넘어가면, 제작기가 번호를 1부터 다시 매기므로
# 글머리 기호로 바꾸고 번호를 글자로 적는다.
import re, sys

path, pages = sys.argv[1], sorted({int(x) for x in sys.argv[2:]})
raw = open(path, encoding='utf-8').read()

head, body = '', raw
m = re.match(r'^((?:(?:책 제목|글쓴이|부제)\s*:.*\n)+\s*\n)', raw)
if m:
    head, body = m.group(1), raw[m.end():]

# 장과 쪽으로 가른다. 제작기와 같은 순서로 쪽 번호를 매긴다.
# 1=표지, 2=차례, 그다음 장마다 [장 표지, 쪽들...], 마지막에 끝 쪽.
chapters, cur = [], None
for line in body.split('\n'):
    if line.startswith('# '):
        cur = {'title': line[2:].strip(), 'secs': []}
        chapters.append(cur)
    elif line.startswith('## '):
        cur['secs'].append({'title': line[3:].strip(), 'lines': []})
    elif cur and cur['secs']:
        cur['secs'][-1]['lines'].append(line)

num, targets = 2, {}
for ch in chapters:
    num += 1                       # 장 표지
    for sec in ch['secs']:
        num += 1
        targets[num] = sec

def height(block):
    """제작기 기준 블록 높이 어림치."""
    ls = [x for x in block.split('\n') if x.strip()]
    if not ls: return 0
    if ls[0].startswith('|'):
        return sum(70 for x in ls if not re.match(r'^\|\s*:?-+', x)) + 40
    if ls[0].startswith('>'):  return len(block) + 60
    if ls[0].startswith(':::'): return len(block) + 40
    return len(block)

renum = re.compile(r'^(\d+)[.)]\s+(.*)$')

LIST = re.compile(r'^\s*(?:[-*]\s+|\d+[.)]\s+)')

def burst(blocks):
    """가장 큰 목록·표 덩어리를 반으로 갈라 두 덩어리로 만든다.
    목록 하나가 통째로 한 덩어리인 쪽은 이렇게 해야 나뉜다."""
    big, bi = 0, -1
    for i, b in enumerate(blocks):
        ls = [x for x in b.split('\n') if x.strip()]
        rows = [x for x in ls if LIST.match(x)] or [x for x in ls if x.startswith('|')]
        if len(rows) >= 4 and height(b) > big:
            big, bi = height(b), i
    if bi < 0: return blocks
    ls = blocks[bi].split('\n')
    if ls[0].startswith('|'):                      # 표는 머리글을 양쪽에 붙인다
        head2 = ls[:2]
        rows = ls[2:]
        h = len(rows) // 2
        return blocks[:bi] + ['\n'.join(head2 + rows[:h]), '\n'.join(head2 + rows[h:])] + blocks[bi+1:]
    h = len(ls) // 2
    while h < len(ls) and not LIST.match(ls[h]): h += 1   # 항목 경계에서 자른다
    return blocks[:bi] + ['\n'.join(ls[:h]), '\n'.join(ls[h:])] + blocks[bi+1:]

def split_sec(sec):
    blocks = [b for b in '\n'.join(sec['lines']).strip().split('\n\n') if b.strip()]
    if len(blocks) < 2:
        blocks = burst(blocks)
    if len(blocks) < 2: return None
    tot0 = sum(height(b) for b in blocks)
    if max(height(b) for b in blocks) > tot0 * 0.6:   # 한 덩어리가 너무 크면 그것부터 가른다
        blocks = burst(blocks)
    tot = sum(height(b) for b in blocks)
    run, cut = 0, 1
    for i, b in enumerate(blocks):
        run += height(b)
        if run >= tot / 2:
            cut = min(max(i + 1, 1), len(blocks) - 1)
            break
    first, second = blocks[:cut], blocks[cut:]
    # 표 바로 앞의 한 줄 설명은 표와 같은 쪽에 둔다
    if len(first) >= 2 and second and second[0].lstrip().startswith('|') and len(first[-1]) < 60:
        second.insert(0, first.pop())
    out = []
    for x in second:
        ls = x.split('\n')
        mm = renum.match(ls[0].strip())
        if mm and mm.group(1) != '1':
            ls = [(f"- **{renum.match(l.strip()).group(1)}.** {renum.match(l.strip()).group(2)}"
                   if renum.match(l.strip()) else l) for l in ls]
        out.append('\n'.join(ls))
    return first, out

done = []
for n in pages:
    sec = targets.get(n)
    if not sec: continue
    r = split_sec(sec)
    if not r: continue
    first, second = r
    old = '## ' + sec['title'] + '\n' + '\n'.join(sec['lines'])
    new = ('## ' + sec['title'] + '\n\n' + '\n\n'.join(first).strip()
           + '\n\n## ' + sec['title'] + ' (이어서)\n\n' + '\n\n'.join(second).strip() + '\n')
    assert old in body, sec['title']
    body = body.replace(old, new, 1)
    done.append(f"{n}쪽 {sec['title']}")

open(path, 'w', encoding='utf-8').write(head + body)
print(f"{len(done)}개 구간을 둘로 나눔")
for d in done: print('  ', d)
