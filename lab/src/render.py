# 클로드 코드 같이 개발 실습 영상: 프롬프트(타이핑) + 실제 결과 화면(폰) + 음성
import json, os, subprocess, textwrap, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg
FF=imageio_ffmpeg.get_ffmpeg_exe()
S='/tmp/claude-0/-home-user-webbook-kr-github-io/60c9817b-999b-59c1-8dab-115f1ed67ca7/scratchpad'
H=S+'/cv'; EV=S+'/ev'
FONT=os.path.expanduser('~/.local/share/fonts/')
W,Hh,FPS,SR=1280,720,15,24000
def F(w,s): return ImageFont.truetype(FONT+f'Pretendard-{w}.otf',s)
BG=(253,248,236); NAVY=(43,42,76); PINK=(240,98,146); YEL=(255,214,107); MUTED=(107,104,128); WHITE=(255,255,255)
P=json.load(open('/home/user/webbook-kr.github.io/lab/prompts.json'))
def pcm(k):
    f=f'{H}/tts/{k}.mp3'
    return subprocess.run([FF,'-loglevel','error','-i',f,'-f','s16le','-ac','1','-ar',str(SR),'-'],capture_output=True,check=True).stdout
def wrap(text,font,maxw):
    out=[]
    for para in text.split('\n'):
        cur=''
        for ch in para:
            if font.getlength(cur+ch)>maxw: out.append(cur); cur=ch
            else: cur+=ch
        out.append(cur)
    return out
def base():
    im=Image.new('RGB',(W,Hh),BG); d=ImageDraw.Draw(im)
    d.ellipse([W-170,-170,W+170,170],fill=YEL)
    return im
def chip(d,x,y,t):
    f=F('Bold',18); w=f.getlength(t)+30; d.rounded_rectangle([x,y,x+w,y+36],18,fill=NAVY); d.text((x+15,y+7),t,font=f,fill=WHITE)
def phone(im,shot,scroll=0.0,url=None):
    # 폰 틀 안에 실제 화면을 넣고 scroll(0~1) 만큼 내려 보여 준다
    src=Image.open(shot).convert('RGB'); pw,ph=300,610; k=max(pw/src.width,ph/src.height); src=src.resize((round(src.width*k),round(src.height*k)),Image.LANCZOS)
    if src.width>pw: src=src.crop(((src.width-pw)//2,0,(src.width-pw)//2+pw,src.height))
    top=round(max(0,src.height-ph)*scroll); view=src.crop((0,top,pw,top+ph))
    x,y=W-90-pw,(Hh-ph)//2+(14 if url else 0)
    sh=Image.new('L',(pw+80,ph+80),0); ImageDraw.Draw(sh).rounded_rectangle([40,40,pw+40,ph+40],34,fill=120); sh=sh.filter(ImageFilter.GaussianBlur(16))
    im.paste((0,0,0),(x-40,y-30),sh)
    d=ImageDraw.Draw(im); d.rounded_rectangle([x-12,y-12,x+pw+12,y+ph+12],36,fill=(28,30,36))
    m=Image.new('L',(pw,ph),0); ImageDraw.Draw(m).rounded_rectangle([0,0,pw-1,ph-1],26,fill=255); im.paste(view,(x,y),m)
    if url:
        f=F('SemiBold',17); w=f.getlength(url)+36; ux=x+pw//2-w/2
        d.rounded_rectangle([ux,y-62,ux+w,y-26],18,fill=WHITE,outline=NAVY,width=2); d.text((ux+18,y-55),url,font=f,fill=NAVY)
def prompt_panel(im,n,title,text,frac,extra=None):
    d=ImageDraw.Draw(im); chip(d,70,48,'프롬프트 '+str('①②③④'.index(n)+1)); d.text((70,98),title,font=F('ExtraBold',40),fill=NAVY)
    x0,y0,x1=70,200,700; f=F('Medium',21)
    lines=wrap(text,f,x1-x0-48)
    if len(lines)>12: f=F('Medium',17); lines=wrap(text,f,x1-x0-48)
    LH=f.size+12; total=sum(len(l) for l in lines); shown=int(total*frac)
    h=min(470,28+len(lines)*LH+20); d.rounded_rectangle([x0,y0,x1,y0+h],18,fill=WHITE,outline=NAVY,width=3)
    d.text((x0+4,y0-30),'내가 입력한 말',font=F('SemiBold',15),fill=MUTED)
    y=y0+22; left=shown
    for l in lines:
        t=l[:max(0,left)]; left-=len(l); d.text((x0+24,y),t,font=f,fill=NAVY); 
        if 0<len(t)<len(l) or (left<=0 and len(t)==len(l) and frac<1 and len(t)>0 and left==0): d.rectangle([x0+24+f.getlength(t)+2,y+3,x0+24+f.getlength(t)+4,y+26],fill=PINK)
        y+=LH
        if y>y0+h-30: break
    if extra and frac>=1:
        ey=y0+h+24
        for i,s in enumerate(extra): d.text((x0,ey+i*36),s,font=F('SemiBold',22),fill=NAVY)
def card(title,items,sub=None):
    im=base(); d=ImageDraw.Draw(im)
    d.text((90,90),title,font=F('ExtraBold',52),fill=NAVY)
    if sub: d.text((92,160),sub,font=F('Medium',24),fill=MUTED)
    y=230
    for i,(a,b) in enumerate(items):
        d.ellipse([90,y,134,y+44],fill=PINK); f=F('Bold',22); d.text((112-f.getlength(str(i+1))/2,y+8),str(i+1),font=f,fill=WHITE)
        d.text((156,y+2),a,font=F('Bold',30),fill=NAVY); d.text((156,y+44),b,font=F('Regular',21),fill=MUTED); y+=104
    return im
def title_card(t):
    im=Image.new('RGB',(W,Hh),NAVY); d=ImageDraw.Draw(im); a=min(1,t/0.6)
    c=lambda col:tuple(int(NAVY[i]+(col[i]-NAVY[i])*a) for i in range(3))
    d.text((90,170),'AI와 놀아보자! · 같이 개발하기',font=F('SemiBold',28),fill=c((255,190,140)))
    d.text((88,220),'클로드 코드로',font=F('ExtraBold',72),fill=c(WHITE))
    d.text((88,305),'수련회 신청 페이지 만들기',font=F('ExtraBold',72),fill=c(WHITE))
    d.text((92,420),'프롬프트 네 번 · 코드 몰라도 OK',font=F('Medium',28),fill=c((205,215,232)))
    d.rectangle([92,480,92+int(280*min(1,t/1.2)),486],fill=YEL)
    d.text((92,620),'webbook-kr.github.io/lab/code.html',font=F('Medium',22),fill=c((150,165,190)))
    return im
SCENES=[
 ('s0',lambda t,T:title_card(t)),
 ('s1',lambda t,T:card('준비물',[('클로드 Pro 이상 요금제','무료 요금제에서는 클로드 코드를 쓸 수 없어요'),('깃허브(GitHub) 계정','github.com 에서 무료 가입'),('깃허브 새 저장소','이름 retreat · Public · README 추가 체크')],'처음 한 번만 준비해요')),
 ('s2',lambda t,T:card('새 대화 시작',[('claude.ai/code 접속','휴대폰은 클로드 앱의 Code 탭'),('깃허브로 로그인','처음 한 번 승인'),('저장소 retreat 고르고 프롬프트 붙여넣기','입력창 아래에서 저장소 선택 → Enter')])),
]
def promptscene(i,shot,url=None,extra=None):
    p=P[i]
    def f(t,T):
        im=base(); typ=min(1,t/max(1.5,T*0.42)); prompt_panel(im,p['t'][0],p['t'][2:],p['v'],typ,extra)
        sc=0 if t<T*0.5 else min(1,(t-T*0.5)/(T*0.45))
        if t>T*0.38: phone(im,shot,sc if 'full' in shot else 0,url)
        else:
            d=ImageDraw.Draw(im); pw,ph=300,610; x,y=W-90-pw,(Hh-ph)//2
            d.rounded_rectangle([x-12,y-12,x+pw+12,y+ph+12],36,fill=(28,30,36)); d.rounded_rectangle([x,y,x+pw,y+ph],26,fill=(245,242,235))
            dots='•'*(1+int(t*3)%3); ff=F('SemiBold',22); d.text((x+pw/2-ff.getlength('만드는 중 '+dots)/2,y+ph/2-12),'만드는 중 '+dots,font=ff,fill=MUTED)
        return im
    return f
SCENES+= [('s3',promptscene(0,EV+'/v1-full.png')),('s4',promptscene(1,EV+'/v2-top.png')),('s5',promptscene(2,EV+'/v3-empty.png')),
 ('s6',promptscene(3,EV+'/v3-top.png',extra=['깃허브 → Settings → Pages','Branch: main · / (root) → Save','1~3분 뒤 내 페이지 주소가 생겨요'])),
 ('s7',lambda t,T:(lambda im:(ImageDraw.Draw(im).text((90,200),'완성!',font=F('ExtraBold',80),fill=NAVY),
     ImageDraw.Draw(im).text((92,320),'주소를 단톡방에 올리면',font=F('Bold',34),fill=NAVY),
     ImageDraw.Draw(im).text((92,370),'누구나 폰으로 바로 신청',font=F('Bold',34),fill=PINK),
     ImageDraw.Draw(im).text((92,470),'원하는 것을 정확히 말하면 만들어집니다',font=F('Medium',24),fill=MUTED),
     phone(im,EV+'/v2-top.png',0,'webbook-kr.github.io/event/'),im)[-1])(base()))]
mj=open(H+'/_tmp.mjpeg','wb'); aud=bytearray(); nfr=0
def put(b,at):
    o=int(at*SR)*2; need=o+len(b)
    if len(aud)<need: aud.extend(b'\0'*(need-len(aud)))
    aud[o:o+len(b)]=b
for k,fn in SCENES:
    a=pcm(k); start=nfr/FPS; put(a,start+0.4)
    T=max(3.0,0.4+len(a)/2/SR+(1.4 if k in('s3','s4','s5','s6') else 0.9))
    for f in range(int(T*FPS)):
        fn(f/FPS,T).save(mj,'JPEG',quality=92); nfr+=1
    if k=='s3': fn(T,T).convert('RGB').save(f'{H}/poster-mid.jpg',quality=85)
mj.close(); put(b'',nfr/FPS); open(H+'/_tmp.pcm','wb').write(bytes(aud[:int(nfr/FPS*SR)*2]))
out=H+'/claude-code-practice.mp4'
p=subprocess.run([FF,'-y','-loglevel','error','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i',H+'/_tmp.mjpeg','-f','s16le','-ar',str(SR),'-ac','1','-i',H+'/_tmp.pcm',
 '-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-g','60','-c:a','aac','-b:a','96k','-ar','48000','-movflags','+faststart','-shortest',out])
title_card(2).save(H+'/claude-code-practice.jpg',quality=88)
os.remove(H+'/_tmp.mjpeg'); os.remove(H+'/_tmp.pcm'); print('done',round(nfr/FPS,1),'s',p.returncode)
