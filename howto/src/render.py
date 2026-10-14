# 단계 화면(steps.json) → 자막·강조·커서를 입힌 WebM 영상 6편 + 포스터
import json, math, subprocess, sys, io, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
H='/tmp/claude-0/-home-user-webbook-kr-github-io/60c9817b-999b-59c1-8dab-115f1ed67ca7/scratchpad/howto'
FF='/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'
FONT='/root/.local/share/fonts/'
W,Hh,FPS=1280,720,15
BAR=96
def F(w,s): return ImageFont.truetype(FONT+f'Pretendard-{w}.otf',s)
NAVY=(23,42,74); ACC=(255,122,26)
CLIPS={
 '1':('원고 만들기','녹취·자료 → AI 요청문 → .md 원고 → 제작기'),
 '2':('제작과 미리보기','책 정보 · 책 모양 · 글 간격 · 쪽 확인'),
 '3':('발행','발행 코드 → 책 주소 · 수정 열쇠 · 다른 PC 연결'),
 '4':('회람과 의견','검토자가 폰에서 쪽마다 의견 남기기'),
 '5':('의견 반영','모아보기 → 원고 고치기(++ ++) → 다시 발행 → 반영 기록'),
 '6':('최종본','최종본 켜기 → 다시 발행 → PDF·반영표 보관'),
}
st=json.load(open(H+'/steps.json'))

def base_of(s):
    im=Image.open(H+'/frames/'+s['img']).convert('RGB')
    r=s['rect']
    if not s['phone']:
        return im, (r and (r['x'],r['y'],r['w'],r['h']))
    cv=Image.new('RGB',(W,Hh),(233,236,241))
    ph_h=Hh-BAR-36; k=ph_h/im.height; ph=im.resize((round(im.width*k),ph_h),Image.LANCZOS)
    ox=(W-ph.width)//2; oy=18
    # 폰 테두리와 그림자
    sh=Image.new('L',(ph.width+60,ph.height+60),0); ImageDraw.Draw(sh).rounded_rectangle([30,30,ph.width+30,ph.height+30],28,fill=110)
    sh=sh.filter(ImageFilter.GaussianBlur(14)); cv.paste((0,0,0),(ox-30,oy-22),sh)
    frame=Image.new('RGB',(ph.width+20,ph.height+20),(28,30,36)); fm=Image.new('L',frame.size,0); ImageDraw.Draw(fm).rounded_rectangle([0,0,frame.width-1,frame.height-1],30,fill=255)
    cv.paste(frame,(ox-10,oy-10),fm)
    m=Image.new('L',ph.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,ph.width-1,ph.height-1],22,fill=255); cv.paste(ph,(ox,oy),m)
    sc=k*(im.width/390)
    return cv, (r and (ox+r['x']*sc, oy+r['y']*sc, r['w']*sc, r['h']*sc))

def wrap(text,font,maxw):
    words=text.split(' '); lines=[]; cur=''
    for w_ in words:
        t=(cur+' '+w_).strip()
        if font.getlength(t)<=maxw: cur=t
        else: lines.append(cur); cur=w_
    lines.append(cur); return lines

def caption(img,clip,i,n,cap):
    ov=Image.new('RGBA',(W,Hh),(0,0,0,0)); d=ImageDraw.Draw(ov)
    d.rectangle([0,Hh-BAR,W,Hh],fill=(15,23,42,232))
    chip=f'{clip}. {CLIPS[clip][0]}  {i}/{n}'; fc=F('Bold',17)
    cw=fc.getlength(chip)+26; d.rounded_rectangle([24,Hh-BAR+16,24+cw,Hh-BAR+46],15,fill=ACC+(255,)); d.text((37,Hh-BAR+20),chip,font=fc,fill=(255,255,255))
    f=F('SemiBold',27); lines=wrap(cap,f,W-80-cw)
    if len(lines)>2 or (len(lines)==2 and f.getlength(lines[1])>W-80-cw): f=F('SemiBold',23); lines=wrap(cap,f,W-80-cw)
    y0=Hh-BAR+(BAR-len(lines)*(f.size+8))//2
    for j,l in enumerate(lines): d.text((44+cw,y0+j*(f.size+8)),l,font=f,fill=(255,255,255))
    return Image.alpha_composite(img.convert('RGBA'),ov)

def spotlight(img,rect,a,pulse):
    if not rect or a<=0: return img
    x,y,w,h=rect; ov=Image.new('RGBA',(W,Hh),(0,0,0,int(95*a))); m=Image.new('L',(W,Hh),255)
    ImageDraw.Draw(m).rounded_rectangle([x,y,x+w,y+h],10,fill=0); ov.putalpha(Image.eval(m,lambda v:int(v*95*a/255)))
    out=Image.alpha_composite(img,ov); d=ImageDraw.Draw(out)
    g=int(3+3*pulse)
    for k in range(3,0,-1): d.rounded_rectangle([x-k*2-g,y-k*2-g,x+w+k*2+g,y+h+k*2+g],12,outline=ACC+(int(50*a/k),),width=3)
    d.rounded_rectangle([x,y,x+w,y+h],10,outline=ACC+(int(255*a),),width=4)
    return out

ARROW=[(0,0),(0,26),(7,20),(12,32),(17,30),(12,18),(21,18)]
def cursor(img,pt,click_t):
    d=ImageDraw.Draw(img); x,y=pt
    if click_t is not None and 0<=click_t<1:
        r=10+30*click_t; d.ellipse([x-r,y-r,x+r,y+r],outline=ACC+(int(255*(1-click_t)),),width=4)
    pts=[(x+a,y+b) for a,b in ARROW]; d.polygon([(px+2,py+2) for px,py in pts],fill=(0,0,0,90)); d.polygon(pts,fill=(255,255,255,255),outline=(20,20,20,255))
    return img

def ease(t): return t*t*(3-2*t)

def title_card(clip,t):
    im=Image.new('RGB',(W,Hh),NAVY); d=ImageDraw.Draw(im)
    a=min(1,t/0.5)
    col=lambda c:tuple(int(NAVY[i]+(c[i]-NAVY[i])*a) for i in range(3))
    d.text((90,200),f'웹북 사용법  {clip} / 6',font=F('SemiBold',30),fill=col((255,190,140)))
    d.text((88,250),CLIPS[clip][0],font=F('ExtraBold',78),fill=col((255,255,255)))
    d.text((92,360),CLIPS[clip][1],font=F('Medium',30),fill=col((205,215,232)))
    d.rectangle([92,430,92+int(260*ease(min(1,t/1.2))),436],fill=ACC)
    d.text((92,600),'webbook-kr.github.io/maker.html',font=F('Medium',22),fill=col((150,165,190)))
    return im

def end_card(clip,t):
    im=Image.new('RGB',(W,Hh),NAVY); d=ImageDraw.Draw(im)
    nxt=str(int(clip)+1)
    msg=('다음: '+nxt+'. '+CLIPS[nxt][0]) if nxt in CLIPS else '끝 — 원고·PDF·반영표를 공유폴더에 보관'
    d.text((90,300),f'{clip}. {CLIPS[clip][0]}  끝',font=F('Bold',44),fill=(255,255,255))
    d.text((92,370),msg,font=F('Medium',30),fill=(205,215,232))
    return im

def render(clip):
    S=st[clip]; n=len(S)
    out=f'{H}/out/howto-{clip}.webm'
    mj=open(f'{H}/out/_tmp.mjpeg','wb')   # 이 ffmpeg 는 파이프 입력이 없어 JPEG 를 이어 붙인 파일로 넘긴다
    def emit(im):
        im.convert('RGB').save(mj,'JPEG',quality=93)
    nfr=0
    for f in range(int(FPS*2.4)): emit(title_card(clip,f/FPS)); nfr+=1
    prev=None; prev_pt=(W*0.5,Hh*0.42)
    for i,s in enumerate(S,1):
        base,rect=base_of(s)
        tgt=(rect[0]+rect[2]*0.62, rect[1]+rect[3]*0.62) if rect else prev_pt
        if rect and not s['click']: tgt=(rect[0]+rect[2]-18, rect[1]+rect[3]-10)
        hold=max(3.4,1.8+len(s['cap'])*0.08)
        frames=int(FPS*hold)
        for f in range(frames):
            t=f/FPS
            fade=min(1,t/0.45)
            img=Image.blend(prev,base,ease(fade)) if (prev is not None and fade<1) else base
            img=img.convert('RGBA')
            mv=ease(min(1,max(0,(t-0.25)/0.75)))
            pt=(prev_pt[0]+(tgt[0]-prev_pt[0])*mv, prev_pt[1]+(tgt[1]-prev_pt[1])*mv)
            a=ease(min(1,max(0,(t-0.6)/0.5)))
            img=spotlight(img,rect,a,(math.sin(t*5)+1)/2)
            ct=(t-1.0)/0.45 if s['click'] and rect else None
            img=cursor(img,pt,ct)
            img=caption(img,clip,i,n,s['cap'])
            emit(img); nfr+=1
        img.convert('RGB').resize((960,540),Image.LANCZOS).save(f'{H}/out/howto-{clip}-{i}.jpg',quality=82)   # 단계 사진 (영상이 안 나오는 기기용)
        prev=base; prev_pt=tgt
    for f in range(int(FPS*1.6)): emit(end_card(clip,f/FPS)); nfr+=1
    mj.close()
    p=subprocess.run([FF,'-y','-loglevel','error','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i',f'{H}/out/_tmp.mjpeg',
        '-c:v','libvpx','-b:v','2200k','-crf','8','-qmin','2','-qmax','30','-auto-alt-ref','0','-g','60',out])
    os.remove(f'{H}/out/_tmp.mjpeg')
    title_card(clip,2).save(f'{H}/out/howto-{clip}.jpg',quality=88)
    print(clip, n, 'steps', round(nfr/FPS,1),'s', p.returncode)

import os; os.makedirs(H+'/out',exist_ok=True)
for c in (sys.argv[1:] or list(CLIPS)): render(c)
