/* ずれっこ：演出（アストラウルトラのカットイン・NPC覚醒・紙ふぶき） */
'use strict';
function confetti(n) {
  var cols = ['#f6b93b', '#e8590c', '#2f9a5a', '#1c7ed6', '#ae3ec9', '#ffd43b'];
  for (var i = 0; i < n; i++) {
    var c = document.createElement('i'); c.className = 'confetti'; c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.animationDuration = (1.6 + Math.random() * 1.6) + 's'; c.style.animationDelay = (Math.random() * 0.4) + 's'; document.body.appendChild(c);
    setTimeout(function (x) { return function () { x.remove(); }; }(c), 3800);
  }
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

// ---- アストラウルトラのカットイン（約1.6秒・操作はふさがない） ----
var cutT;
function cutin(title, line, face) {
  var el = $('cutin'), bolt = 'fill="none" stroke="#fff" vector-effect="non-scaling-stroke" style="filter:drop-shadow(0 0 6px #9ef) drop-shadow(0 0 14px #a8f);stroke-width:';
  el.innerHTML = '<div class="ci-flash"></div><div class="ci-band"><div class="ci-in"><span class="ci-face">' + esc(face || '🐻😎') + '</span><span class="ci-t"><b>' + esc(title) + '</b><span>' + esc(line) + '</span></span></div></div>' +
    '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M70 0 L62 18 L72 22 L58 44 L66 47 L52 70" ' + bolt + '4px"/><path d="M22 0 L30 16 L20 21 L33 40 L25 44 L36 62" ' + bolt + '3px"/></svg>';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  var gm = $('game'); gm.classList.remove('quake'); void gm.offsetWidth; gm.classList.add('quake');
  clearTimeout(cutT); cutT = setTimeout(function () { el.classList.remove('on'); el.innerHTML = ''; }, 1700);
  sfx.thunder();
}

// ---- NPC覚醒（約7.4秒・タップでスキップ）。終わってから「最終決戦」BGM ----
var awT;
function awaken() {
  var el = $('awaken'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  var parts = '', kinds = ['', 'b', 'v'];
  for (var i = 0; i < 60; i++) {
    var delay = i < 12 ? 0.4 + Math.random() * 1.2 : i < 40 ? 2.6 + Math.random() * 1.2 : 3.95 + Math.random() * 1.4;
    parts += '<i class="aw-p ' + kinds[i % 3] + '" style="left:' + (Math.random() * 100).toFixed(1) + '%;--dx:' + Math.round(Math.random() * 120 - 60) + 'px;animation-duration:' + (1.6 + Math.random() * 0.9).toFixed(2) + 's;animation-delay:' + delay.toFixed(2) + 's;' + (Math.random() < .3 ? 'width:6px;height:6px' : '') + '"></i>';
  }
  $('awParts').innerHTML = parts;
  BGM.awakening = true; BGM.sync();
  function end() { el.classList.remove('on'); $('awParts').innerHTML = ''; clearTimeout(awT); BGM.awakening = false; BGM.sync(); }
  clearTimeout(awT); awT = setTimeout(end, 7450);
  el.onclick = function () { end(); try { if (sfxOut) sfxOut.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05); } catch (e) {} };
  try { awakenSfx(); } catch (e) {}
}
function awakenSfx() {
  unlockAudio(); var a = audioCtx; if (!a || a.state !== 'running' || soundOff) return;
  var t = a.currentTime + 0.03, out = a.createGain(); out.gain.value = 0.5; out.connect(a.destination); sfxOut = out;
  function boom(at, f0, f1, peak, rel) {
    var o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + rel); env(g, at, peak, 0.02, rel); o.connect(g); g.connect(out); o.start(at); o.stop(at + rel + 0.1);
    var n = noiseSrc(a, 0.5), lp = a.createBiquadFilter(), ng = a.createGain(); lp.type = 'lowpass'; lp.frequency.value = 900; env(ng, at, peak * 0.5, 0.01, 0.4); n.connect(lp); lp.connect(ng); ng.connect(out); n.start(at); n.stop(at + 0.5);
  }
  function chime(freqs, start, gap, vol, rel) { freqs.forEach(function (f, j) { var s = a.createOscillator(), g2 = a.createGain(), st = start + j * gap; s.type = 'triangle'; s.frequency.value = f; env(g2, st, vol, 0.01, rel); s.connect(g2); g2.connect(out); s.start(st); s.stop(st + rel + 0.1); }); }
  // 0〜1.6秒：低いうなり＋鼓動
  var r = a.createOscillator(), rg = a.createGain(), lfo = a.createOscillator(), lg = a.createGain(), rl = a.createBiquadFilter();
  r.type = 'sawtooth'; r.frequency.value = 41; rl.type = 'lowpass'; rl.frequency.value = 160;
  lfo.frequency.value = 5; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(rg.gain);
  rg.gain.setValueAtTime(0.0001, t); rg.gain.exponentialRampToValueAtTime(0.28, t + 1.5); rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.7);
  r.connect(rl); rl.connect(rg); rg.connect(out); r.start(t); lfo.start(t); r.stop(t + 2.8); lfo.stop(t + 2.8);
  [0.5, 0.75, 1.1, 1.35].forEach(function (d) { boom(t + d, 90, 45, 0.5, 0.18); });
  // 1.6秒：ASTRA ULTRA＋雷 → 2.6秒へ上昇音
  boom(t + 1.6, 220, 60, 0.6, 0.5); thunderAt(a, out, t + 1.6, 0.5);
  var w = noiseSrc(a, 1.1), bp = a.createBiquadFilter(), wg = a.createGain(); bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(200, t + 1.55); bp.frequency.exponentialRampToValueAtTime(5200, t + 2.6);
  wg.gain.setValueAtTime(0.0001, t + 1.55); wg.gain.exponentialRampToValueAtTime(0.7, t + 2.55); wg.gain.exponentialRampToValueAtTime(0.0001, t + 2.68); w.connect(bp); bp.connect(wg); wg.connect(out); w.start(t + 1.55); w.stop(t + 2.7);
  // 2.6秒：覚醒の大きな一撃＋雷
  boom(t + 2.6, 150, 26, 1.0, 1.8); thunderAt(a, out, t + 2.62, 0.7);
  // 3.6〜3.95秒：サングラスが落ちてきて「キラーン」
  var sw = a.createOscillator(), sg = a.createGain(); sw.type = 'sine'; sw.frequency.setValueAtTime(1800, t + 3.6); sw.frequency.exponentialRampToValueAtTime(500, t + 3.92); env(sg, t + 3.6, 0.12, 0.02, 0.3); sw.connect(sg); sg.connect(out); sw.start(t + 3.6); sw.stop(t + 3.95);
  boom(t + 3.95, 120, 34, 0.75, 1.2);
  chime([2093, 2637, 3136, 4186], t + 3.97, 0.05, 0.1, 0.6);
  chime([1046.5, 1318.5, 1568, 2093, 2637], t + 4.05, 0.08, 0.08, 0.9);
  [130.8, 196, 261.6, 329.6].forEach(function (f) {
    var o = a.createOscillator(), g2 = a.createGain(), lp = a.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t + 4); lp.frequency.exponentialRampToValueAtTime(2400, t + 5.2);
    g2.gain.setValueAtTime(0.0001, t + 4); g2.gain.exponentialRampToValueAtTime(0.06, t + 4.4); g2.gain.exponentialRampToValueAtTime(0.0001, t + 7.2);
    o.connect(lp); lp.connect(g2); g2.connect(out); o.start(t + 4); o.stop(t + 7.3);
  });
  // 4.8秒：もう一発の雷
  thunderAt(a, out, t + 4.8, 0.55);
}
