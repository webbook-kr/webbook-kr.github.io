# webbook-publish (수파베이스 엣지 함수)

`ebook/maker.html`의 "발행하기"가 호출하는 함수. 프로젝트 `korea-now`(dxhmprqfgigljgbstqrg)에 배포됨.

- 입력: `{ code, title, html, locked?, slug?, token? }`
- 발행 코드(`public.webbook_codes`, active=true)가 맞으면 공개 버킷 `webbook/<slug>/index.html`에 올리고 `{ url, slug, token }` 반환
- `slug + token`을 함께 보내면 같은 주소를 덮어씀 (token은 브라우저 localStorage에만 저장, 서버엔 해시만)
- 저장 경로는 영문·숫자만. 한글 제목은 `book-난수`

## 발행 코드 바꾸기
수파베이스 대시보드 → Table Editor → `webbook_codes`
- 새 코드 추가: 행 추가 (code, label)
- 기존 코드 막기: `active`를 false로

## 배포
소스는 `index.ts`. 수파베이스 MCP `deploy_edge_function`(verify_jwt=false) 또는 CLI:
```
supabase functions deploy webbook-publish --no-verify-jwt --project-ref dxhmprqfgigljgbstqrg
```
