# 빵캘 — 보건의료 일정 달력

보건복지부, 질병관리청, 국민건강보험공단, 건강보험심사평가원, 학회까지.
흩어져 있던 공청회·세미나·학술대회 일정을 한 달력에 모으고, 개인 구글 캘린더에 그대로 담을 수 있게 만든 페이지입니다.

- 달력 화면: <https://webbook-kr.github.io/cal/>
- 전체 구독 주소: `https://webbook-kr.github.io/cal/ics/all.ics`
- 기관별 구독 주소: `https://webbook-kr.github.io/cal/ics/<기관 아이디>.ics` (예: `kdca.ics`)
- 갈래별 구독 주소: `https://webbook-kr.github.io/cal/ics/cat-gov.ics` 같은 꼴

## 파일이 하는 일

| 파일 | 하는 일 |
|---|---|
| `cal/index.html` | 달력 화면 한 장. 다른 파일에 기대지 않습니다 |
| `cal/data/sources.json` | 기관 20곳과 수집원 목록 |
| `cal/data/events.json` | 모아 놓은 일정 (수집기가 만듭니다) |
| `cal/data/manual.json` | 손으로 넣는 일정. 수집기가 늘 함께 합칩니다 |
| `cal/ics/*.ics` | 구글 캘린더가 읽는 구독 파일 |
| `scripts/cal/collect.mjs` | 각 기관 공고를 읽어 일정을 뽑습니다 |
| `scripts/cal/parse.mjs` | 한국어 공고문에서 날짜·장소·기관을 알아냅니다 |
| `scripts/cal/ics.mjs` | `events.json` 을 `.ics` 로 굽습니다 |
| `.github/workflows/calendar.yml` | 하루 두 번 저절로 돌립니다 |

## 손으로 돌려 보기

바깥 꾸러미를 받지 않습니다. Node 18 이상이면 바로 돌아갑니다.

**맥 / 리눅스 (터미널)**

```bash
cd ~/webbook-kr.github.io
node scripts/cal/collect.mjs          # 전체 수집
node scripts/cal/collect.mjs --only snu-health   # 한 곳만
node scripts/cal/collect.mjs --dry    # 파일에 쓰지 않고 결과만 보기
node scripts/cal/ics.mjs              # 구독 파일 굽기
python3 -m http.server 8777           # 미리 보기 → http://127.0.0.1:8777/cal/
```

**윈도우 (PowerShell)**

```powershell
cd $HOME\webbook-kr.github.io
node scripts\cal\collect.mjs
node scripts\cal\collect.mjs --only snu-health
node scripts\cal\collect.mjs --dry
node scripts\cal\ics.mjs
py -m http.server 8777                # 미리 보기 → http://127.0.0.1:8777/cal/
```

미리 보기를 멈출 때는 두 곳 모두 `Ctrl + C` 입니다. (맥에서도 `⌘`가 아니라 `Ctrl` 입니다)

## 수집이 되는 곳과 안 되는 곳

수집원은 모두 22곳입니다. 기관 공지·행사 게시판 20곳과, 여러 기관 행사가 한곳에 모이는 모음터 2곳입니다.

| 모음터 | 무엇이 올라오나 |
|---|---|
| 서울대 보건대학원 세미나정보 | 공공기관·학회 행사가 두루 올라옵니다. 가장 알찹니다 |
| NKIS 정책세미나안내 | 정부출연 연구기관 세미나. 보건의료 행사만 골라 받습니다 |

만들 때 돌려 본 결과는 이렇습니다.

- **잘 읽힘**: 보건복지부 행사, 질병관리청 공지, 국민건강보험공단, 건강보험심사평가원, 한국건강증진개발원, 대한예방의학회, 한국보건행정학회, 대한의학회, 한국역학회, 한국의료질향상학회
- **주소를 바꿔야 함**: 식품의약품안전처, 국립암센터, 한국보건사회연구원, 국립중앙의료원, 한국보건교육건강증진학회 (목록을 못 읽어 0줄로 나옵니다)
- **확인 못 함**: 한국보건의료연구원, 한국보건산업진흥원, 대한보건협회, 대한공공의학회 (만들던 환경에서 연결이 끊겼습니다. 국내에서는 열릴 수 있으니 한 번 돌려 보셔야 합니다)

수집기는 수집원마다 성공·실패를 `events.json` 의 `sources` 칸에 적어 둡니다.
한 곳이 실패해도 이미 모아 둔 일정은 지우지 않습니다.

기관 공지 게시판은 대개 제목에 날짜가 없습니다. 그래서 수집기가 글을 하나 열어 보고
`일시 :` 라고 적힌 줄을 찾아 날짜와 시간을 읽습니다. 한 게시판당 15건까지만 열어 봅니다.

## 기관 주소는 한 번 확인해 주셔야 합니다

`sources.json` 의 기관마다 `"verified": false` 로 되어 있습니다.
해외에서는 열리지 않아 게시판 주소를 눈으로 확인하지 못했다는 뜻입니다.
국내에서 주소를 한 번 열어 보시고, 맞으면 `true` 로 바꾸시면 됩니다.

## 손으로 일정 넣기

`cal/data/manual.json` 에 적으면 수집기가 늘 함께 합칩니다. 수집기가 지우지 않습니다.

```json
[
  {
    "org": "mohw",
    "title": "제3차 국민건강증진종합계획 공청회",
    "start": "2026-11-12",
    "end": "2026-11-12",
    "startTime": "14:00",
    "endTime": "17:00",
    "allDay": false,
    "place": "서울 코엑스 컨퍼런스룸 300호",
    "url": "https://www.mohw.go.kr/..."
  }
]
```

`org` 에 넣을 수 있는 값은 `sources.json` 의 기관 아이디입니다.
해당하는 곳이 없으면 `etc` 를 쓰고 `orgLabel` 에 기관 이름을 적어 주세요.

## 옮겨 적은 일정이라는 점

이 달력은 제목·날짜·장소·원문 링크만 담습니다. 공고 본문은 옮기지 않습니다.
누르면 각 기관 원문으로 갑니다. 신청과 마감은 원문이 언제나 정확합니다.
