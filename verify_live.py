#!/usr/bin/env python3
"""라이브 배포 검증 — https://keeper6305.github.io/sue-matdongsan/ 를 360x780 모바일 뷰포트로 열어
   1) 인트로→시작→이동/숙이기/먹기→씹기 게이지→경고/게임오버 또는 클리어까지 실제 터치로 확인
   2) 콘솔 에러 0건, 가로 스크롤 넘침 0건 확인
   3) downloads/sue-game-start.png, downloads/sue-game-play.png 저장
"""
import asyncio, json, sys, os
from playwright.async_api import async_playwright

EXE = "/workspace/tmp/hs/chrome-headless-shell-linux64/chrome-headless-shell"
ENV = {"LD_LIBRARY_PATH": "/workspace/tmp/libs/root/usr/lib/x86_64-linux-gnu", "PATH": "/usr/bin:/bin"}
URL = sys.argv[1] if len(sys.argv) > 1 else "https://keeper6305.github.io/sue-matdongsan/"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE, args=["--no-sandbox","--disable-dev-shm-usage"], env=ENV)
        ctx = await b.new_context(viewport={"width":360,"height":780}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="ko-KR")
        pg = await ctx.new_page()
        logs, failed = [], []
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}") if m.type in ("error","warning") else None)
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        pg.on("requestfailed", lambda r: failed.append(f"{r.url} {r.failure}"))
        await pg.goto(URL, wait_until="networkidle", timeout=45000)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path="/workspace/downloads/sue-game-start.png")
        print("intro ok:", await pg.title())

        await pg.tap("#btnStart")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path="/workspace/downloads/sue-game-play.png")
        st = await pg.evaluate("""() => ({
            sw: document.documentElement.scrollWidth, iw: innerWidth,
            sh: document.documentElement.scrollHeight, ih: innerHeight,
            snack: document.querySelector('#hudSnack').textContent,
            chips: document.querySelector('#hideChip').textContent + ' / ' + document.querySelector('#mouthChip').textContent
        })""")
        print("layout:", json.dumps(st, ensure_ascii=False))

        # 터치 조작: 먹기 3 → 이동 → 숙이기 → 선생님 시야까지 대기
        for _ in range(3):
            await pg.tap("#btnEat"); await pg.wait_for_timeout(80)
        mouth = await pg.evaluate("document.querySelector('#mouthChip').textContent")
        print("eat test:", mouth)
        box = await pg.locator("#btnLeft").bounding_box()
        await pg.mouse.move(box["x"]+box["width"]/2, box["y"]+box["height"]/2)
        await pg.mouse.down(); await pg.wait_for_timeout(350); await pg.mouse.up()
        print("move test:", await pg.evaluate("document.querySelector('#sueGroup').getAttribute('transform')"))
        await pg.tap("#btnDuck"); await pg.wait_for_timeout(120)
        print("duck chip:", await pg.evaluate("document.querySelector('#hideChip').textContent"))

        # 게임오버 또는 클리어까지
        ended = None
        for i in range(260):
            cls = await pg.evaluate("document.querySelector('#overlay').className")
            if "show" in cls:
                ended = await pg.evaluate("document.querySelector('#overlay').innerText.slice(0,60)")
                break
            await pg.wait_for_timeout(150)
        print("ended:", ended.replace("\n"," ") if ended else "none(30s 내 미종료 — 정상일 수 있음)")
        print("console errors:", json.dumps(logs, ensure_ascii=False))
        print("request failures:", json.dumps(failed, ensure_ascii=False))
        await b.close()

asyncio.run(main())
