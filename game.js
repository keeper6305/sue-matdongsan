/* 슈의 수업시간에 맛동산 먹기 — 모바일 웹게임
   원작(iBravo 『슈의 수업시간에 맛동산 먹기』) 고증 재현
*/
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ============================ 설정 ============================ */
  const CFG = {
    mild: {
      key: 'mild', name: '순한맛', emoji: '🍯',
      teachMin: 3.2, teachMax: 4.6, suspect: 1.15, look: 1.25,
      sway: 16, swaySpeed: 1.4, hide: 30, duckHide: 70,
      snacks: 15, time: 50, chewK: 0.8
    },
    hot: {
      key: 'hot', name: '원작 매운맛', emoji: '🌶',
      teachMin: 2.4, teachMax: 3.4, suspect: 0.8, look: 1.55,
      sway: 34, swaySpeed: 2.0, hide: 28, duckHide: 64,
      snacks: 15, time: 50, chewK: 0.72
    }
  };

  const LS_BEST = 'sue.matdongsan.best.v1';
  const LS_OPT = 'sue.matdongsan.opt.v1';

  let opt = { diff: 'mild', duckMode: 'hold', muted: false };
  try { Object.assign(opt, JSON.parse(localStorage.getItem(LS_OPT) || '{}')); } catch (e) {}
  const saveOpt = () => { try { localStorage.setItem(LS_OPT, JSON.stringify(opt)); } catch (e) {} };

  function loadBest() { try { return JSON.parse(localStorage.getItem(LS_BEST) || '{}'); } catch (e) { return {}; } }
  function saveBest(b) { try { localStorage.setItem(LS_BEST, JSON.stringify(b)); } catch (e) {} }

  /* ============================ 사운드 ============================ */
  const SFX = {
    ctx: null, master: null, noiseBuf: null, muted: opt.muted,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    now() { return this.ctx ? this.ctx.currentTime : 0; },
    tone(freq, dur, type, vol, slideTo, delay) {
      if (this.muted || !this.ctx) return;
      const t = this.now() + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol == null ? 0.22 : vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, freq, q) {
      if (this.muted || !this.ctx || !this.noiseBuf) return;
      const t = this.now();
      const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = q || 1.1;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol == null ? 0.22 : vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur + 0.02);
    },
    eat() { this.noise(0.07, 0.18, 1700, 1.4); this.tone(520, 0.05, 'triangle', 0.08, 700); },
    crunch() { this.noise(0.09, 0.1, 1200, 0.9); },
    cue() { this.tone(760, 0.1, 'sine', 0.16, 560); this.tone(560, 0.14, 'sine', 0.14, 380, 0.1); },
    warn() { this.tone(300, 0.14, 'square', 0.16); this.tone(220, 0.2, 'square', 0.14, 160, 0.13); },
    caught() {
      this.tone(240, 0.5, 'sawtooth', 0.2, 70);
      this.noise(0.4, 0.18, 700, 0.7);
      this.tone(120, 0.6, 'square', 0.12, 60, 0.1);
    },
    clear() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.2, null, i * 0.11));
      notes.forEach((n, i) => this.tone(n / 2, 0.3, 'sine', 0.1, null, i * 0.11));
    },
    fail() {
      [440, 370, 294, 220].forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.18, null, i * 0.14));
    }
  };

  const buzz = (p) => { if (!opt.muted && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } };

  /* ============================ DOM ============================ */
  const el = {
    app: $('#app'),
    snack: $('#hudSnack'),
    warnCards: Array.from(document.querySelectorAll('#warnCards .wcard')),
    clockMin: $('#clockMinHand'),
    clockHour: $('#clockHourHand'),
    tBack: $('#teacherBack'),
    tFront: $('#teacherFront'),
    cone: $('#cone'),
    bubbleL: $('#bubbleL'), bubbleR: $('#bubbleR'),
    bubbleLText: $('#bubbleLText'), bubbleRText: $('#bubbleRText'),
    alert: $('#alertMark'),
    friend: $('#friendGroup'),
    sue: $('#sueGroup'),
    faceNormal: $('#faceNormal'), faceChew: $('#faceChew'), faceScared: $('#faceScared'),
    chewArc: $('#chewArc'), chewBg: $('#chewBg'),
    mouthBadge: $('#mouthBadge'), mouthBadgeText: $('#mouthBadgeText'),
    flashWarn: $('#flashWarn'), flashCatch: $('#flashCatch'),
    hint: $('#hint'),
    hideChip: $('#hideChip'), mouthChip: $('#mouthChip'), warnChip: $('#warnChip'),
    eatCount: $('#eatCount'), btnEat: $('#btnEat'),
    bag: $('#bag'),
    overlay: $('#overlay'),
    btnMute: $('#btnMute'), btnPause: $('#btnPause'),
    btnLeft: $('#btnLeft'), btnRight: $('#btnRight'), btnDuck: $('#btnDuck'),
    stage: $('#scene')
  };

  const ARC_LEN = 2 * Math.PI * 81;

  /* ============================ 상태 ============================ */
  let G = null;
  let paused = false;

  function chewTime(n, k) { return k * Math.pow(n, 1.4); } // 1개 1.0s → 4개 6.96s

  function newGame(diffKey) {
    const c = CFG[diffKey] || CFG.mild;
    return {
      c,
      phase: 'play',
      t: 0,
      sueX: 400,
      dir: 0,
      ducking: false,
      friendX: 400,
      swayPhase: 0,
      mouth: 0,
      chewDone: 0,
      chewNeed: 0,
      eaten: 0,
      remaining: c.snacks,
      warnings: 0,
      timeLeft: c.time,
      tState: 'teach',
      tTimer: rand(c.teachMin, c.teachMax),
      lookElapsed: 0,
      judged: false,
      chewingSfxTimer: 0,
      flashT: 0,
      scaredT: 0,
      shakeT: 0,
      captionT: 0,
      captionLine: 0,
      bump: null,
      bumpT: 0
    };
  }

  const CAPTIONS = {
    teach: ['공부 공부 공부 공부해하지', '이러쿵 저러쿵 어쩌구 저쩌구', '여러분 조용히 하세요', '받아쓰기 준비됐나요?'],
    suspect: ['……?', '어디서 냄새가 나는데?', '……'],
    look: ['어디서 소리가 났는데..', '거기! 뭐 하는 거야!', '너 방금 뭐 먹었지?']
  };

  /* ============================ 시작/종료 ============================ */
  function startGame(diffKey) {
    opt.diff = diffKey; saveOpt();
    paused = false;
    G = newGame(diffKey);
    hideOverlay();
    el.hint.classList.remove('show');
    SFX.init(); SFX.resume();
    setCaption('선생님이 칠판을 보고 있다. 지금이 기회!', 2.6);
    render(0);
  }

  function setCaption(text, secs) {
    if (!el.hint) return;
    el.hint.textContent = text;
    el.hint.classList.add('show');
    el.hint.classList.remove('urgent');
    if (G) { G.captionHold = secs || 0; }
  }

  function win() {
    if (G.phase !== 'play') return;
    G.phase = 'over';
    SFX.clear(); buzz([20, 60, 20, 60, 120]);
    const rec = { time: +(G.c.time - G.timeLeft).toFixed(1), warnings: G.warnings };
    const best = loadBest();
    const prev = best[G.c.key];
    const isBest = !prev || rec.time < prev.time;
    if (isBest) { best[G.c.key] = rec; saveBest(best); }
    setTimeout(() => showResult('clear', { rec, isBest }), 650);
  }

  function lose(reason) {
    if (G.phase !== 'play') return;
    G.phase = 'over';
    G.reason = reason;
    if (reason === 'caught') { SFX.caught(); buzz([40, 40, 160]); }
    else { SFX.fail(); buzz([30, 60, 30, 60, 200]); }
    setTimeout(() => showResult(reason, {}), 900);
  }

  /* ============================ 판정 ============================ */
  function isHidden() {
    const win = G.ducking ? G.c.duckHide : G.c.hide;
    return Math.abs(G.sueX - G.friendX) <= win;
  }

  function judge() {
    const hidden = isHidden();
    if (G.mouth > 0) {
      // 입에 과자가 남아 있는 걸 들켰다 — 무조건 게임오버
      G.phase = 'over';
      SFX.caught();
      buzz([40, 40, 160]);
      el.flashCatch.setAttribute('opacity', '0.75');
      G.shakeT = 1.2;
      G.scaredT = 999;
      setCaption('앗! 입에 과자가 남아 있었다!!', 3);
      setTimeout(() => showResult('caught', {}), 1250);
      return;
    }
    if (hidden) {
      // 앞자리 친구 뒤에 잘 숨었다
      setCaption('휴우… 안 들켰다', 1.1);
      return;
    }
    G.warnings++;
    SFX.warn(); buzz([20, 50, 20]);
    el.flashWarn.setAttribute('opacity', '0.6');
    G.flashT = 0.55;
    G.shakeT = 0.35;
    setCaption(G.warnings >= 3 ? '경고 3장! 교무실로 끌려갔다…' : '들켰다! 경고 ' + G.warnings + '장', 2);
    if (G.warnings >= 3) lose('kicked');
  }

  /* ============================ 업데이트 ============================ */
  function update(dt) {
    if (!G || G.phase !== 'play' || paused) return;
    const c = G.c;
    G.t += dt;

    // 시간
    G.timeLeft = Math.max(0, G.timeLeft - dt);
    if (G.timeLeft <= 0) { lose('timeup'); return; }

    // 슈 이동
    if (G.dir !== 0) G.sueX = clamp(G.sueX + G.dir * 300 * dt, 238, 574);

    // 앞자리 친구 흔들림 (선생님이 돌아보면 느려짐)
    const mul = G.tState === 'teach' ? 1 : (G.tState === 'suspect' ? 0.5 : 0.22);
    G.swayPhase += dt * c.swaySpeed * mul;
    G.friendX = 400 + Math.sin(G.swayPhase) * c.sway;

    // 씹기
    if (G.mouth > 0) {
      G.chewDone += dt;
      G.chewingSfxTimer -= dt;
      if (G.chewingSfxTimer <= 0) { SFX.crunch(); G.chewingSfxTimer = rand(0.28, 0.5); }
      if (G.chewDone >= G.chewNeed) {
        G.eaten += G.mouth;
        G.mouth = 0;
        G.chewDone = 0; G.chewNeed = 0;
        SFX.tone(660, 0.09, 'sine', 0.14, 880);
        if (G.remaining <= 0 && G.eaten >= c.snacks) { win(); return; }
      }
    }

    // 선생님 상태
    G.tTimer -= dt;
    if (G.tState === 'teach') {
      if (G.tTimer <= 0) {
        G.tState = 'suspect';
        G.tTimer = c.suspect;
        SFX.cue();
        G.alertT = 0.9;
      }
    } else if (G.tState === 'suspect') {
      if (G.tTimer <= 0) {
        G.tState = 'look';
        G.tTimer = c.look;
        G.lookElapsed = 0;
        G.judged = false;
      }
    } else if (G.tState === 'look') {
      G.lookElapsed += dt;
      if (!G.judged && G.lookElapsed > 0.32) { G.judged = true; judge(); if (G.phase !== 'play') return; }
      if (G.tTimer <= 0) {
        G.tState = 'teach';
        G.tTimer = rand(c.teachMin, c.teachMax);
      }
    }

    // 연출 타이머
    if (G.flashT > 0) { G.flashT -= dt; el.flashWarn.setAttribute('opacity', String(Math.max(0, G.flashT * 1.1))); }
    if (G.shakeT > 0) G.shakeT = Math.max(0, G.shakeT - dt);
    if (G.scaredT > 0) G.scaredT = Math.max(0, G.scaredT - dt);
    if (G.alertT > 0) G.alertT = Math.max(0, G.alertT - dt);
    if (G.captionHold > 0) {
      G.captionHold -= dt;
      if (G.captionHold <= 0) { el.hint.classList.remove('show'); }
    }
  }

  /* ============================ 렌더 ============================ */
  let captionTimer = 0;

  function render(dt) {
    if (!G) return;
    const c = G.c;

    // HUD
    el.snack.textContent = String(G.remaining);
    el.eatCount.textContent = String(G.remaining);
    el.eatCount.style.opacity = G.remaining > 0 ? '1' : '.5';
    el.warnCards.forEach((card, i) => card.classList.toggle('on', i < G.warnings));
    el.warnChip.textContent = '경고 ' + G.warnings + '/3';
    el.warnChip.className = 'chip' + (G.warnings === 0 ? '' : (G.warnings >= 2 ? ' chip-hot' : ' chip-bad'));

    // 시계: 10:00 → 10:50 (50초 동안 분침 300도)
    const frac = 1 - G.timeLeft / c.time;
    el.clockMin.setAttribute('transform', 'rotate(' + (frac * 300).toFixed(2) + ' 720 62)');
    el.clockHour.setAttribute('transform', 'rotate(' + (-60 + frac * 25).toFixed(2) + ' 720 62)');

    // 선생님
    const looking = G.tState === 'look';
    const suspect = G.tState === 'suspect';
    el.tFront.setAttribute('opacity', looking ? '1' : '0');
    el.tBack.setAttribute('opacity', looking ? '0' : '1');
    el.cone.setAttribute('opacity', looking ? String(0.86 + Math.sin(G.t * 26) * 0.08) : '0');
    el.alert.setAttribute('opacity', (suspect || G.alertT > 0) && !looking ? String(Math.min(1, (G.alertT || 0) * 1.6 + 0.5)) : (looking ? '1' : '0'));

    // 말풍선
    el.bubbleLText.textContent = suspect ? '…' : (looking ? '!' : '어쩌구');
    el.bubbleRText.textContent = suspect ? '…' : (looking ? '?!' : '저쩌구');

    // 친구
    const bob = Math.sin(G.swayPhase * 2) * 2.5;
    el.friend.setAttribute('transform', 'translate(' + (G.friendX - 400).toFixed(2) + ',' + bob.toFixed(2) + ')');

    // 슈
    const duckY = G.ducking ? 26 : 0;
    const duckS = G.ducking ? 0.86 : 1;
    const shake = G.shakeT > 0 ? Math.sin(G.t * 60) * 5 * G.shakeT : 0;
    el.sue.setAttribute('transform',
      'translate(' + shake.toFixed(2) + ',0) ' +
      'translate(400,584) scale(1,' + duckS + ') translate(-400,-584) ' +
      'translate(' + (G.sueX - 400).toFixed(2) + ',' + duckY + ')');

    // 표정
    const scaredNow = G.scaredT > 0 || (looking && !isHidden());
    const chewing = G.mouth > 0;
    el.faceNormal.setAttribute('opacity', (!chewing && !scaredNow) ? '1' : '0');
    el.faceChew.setAttribute('opacity', (chewing && !scaredNow) ? '1' : '0');
    el.faceScared.setAttribute('opacity', scaredNow ? '1' : '0');

    // 씹기 게이지
    if (chewing) {
      const p = clamp(G.chewDone / G.chewNeed, 0, 1);
      el.chewArc.setAttribute('opacity', '1');
      el.chewBg.setAttribute('opacity', '1');
      el.chewArc.setAttribute('stroke-dashoffset', String(ARC_LEN * (1 - p)));
      el.mouthBadge.setAttribute('opacity', '1');
      el.mouthBadgeText.textContent = '×' + G.mouth;
    } else {
      el.chewArc.setAttribute('opacity', '0');
      el.chewBg.setAttribute('opacity', '0');
      el.mouthBadge.setAttribute('opacity', '0');
    }

    // 칩
    const hidden = isHidden();
    el.hideChip.textContent = hidden ? (G.ducking ? '🙈 엎드려 숨음' : '🙈 숨음 OK') : '👀 노출!';
    el.hideChip.className = 'chip ' + (hidden ? 'chip-ok' : 'chip-bad');

    if (chewing) {
      const pct = Math.round(clamp(G.chewDone / G.chewNeed, 0, 1) * 100);
      el.mouthChip.textContent = '🍪 ' + G.mouth + '개 씹는 중 ' + pct + '%';
      el.mouthChip.className = 'chip chip-hot';
    } else if (G.remaining <= 0) {
      el.mouthChip.textContent = '👄 다 삼키면 클리어!';
      el.mouthChip.className = 'chip';
    } else {
      el.mouthChip.textContent = '😗 입 비었음 (먹기 가능)';
      el.mouthChip.className = 'chip chip-ok';
    }

    el.btnEat.classList.toggle('disabled', G.ducking || G.remaining <= 0);

    // 캡션 자동 순환
    if (G.phase === 'play' && !paused) {
      captionTimer -= dt;
      if (captionTimer <= 0 && G.captionHold <= 0) {
        const pool = CAPTIONS[G.tState] || CAPTIONS.teach;
        setCaption(pool[Math.floor(Math.random() * pool.length)], 1.9);
        captionTimer = 2.2;
      }
    }
  }

  /* ============================ 루프 ============================ */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (G) {
      if (G.phase === 'play') update(dt);
      render(dt);
    }
    requestAnimationFrame(frame);
  }

  /* ============================ 입력 ============================ */
  function bindHold(btn, onDown, onUp) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      SFX.init(); SFX.resume();
      btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
      btn.classList.add('pressed');
      onDown();
    });
    const up = (e) => {
      if (btn.classList.contains('pressed')) {
        btn.classList.remove('pressed');
        onUp();
      }
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function setDir(d) {
    if (!G || G.phase !== 'play') return;
    G.dir = d;
  }

  function setDuck(down) {
    if (!G || G.phase !== 'play') return;
    if (opt.duckMode === 'toggle') {
      if (down) G.ducking = !G.ducking;
    } else {
      G.ducking = down;
    }
    if (G.ducking && G.mouth > 0) { /* 엎드려도 씹기는 계속된다 */ }
  }

  function doEat() {
    if (!G || G.phase !== 'play' || paused) return;
    if (G.remaining <= 0) return;
    if (G.mouth >= 4) { bumpCaption('입이 가득! 4개가 한계다'); return; }
    if (G.ducking) { bumpCaption('엎드려선 먹을 수 없다!'); return; }
    G.remaining--;
    G.mouth++;
    const need = chewTime(G.mouth, G.c.chewK);
    G.chewNeed = need;
    SFX.eat();
    buzz(8);
  }

  let bumpT = 0;
  function bumpCaption(text) {
    setCaption(text, 1.2);
  }

  bindHold(el.btnLeft, () => setDir(-1), () => setDir(0));
  bindHold(el.btnRight, () => setDir(1), () => setDir(0));
  bindHold(el.btnDuck, () => setDuck(true), () => { if (opt.duckMode === 'hold') setDuck(false); });
  el.btnEat.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    SFX.init(); SFX.resume();
    doEat();
  });
  el.bag.addEventListener('pointerdown', (e) => { e.preventDefault(); SFX.init(); SFX.resume(); doEat(); });
  window.addEventListener('pointerup', () => {
    if (el.btnLeft.classList.contains('pressed')) { el.btnLeft.classList.remove('pressed'); setDir(0); }
    if (el.btnRight.classList.contains('pressed')) { el.btnRight.classList.remove('pressed'); setDir(0); }
    if (el.btnDuck.classList.contains('pressed')) {
      el.btnDuck.classList.remove('pressed');
      if (opt.duckMode === 'hold') setDuck(false);
    }
  });

  // 키보드
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', ' '].includes(e.key) || e.code === 'Space') e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (e.code === 'ArrowLeft') setDir(-1);
    if (e.code === 'ArrowRight') setDir(1);
    if (e.code === 'ArrowDown') setDuck(true);
    if (e.code === 'Space') doEat();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'ArrowLeft' && G && G.dir === -1) setDir(0);
    if (e.code === 'ArrowRight' && G && G.dir === 1) setDir(0);
    if (e.code === 'ArrowDown' && opt.duckMode === 'hold') setDuck(false);
  });

  /* ============================ 오버레이 ============================ */
  function hideOverlay() { el.overlay.classList.remove('show', 'clear-screen'); el.overlay.innerHTML = ''; }

  function bestLine(diffKey) {
    const b = loadBest()[diffKey];
    if (!b) return '아직 기록 없음 — 첫 기록을 세워보자!';
    return '최고 기록 <b>' + fmtTime(b.time) + '</b> · 경고 ' + b.warnings + '장';
  }

  function fmtTime(t) {
    const s = Math.max(0, t);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function introHTML() {
    return `
    <div class="sheet">
      <h1 class="game-title">슈의 수업시간에<br><span class="small">맛동산 먹기</span></h1>
      <div class="game-sub">🍪 50분 수업, 맛동산 15개를 몰래 다 먹어치워라!</div>
      <button class="start-btn" id="btnStart" aria-label="게임 시작">
        <svg viewBox="0 0 200 120">
          <ellipse cx="100" cy="60" rx="92" ry="50" fill="#E7A343" stroke="#8A4E0E" stroke-width="6"/>
          <ellipse cx="100" cy="54" rx="84" ry="43" fill="#F6C46A"/>
          <g fill="#C98A3A" opacity=".75">
            <circle cx="60" cy="44" r="3.4"/><circle cx="84" cy="30" r="3"/><circle cx="124" cy="34" r="3.4"/>
            <circle cx="142" cy="56" r="3"/><circle cx="108" cy="66" r="3.4"/><circle cx="70" cy="70" r="3"/>
            <circle cx="150" cy="44" r="2.6"/><circle cx="46" cy="62" r="2.6"/>
          </g>
          <ellipse cx="78" cy="40" rx="16" ry="9" fill="#FFE0A8" opacity=".7"/>
        </svg>
        <span class="start-txt"><b>게임 시작</b><span>START</span></span>
      </button>
      <div class="seg" id="segDiff">
        <button data-diff="mild" class="${opt.diff === 'mild' ? 'on' : ''}">🍯 순한맛</button>
        <button data-diff="hot" class="${opt.diff === 'hot' ? 'on' : ''}">🌶 원작 매운맛</button>
      </div>
      <div class="rules">
        <ul>
          <li><span class="k">1.</span><span>선생님이 <b>칠판을 보는 동안</b> 맛동산을 입에 넣자. 한 번에 <b>4개</b>까지!</span></li>
          <li><span class="k">2.</span><span>많이 넣을수록 <b>씹는 시간이 길어진다.</b> 돌아보기 전에 다 삼켜야 한다.</span></li>
          <li><span class="k">3.</span><span>선생님이 돌아보면 <b>앞자리 친구 뒤로</b> 숨자. 씹고 있으면 <b>즉시 들킨다!</b></span></li>
        </ul>
      </div>
      <div class="opt-row">
        <span>엎드리기:</span>
        <button data-duck="hold" class="${opt.duckMode === 'hold' ? 'on' : ''}">누르는 동안</button>
        <button data-duck="toggle" class="${opt.duckMode === 'toggle' ? 'on' : ''}">토글</button>
      </div>
      <div class="best-line">${bestLine(opt.diff)}</div>
    </div>`;
  }

  function bindIntro() {
    const seg = $('#segDiff');
    if (seg) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-diff]');
        if (!b) return;
        opt.diff = b.dataset.diff; saveOpt();
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const bl = el.overlay.querySelector('.best-line');
        if (bl) bl.innerHTML = bestLine(opt.diff);
      });
    }
    const duckBtns = el.overlay.querySelectorAll('[data-duck]');
    duckBtns.forEach((b) => b.addEventListener('click', () => {
      opt.duckMode = b.dataset.duck; saveOpt();
      duckBtns.forEach((x) => x.classList.toggle('on', x === b));
    }));
    const st = $('#btnStart');
    if (st) st.addEventListener('click', () => { SFX.init(); SFX.resume(); startGame(opt.diff); });
  }

  function showIntro() {
    el.overlay.innerHTML = introHTML();
    el.overlay.classList.add('show');
    bindIntro();
  }

  /* ---------- 결과 화면 ---------- */
  const ART_CAUGHT = `
  <svg viewBox="0 0 320 200" class="clear-art" aria-label="복도에서 의자 들고 벌 서는 슈">
    <rect x="0" y="0" width="320" height="200" fill="#EFDFC4"/>
    <rect x="0" y="0" width="320" height="22" fill="#D9C7A6"/>
    <rect x="0" y="150" width="320" height="50" fill="#D6B98F"/>
    <g stroke="#C4A377" stroke-width="2">
      <line x1="0" y1="168" x2="320" y2="168"/><line x1="0" y1="186" x2="320" y2="186"/>
      <line x1="60" y1="150" x2="40" y2="200"/><line x1="250" y1="150" x2="268" y2="200"/>
    </g>
    <!-- doors -->
    <g>
      <rect x="10" y="34" width="62" height="116" rx="4" fill="#A8C6D8" stroke="#7C9DB1" stroke-width="3"/>
      <rect x="18" y="42" width="46" height="44" rx="2" fill="#C7DDEA"/>
      <rect x="18" y="94" width="46" height="46" rx="2" fill="#C7DDEA"/>
      <circle cx="62" cy="96" r="4" fill="#7C9DB1"/>
      <rect x="248" y="34" width="62" height="116" rx="4" fill="#A8C6D8" stroke="#7C9DB1" stroke-width="3"/>
      <rect x="256" y="42" width="46" height="44" rx="2" fill="#C7DDEA"/>
      <rect x="256" y="94" width="46" height="46" rx="2" fill="#C7DDEA"/>
      <circle cx="256" cy="96" r="4" fill="#7C9DB1"/>
    </g>
    <!-- 교실 문 -->
    <rect x="126" y="28" width="70" height="122" rx="4" fill="#C9A574" stroke="#9C7746" stroke-width="3"/>
    <rect x="134" y="36" width="54" height="50" rx="3" fill="#E3C79B"/>
    <rect x="134" y="92" width="54" height="50" rx="3" fill="#E3C79B"/>
    <circle cx="183" cy="84" r="4" fill="#7A5A32"/>
    <rect x="126" y="22" width="70" height="8" rx="3" fill="#9C7746"/>
    <!-- 슈 -->
    <g transform="translate(160,118)">
      <!-- chair held overhead -->
      <g>
        <rect x="-27" y="-132" width="54" height="9" rx="4" fill="#C4864A" stroke="#7E4E1C" stroke-width="2.5"/>
        <rect x="-27" y="-126" width="6" height="30" fill="#A96F35"/>
        <rect x="21" y="-126" width="6" height="30" fill="#A96F35"/>
        <rect x="-30" y="-100" width="60" height="10" rx="4" fill="#B5793C" stroke="#7E4E1C" stroke-width="2.5"/>
        <rect x="-26" y="-92" width="6" height="24" fill="#A96F35"/>
        <rect x="20" y="-92" width="6" height="24" fill="#A96F35"/>
        <rect x="-30" y="-58" width="60" height="5" rx="2" fill="#8A5A28" opacity=".25"/>
      </g>
      <!-- arms -->
      <path d="M-18,-30 q-18,-16 -12,-40" stroke="#FFDCC0" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M18,-30 q18,-16 12,-40" stroke="#FFDCC0" stroke-width="9" fill="none" stroke-linecap="round"/>
      <!-- legs -->
      <rect x="-14" y="28" width="11" height="26" rx="5" fill="#FFDCC0"/>
      <rect x="3" y="28" width="11" height="26" rx="5" fill="#FFDCC0"/>
      <ellipse cx="-8" cy="56" rx="11" ry="6" fill="#7A4A8C"/>
      <ellipse cx="9" cy="56" rx="11" ry="6" fill="#7A4A8C"/>
      <!-- skirt -->
      <path d="M-24,10 q24,-6 48,0 l6,22 q-30,8 -60,0z" fill="#9B7BD4" stroke="#7B5CB4" stroke-width="2"/>
      <!-- body -->
      <path d="M-22,-30 q22,-9 44,0 l4,42 q-26,7 -52,0z" fill="#A98BE0"/>
      <path d="M0,-30 q-12,3 -18,10 l18,14 l18,-14 q-6,-7 -18,-10z" fill="#FFFFFF"/>
      <path d="M-6,-16 q6,5 12,0 q-2,7 -6,8 q-4,-1 -6,-8z" fill="#FFD34E"/>
      <!-- head -->
      <circle cx="0" cy="-52" r="27" fill="#FFDFC4"/>
      <path d="M-27,-54 q2,-27 27,-27 q25,0 27,27 q-14,-12 -27,-9 q-13,-3 -27,9z" fill="#FF8CC4"/>
      <circle cx="-25" cy="-64" r="11" fill="#FFA8D2"/><circle cx="-25" cy="-64" r="5" fill="#FFD3E8"/>
      <circle cx="25" cy="-64" r="11" fill="#FFA8D2"/><circle cx="25" cy="-64" r="5" fill="#FFD3E8"/>
      <!-- sad eyes -->
      <g stroke="#4A2B12" stroke-width="2.6" fill="none" stroke-linecap="round">
        <path d="M-15,-54 q6,-5 12,0"/><path d="M3,-54 q6,-5 12,0"/>
      </g>
      <circle cx="-9" cy="-58" r="2.2" fill="#4A2B12"/>
      <circle cx="9" cy="-58" r="2.2" fill="#4A2B12"/>
      <!-- tear -->
      <path d="M18,-50 q4,7 0,10 q-4,-3 0,-10z" fill="#7FD1F2"/>
      <!-- mouth -->
      <path d="M-8,-38 q8,-7 16,0" stroke="#C4644E" stroke-width="2.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="-18" cy="-46" rx="5" ry="3" fill="#FFA8C8" opacity=".7"/>
      <ellipse cx="18" cy="-46" rx="5" ry="3" fill="#FFA8C8" opacity=".7"/>
    </g>
    <!-- 웅성웅성 -->
    <g font-size="11" font-weight="800" fill="#9C7746" opacity=".8">
      <text x="214" y="70">웅성웅성</text>
      <text x="30" y="164">지나가는 아이들</text>
    </g>
  </svg>`;

  const ART_CLEAR = `
  <svg viewBox="0 0 300 170" class="clear-art" aria-label="클리어 기념">
    <ellipse cx="150" cy="150" rx="130" ry="16" fill="#E34A83" opacity=".25"/>
    <!-- friend -->
    <g transform="translate(196,86)">
      <ellipse cx="0" cy="60" rx="52" ry="26" fill="#B98BE0"/>
      <path d="M-26,44 q26,-10 52,0 l4,18 q-30,10 -60,0z" fill="#A97BD8"/>
      <circle cx="0" cy="6" r="38" fill="#F7941E" stroke="#D97F14" stroke-width="2"/>
      <path d="M0,-4 q-24,2 -28,26 q-2,-24 10,-32 q-8,-4 -10,-10 q14,8 28,4 q14,4 28,-4 q-2,6 -10,10 q12,8 10,32 q-4,-24 -28,-26z" fill="#FCAE4E" opacity=".8"/>
      <g fill="#4A2B12"><ellipse cx="-11" cy="4" rx="3.4" ry="4.4"/><ellipse cx="11" cy="4" rx="3.4" ry="4.4"/></g>
      <path d="M-8,20 q8,8 16,0" stroke="#9C5A12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="-19" cy="14" rx="5" ry="3" fill="#FFB8A0" opacity=".8"/>
      <ellipse cx="19" cy="14" rx="5" ry="3" fill="#FFB8A0" opacity=".8"/>
    </g>
    <!-- sue -->
    <g transform="translate(104,84)">
      <ellipse cx="0" cy="62" rx="48" ry="24" fill="#9B7BD4"/>
      <path d="M-24,46 q24,-10 48,0 l4,18 q-28,10 -56,0z" fill="#A98BE0"/>
      <path d="M0,46 q-12,3 -16,10 l16,12 l16,-12 q-4,-7 -16,-10z" fill="#FFFFFF"/>
      <path d="M-6,58 q6,5 12,0 q-2,7 -6,8 q-4,-1 -6,-8z" fill="#FFD34E"/>
      <circle cx="0" cy="4" r="34" fill="#FFDFC4"/>
      <path d="M-35,4 q0,-36 35,-36 q35,0 35,36 q-10,-20 -35,-16 q-25,-4 -35,16z" fill="#FF8CC4"/>
      <path d="M-30,-6 q10,-20 30,-20 q20,0 30,20 q-14,-8 -30,-8 q-16,0 -30,8z" fill="#FFB0D8" opacity=".8"/>
      <circle cx="-32" cy="-12" r="14" fill="#FFA8D2" stroke="#E86BA4" stroke-width="2"/>
      <circle cx="32" cy="-12" r="14" fill="#FFA8D2" stroke="#E86BA4" stroke-width="2"/>
      <circle cx="-32" cy="-12" r="7" fill="#FFD3E8"/><circle cx="32" cy="-12" r="7" fill="#FFD3E8"/>
      <g>
        <ellipse cx="-12" cy="4" rx="6" ry="7" fill="#FFF"/>
        <ellipse cx="-12" cy="4" rx="4.4" ry="5.6" fill="#7B4BC9"/>
        <circle cx="-13.5" cy="1" r="1.8" fill="#FFF"/>
        <ellipse cx="12" cy="4" rx="6" ry="7" fill="#FFF"/>
        <ellipse cx="12" cy="4" rx="4.4" ry="5.6" fill="#7B4BC9"/>
        <circle cx="10.5" cy="1" r="1.8" fill="#FFF"/>
      </g>
      <path d="M-7,18 q7,9 14,0" stroke="#C4644E" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <ellipse cx="-20" cy="12" rx="6" ry="3.5" fill="#FF9CC0" opacity=".7"/>
      <ellipse cx="20" cy="12" rx="6" ry="3.5" fill="#FF9CC0" opacity=".7"/>
      <!-- bag -->
      <g transform="translate(46,34)">
        <path d="M-16,4 q-4,26 4,32 q14,6 28,0 q8,-6 4,-32z" fill="#F6C46A" stroke="#B57A22" stroke-width="2"/>
        <path d="M-14,4 h28 l-3,-10 q-12,-4 -22,0z" fill="#F9D98F" stroke="#B57A22" stroke-width="2"/>
        <rect x="-8" y="14" width="16" height="12" rx="2" fill="#C0392B"/>
        <text x="0" y="24" text-anchor="middle" font-size="6" font-weight="900" fill="#FFE9A8">맛동산</text>
      </g>
    </g>
  </svg>`;

  function showResult(kind, data) {
    const c = G ? G.c : CFG[opt.diff];
    const rec = data.rec || { time: 0, warnings: 0 };
    let html = '';

    if (kind === 'clear') {
      html = `
      <div class="sheet">
        <div class="clear-word">CONGRATULATION</div>
        <div class="game-sub">🍪 맛동산 ${c.snacks}개 완식! 수업이 끝나기 전에 다 먹었다</div>
        ${ART_CLEAR}
        <div class="result-card">
          <div class="result-title">${data.isBest ? '🏆 신기록!' : '클리어!'}</div>
          <div class="stats">
            <div class="stat"><span>클리어 시간</span><b>${fmtTime(rec.time)}</b></div>
            <div class="stat"><span>경고</span><b>${rec.warnings}장</b></div>
            <div class="stat"><span>남은 시간</span><b>${fmtTime(c.time - rec.time)}</b></div>
          </div>
          <div class="best-line">${bestLine(c.key)}</div>
          <div class="btn-row">
            <button class="btn" id="btnHome">난이도</button>
            <button class="btn primary" id="btnRetry">한 판 더</button>
          </div>
        </div>
      </div>`;
      el.overlay.classList.add('clear-screen');
    } else if (kind === 'caught') {
      html = `
      <div class="sheet">
        <div class="game-title" style="font-size:26px">딱 걸렸다!</div>
        ${ART_CAUGHT}
        <div class="result-card">
          <div class="result-title">복도에서 의자 들고 벌 서기</div>
          <div class="result-desc">선생님이 돌아본 순간, 입에 맛동산이 남아 있었다.<br>씹는 소리는 앞자리 친구 머리로도 못 가린다…</div>
          <div class="stats">
            <div class="stat"><span>먹은 개수</span><b>${G ? G.eaten : 0}개</b></div>
            <div class="stat"><span>경고</span><b>${G ? G.warnings : 0}장</b></div>
          </div>
          <div class="btn-row">
            <button class="btn" id="btnHome">난이도</button>
            <button class="btn primary" id="btnRetry">다시 도전</button>
          </div>
        </div>
      </div>`;
    } else if (kind === 'kicked') {
      html = `
      <div class="sheet">
        <div class="game-title" style="font-size:26px">경고 3장!</div>
        ${ART_CAUGHT}
        <div class="result-card">
          <div class="result-title">교무실로 끌려갔다</div>
          <div class="result-desc">경고가 3장 쌓였다. 앞자리 친구 뒤에 제대로 숨지 못한 탓이다.<br>선생님이 돌아보기 전에 꼭 숨자.</div>
          <div class="stats">
            <div class="stat"><span>먹은 개수</span><b>${G ? G.eaten : 0}개</b></div>
            <div class="stat"><span>남은 과자</span><b>${G ? G.remaining : 0}개</b></div>
          </div>
          <div class="btn-row">
            <button class="btn" id="btnHome">난이도</button>
            <button class="btn primary" id="btnRetry">다시 도전</button>
          </div>
        </div>
      </div>`;
    } else {
      html = `
      <div class="sheet">
        <div class="game-title" style="font-size:26px">종이 쳤다!</div>
        <div class="result-card">
          <div class="result-title">수업 종료 — 다 못 먹었다</div>
          <div class="result-desc">맛동산이 ${G ? G.remaining : 0}개나 남았다.<br>더 빨리, 더 많이 입에 넣어야 한다.</div>
          <div class="stats">
            <div class="stat"><span>먹은 개수</span><b>${G ? G.eaten : 0}/${c.snacks}</b></div>
            <div class="stat"><span>경고</span><b>${G ? G.warnings : 0}장</b></div>
          </div>
          <div class="btn-row">
            <button class="btn" id="btnHome">난이도</button>
            <button class="btn primary" id="btnRetry">다시 도전</button>
          </div>
        </div>
      </div>`;
    }

    el.overlay.innerHTML = html;
    el.overlay.classList.add('show');
    const retry = $('#btnRetry'), home = $('#btnHome');
    if (retry) retry.addEventListener('click', () => startGame(c.key));
    if (home) home.addEventListener('click', () => { G = null; showIntro(); });
  }

  /* ---------- 일시정지 ---------- */
  function togglePause(force) {
    if (!G || G.phase !== 'play') return;
    const want = force == null ? !paused : force;
    if (want === paused) return;
    paused = want;
    if (paused) {
      el.overlay.innerHTML = `
      <div class="sheet">
        <div class="pause-card">
          <h2>⏸ 잠깐 멈춤</h2>
          <div class="result-desc">선생님도 잠시 쉬는 중</div>
          <div class="btn-row">
            <button class="btn" id="btnRestart2">다시 시작</button>
            <button class="btn primary" id="btnResume">계속하기</button>
          </div>
          <button class="btn" id="btnHome2" style="width:100%;padding:9px">난이도 선택으로</button>
        </div>
      </div>`;
      el.overlay.classList.add('show');
      $('#btnResume').addEventListener('click', () => togglePause(false));
      $('#btnRestart2').addEventListener('click', () => { paused = false; startGame(G.c.key); });
      $('#btnHome2').addEventListener('click', () => { paused = false; G = null; showIntro(); });
    } else {
      hideOverlay();
      last = performance.now();
    }
  }

  el.btnPause.addEventListener('click', () => togglePause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) togglePause(true); });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  /* ---------- 음소거 ---------- */
  function syncMute() {
    el.btnMute.textContent = opt.muted ? '🔇' : '🔊';
    el.btnMute.classList.toggle('off', opt.muted);
    SFX.muted = opt.muted;
  }
  el.btnMute.addEventListener('click', () => {
    opt.muted = !opt.muted; saveOpt(); syncMute();
    if (!opt.muted) { SFX.init(); SFX.resume(); SFX.tone(660, 0.1, 'sine', 0.18); }
  });

  /* ============================ 부트 ============================ */
  syncMute();
  showIntro();
  requestAnimationFrame(frame);
})();
