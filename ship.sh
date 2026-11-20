#!/bin/sh
# main에 커밋한 뒤 실행하면 main + gh-pages(실제 배포 브랜치)를 함께 밀어 올립니다.
set -e
cd "$(dirname "$0")"
git push origin main
git push origin main:gh-pages
echo "배포 완료 → https://keeper6305.github.io/sue-matdongsan/"
