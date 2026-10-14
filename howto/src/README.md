# 사용법 영상 다시 만들기

제작기·책·의견 화면이 바뀌면 영상도 다시 찍는다. 발행·의견 서버는 가짜 응답으로 대신하므로 실제 책에는 아무 영향이 없다.

1. 저장소 뿌리에서 `python3 -m http.server 8931`
2. `demo.md`를 제작기로 책 파일로 만들어 저장소 뿌리에 `_demo.html`로 둔다
3. `node record.mjs` → `frames/` 단계 화면과 `steps.json`
4. `python3 render.py` → `out/howto-1~6.webm`, 포스터·단계 사진 jpg (Pretendard 글꼴, Playwright 동봉 ffmpeg 사용)
5. `out/`의 webm·jpg를 `howto/`로 복사, `_demo.html` 지우기

스크립트 안의 경로(H)는 작업 폴더에 맞게 바꿔 쓴다. 영상 자막은 `record.mjs`의 각 `shot()` 줄에 있다.
