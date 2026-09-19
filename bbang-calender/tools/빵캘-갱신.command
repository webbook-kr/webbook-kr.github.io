#!/bin/bash
# 빵캘 일정 갱신 (맥 · 리눅스)
# 이 파일을 두 번 누르면 일정을 새로 모아 올립니다.
# 처음 한 번만: 파인더에서 이 파일 > 마우스 오른쪽 > 열기 를 누르세요.

cd "$(dirname "$0")/../.." || exit 1

echo ""
echo "  🍞 빵캘 일정 갱신"
echo "  ─────────────────────────────────────"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node 가 없습니다. https://nodejs.org 에서 LTS 를 받아 설치한 뒤 다시 실행해 주세요."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
  exit 1
fi

echo "  1/5  최신 상태로 맞추는 중..."
# 지난번에 만든 일정 파일은 어차피 다시 만듭니다. 붙들고 있으면 합치기가 막히니 놓아 줍니다.
git checkout --quiet -- bbang-calender/data/events.json bbang-calender/data/places.json bbang-calender/ics 2>/dev/null
git fetch --quiet origin main && git merge --quiet origin/main || {
  echo ""
  echo "  ⚠ 최신 상태로 맞추지 못했습니다."
  echo "    이 폴더에 손댄 파일이 남아 있어서 그렇습니다."
  echo "    아래 명령을 터미널에 붙여 넣으면 지금 상태를 버리고 최신으로 맞춥니다."
  echo ""
  echo "      cd \"$(pwd)\" && git reset --hard origin/main"
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다."
  exit 1
}

echo "  2/5  일정 모으는 중... (몇 분 걸립니다)"
node scripts/bbang-calender/collect.mjs

echo ""
echo "  3/5  장소를 지도 좌표로 바꾸는 중..."
node scripts/bbang-calender/geocode.mjs

echo ""
echo "  4/5  구독용 달력 굽는 중..."
node scripts/bbang-calender/ics.mjs

echo ""
echo "  5/5  올리는 중..."
git add bbang-calender/data/events.json bbang-calender/data/places.json bbang-calender/ics
if git diff --cached --quiet; then
  echo "  바뀐 일정이 없습니다. 올릴 것이 없습니다."
else
  git commit --quiet -m "빵캘: 일정 갱신 $(date +%Y-%m-%d) (내 컴퓨터에서)"
  if git push --quiet; then
    echo "  올렸습니다. 몇 분 뒤 https://epibrief.github.io/bbang-calender/ 에 반영됩니다."
  else
    echo "  ⚠ 올리지 못했습니다. 인터넷이나 깃허브 로그인을 확인해 주세요."
  fi
fi

echo ""
node -e "const d=require('./bbang-calender/data/events.json');console.log('  지금 담긴 행사 '+d.events.length+'건, 앞으로 열릴 행사 '+d.counts.upcoming+'건')" 2>/dev/null
echo ""
read -n 1 -s -r -p "  끝났습니다. 아무 키나 누르면 닫힙니다."
echo ""
