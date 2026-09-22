# 책 파일 안에 그림을 통째로 넣는다(base64). 인터넷 없이도 그림이 보이는 진짜 오프라인 파일.
import re, base64, sys, os
src, dst = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()
root = '/home/user/webbook-kr.github.io/'
def rep(m):
    url = m.group(1)
    path = root + url.split('webbook-kr.github.io/')[1]
    if not os.path.exists(path): return m.group(0)
    b = base64.b64encode(open(path,'rb').read()).decode()
    return 'src="data:image/jpeg;base64,' + b + '"'
h2, n = re.subn(r'src="(https://webbook-kr\.github\.io/img/[^"]+\.jpg)"', rep, h)
open(dst, 'w', encoding='utf-8').write(h2)
print('그림', n, '장 넣음 ·', round(len(h2.encode())/1024/1024,1), 'MB')
