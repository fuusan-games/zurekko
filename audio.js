/* ずれっこ：効果音（Web Audio で合成。外部音源なし） */
'use strict';
var audioCtx = null, sfxOut = null;
function unlockAudio() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!audioCtx) { audioCtx = new AC(); audioCtx.onstatechange = function () { BGM.sync(); }; }
    if (audioCtx.state === 'suspended') audioCtx.resume().then(function () { BGM.sync(); }, function () {}); else BGM.sync();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
function noiseSrc(a, sec) { var len = Math.floor(a.sampleRate * sec), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; var n = a.createBufferSource(); n.buffer = buf; return n; }
function env(g, at, peak, atk, rel) { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + atk); g.gain.exponentialRampToValueAtTime(0.0001, at + atk + rel); }
function thunderAt(a, out, at, vol) {
  var n = noiseSrc(a, 1.4), hp = a.createBiquadFilter(), g = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 1800; env(g, at, vol * 0.8, 0.005, 0.25); n.connect(hp); hp.connect(g); g.connect(out); n.start(at); n.stop(at + 0.4);
  var r = noiseSrc(a, 1.6), lp = a.createBiquadFilter(), rg = a.createGain(); lp.type = 'lowpass'; lp.frequency.value = 260; env(rg, at + 0.05, vol, 0.08, 1.3); r.connect(lp); lp.connect(rg); rg.connect(out); r.start(at + 0.05); r.stop(at + 1.6);
}
var sfx = (function () {
  function ctx() { var a = audioCtx; return a && a.state === 'running' && !soundOff ? a : null; }
  function out(a, v) { var g = a.createGain(); g.gain.value = v; g.connect(a.destination); return g; }
  function tone(a, o, f, at, dur, type, vol, f2) { var x = a.createOscillator(), g = a.createGain(); x.type = type || 'sine'; x.frequency.setValueAtTime(f, at); if (f2) x.frequency.exponentialRampToValueAtTime(f2, at + dur); env(g, at, vol, 0.008, dur); x.connect(g); g.connect(o); x.start(at); x.stop(at + dur + 0.05); return x; }
  function S(fn) { return function () { var a = ctx(); if (!a) return; try { fn(a, a.currentTime); } catch (e) {} }; }
  return {
    hint: S(function (a, t) { var o = out(a, 0.3); tone(a, o, 660, t, 0.09, 'triangle', 0.4, 990); tone(a, o, 1320, t + 0.07, 0.16, 'sine', 0.25); }),
    chat: S(function (a, t) { var o = out(a, 0.18); tone(a, o, 880, t, 0.06, 'sine', 0.3); tone(a, o, 1175, t + 0.05, 0.08, 'sine', 0.22); }),
    npc: S(function (a, t) { var o = out(a, 0.16); tone(a, o, 523, t, 0.07, 'square', 0.12); tone(a, o, 784, t + 0.06, 0.09, 'triangle', 0.2); }),
    turn: S(function (a, t) { var o = out(a, 0.25); [784, 988, 1318].forEach(function (f, i) { tone(a, o, f, t + i * 0.09, 0.22, 'triangle', 0.35); }); }),
    vote: S(function (a, t) { var o = out(a, 0.35), n = noiseSrc(a, 0.12), lp = a.createBiquadFilter(), g = a.createGain(); lp.type = 'lowpass'; lp.frequency.value = 900; env(g, t, 0.8, 0.004, 0.1); n.connect(lp); lp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.12); tone(a, o, 180, t, 0.18, 'sine', 0.5, 90); }),
    tick: S(function (a, t) { var o = out(a, 0.12); tone(a, o, 1500, t, 0.04, 'square', 0.15); }),
    drum: S(function (a, t) { var o = out(a, 0.3); for (var i = 0; i < 22; i++) { var at = t + i * 0.055, n = noiseSrc(a, 0.06), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2; env(g, at, 0.15 + i * 0.02, 0.003, 0.05); n.connect(bp); bp.connect(g); g.connect(o); n.start(at); n.stop(at + 0.07); } tone(a, o, 110, t + 1.25, 0.5, 'sine', 0.7, 55); }),
    wolf: S(function (a, t) { var o = out(a, 0.35); tone(a, o, 330, t, 0.9, 'sawtooth', 0.18, 520); tone(a, o, 247, t + 0.05, 0.9, 'sawtooth', 0.12, 390); var x = a.createOscillator(), g = a.createGain(), lf = a.createOscillator(), lg = a.createGain(); x.type = 'triangle'; x.frequency.value = 440; lf.frequency.value = 6; lg.gain.value = 14; lf.connect(lg); lg.connect(x.frequency); env(g, t + 0.2, 0.25, 0.3, 1.1); x.connect(g); g.connect(o); x.start(t + 0.2); lf.start(t + 0.2); x.stop(t + 1.7); lf.stop(t + 1.7); }),
    win: S(function (a, t) { var o = out(a, 0.3); [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(a, o, f, t + i * 0.09, 0.35, 'triangle', 0.35); tone(a, o, f * 2, t + i * 0.09, 0.2, 'sine', 0.08); }); tone(a, o, 1046, t + 0.5, 0.9, 'sawtooth', 0.08); }),
    lose: S(function (a, t) { var o = out(a, 0.3); [392, 370, 349, 262].forEach(function (f, i) { tone(a, o, f, t + i * 0.22, i === 3 ? 0.8 : 0.22, 'triangle', 0.35); }); }),
    flip: S(function (a, t) { var o = out(a, 0.25), n = noiseSrc(a, 0.1), bp = a.createBiquadFilter(), g = a.createGain(); bp.type = 'bandpass'; bp.Q.value = 1; bp.frequency.setValueAtTime(1200, t); bp.frequency.exponentialRampToValueAtTime(4000, t + 0.08); env(g, t, 0.5, 0.005, 0.08); n.connect(bp); bp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.1); }),
    thunder: S(function (a, t) { var o = out(a, 0.45); thunderAt(a, o, t + 0.01, 0.6); })
  };
})();
function setSound(off) {
  soundOff = off; store(LS_SOUND, off ? '1' : null);
  if (off && sfxOut) { try { sfxOut.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05); } catch (e) {} }
  if (!off) unlockAudio();
  BGM.sync(); soundUi();
}
function soundUi() { $('soundBtn').textContent = soundOff ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', soundOff ? '音をオンにする' : '音をオフにする'); $('menuSound').textContent = soundOff ? '🔇 BGM・効果音：オフ' : '🔊 BGM・効果音：オン'; }
$('soundBtn').onclick = function () { setSound(!soundOff); toast(soundOff ? '🔇 音をオフにしました' : '🔊 音をオンにしました'); };
$('menuSound').onclick = function () { setSound(!soundOff); };
soundUi();
