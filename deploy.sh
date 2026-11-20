#!/bin/sh
# 저장소가 만들어진 뒤 실행하면 push → GitHub Pages 활성화까지 한 번에 끝납니다.
#   sh repos/sue-matdongsan/deploy.sh
set -e
cd "$(dirname "$0")"
REPO="keeper6305/sue-matdongsan"

echo "== 1) 원격 저장소 확인"
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "!! $REPO 가 없습니다. https://github.com/new 에서 Public 저장소를 먼저 만들어 주세요."
  exit 1
fi

echo "== 2) push"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$REPO.git"
else
  git remote add origin "https://github.com/$REPO.git"
fi
git push -u origin main

echo "== 3) GitHub Pages는 gh-pages 브랜치에서 자동 게시됨"
gh api -X POST "/repos/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || \
gh api -X PUT "/repos/$REPO/pages" \
  -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true

echo "== 4) 빌드 대기"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  st=$(gh api "/repos/$REPO/pages" --jq .status 2>/dev/null || echo none)
  echo "   pages: $st"
  [ "$st" = "built" ] && break
  sleep 10
done
echo "== 완료: https://keeper6305.github.io/sue-matdongsan/"
