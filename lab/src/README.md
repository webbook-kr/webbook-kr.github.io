# 클로드 코드 실습 영상 다시 만들기
1. 실습 결과 화면(ev/v1-full.png, v2-top.png, v3-empty.png, v3-top.png)을 찍는다 — event/index.html 단계별 커밋을 폰 크기(390×760, 2배)로
2. `narr.json` 대본 → `python tts.py` (edge-tts, 한국어 여성 음성 SunHi)
3. `python render.py` → claude-code-practice.mp4 (Pillow, imageio-ffmpeg). 스크립트 안의 경로 S 를 작업 폴더로 바꿔 쓴다
