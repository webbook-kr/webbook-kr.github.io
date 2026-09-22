# 발행된 책의 읽기 페이지(b/<책주소>/index.html)를 손으로 만들 때 쓴다. 보통은 발행 함수가 자동으로 만든다.
#   python3 scripts/book_page.py 책주소 책.html
import re, sys, html as H, os
slug, src = sys.argv[1], sys.argv[2]
assert re.fullmatch(r'[a-z0-9-]{3,60}', slug), '책주소는 영문 소문자·숫자·- 만'
h = open(src, encoding='utf-8').read()
def meta(pat):
    m = re.search(pat, h); return H.unescape(m.group(1)).strip() if m else ''
title = meta(r'<title>([^<]*)</title>')
short = title.split(' — ')[0]  # 미리보기 제목은 부제 없이 짧게
desc = meta(r'<meta name="description" content="([^"]*)"')
img = meta(r'class="cimg"[^>]*>\s*<img[^>]*src="([^"]+)"')
root = os.path.join(os.path.dirname(__file__), '..')
t = open(os.path.join(root, 'b', '_book.html'), encoding='utf-8').read()
esc = lambda s: H.escape(s, quote=True)
imgtags = ('<meta property="og:image" content="%s">\n<meta name="twitter:card" content="summary_large_image">' % esc(img)) if img else '<meta name="twitter:card" content="summary">'
out = t.replace('<title>{{TITLE}}</title>', '<title>'+esc(title)+'</title>').replace('{{TITLE}}', esc(short)).replace('{{DESC}}', esc(desc)).replace('{{SLUG}}', slug).replace('{{IMAGE_TAGS}}', imgtags)
d = os.path.join(root, 'b', slug); os.makedirs(d, exist_ok=True)
open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(out)
print('b/%s/index.html · %s · 그림 %s' % (slug, title, '있음' if img else '없음'))
