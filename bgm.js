/* ずれっこ：BGM（Web Audio で合成）
 * normal：ひそひそ探偵（Dドリア・100BPM）／ epic：「最終決戦」（D短調・150BPM、アストラウルトラ時だけ）
 */
'use strict';
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
var TRACKS = {
  // normal：「ひそひそ探偵」— かわいいけど少しあやしい（Dドリア・100BPM、ピチカート風）
  normal: { bpm: 100, vol: 1.25,
    chords: [[50, 53, 57], [48, 52, 55], [50, 53, 57], [55, 59, 62], [46, 50, 53], [48, 52, 55], [45, 49, 52], [45, 49, 52]],
    mel: [[[0, 74, 1], [2, 77, 1], [4, 76, 1], [6, 74, 2], [10, 69, 2], [12, 72, 2]], [[0, 71, 1], [2, 72, 1], [4, 74, 2], [8, 76, 1], [10, 72, 2], [14, 67, 2]],
      [[0, 74, 1], [2, 77, 1], [4, 81, 2], [8, 79, 1], [10, 77, 1], [12, 76, 2]], [[0, 79, 2], [4, 83, 1], [6, 81, 1], [8, 79, 4], [14, 74, 1]],
      [[0, 77, 1], [2, 74, 1], [4, 70, 2], [8, 74, 1], [10, 77, 1], [12, 81, 2]], [[0, 79, 1], [2, 76, 1], [4, 72, 2], [8, 76, 1], [10, 79, 2]],
      [[0, 76, 2], [4, 73, 1], [6, 76, 1], [8, 79, 2], [12, 81, 1], [14, 79, 1]], [[0, 76, 4], [6, 73, 1], [8, 69, 2], [12, 0, 1]]],
    step: function (A, bar, st, t, d) {
      var ch = this.chords[bar];
      if (st === 0 || st === 10) A.kick(t, 0.16, 100);
      if (st === 4 || st === 12) A.snare(t, 0.035);
      if (st % 2 === 0) A.hat(t, st % 4 ? 0.012 : 0.02);
      if (st % 4 === 0) A.tone(t, mtof(ch[0] - 12), d * 1.4, 'triangle', 0.17, 0.005);
      if (st % 4 === 2) A.tone(t, mtof(ch[2] - 12), d * 0.9, 'triangle', 0.07, 0.004);
      if (st % 2 === 1 && (st % 8 === 3 || st % 8 === 7)) A.tone(t, mtof(ch[1] + 12), d * 0.6, 'sine', 0.035, 0.003);
      this.mel[bar].forEach(function (n) { if (n[0] === st && n[1]) { A.tone(t, mtof(n[1]), d * n[2] * 0.7, 'triangle', 0.07, 0.003); A.tone(t, mtof(n[1] + 12), d * 0.5, 'sine', 0.018, 0.002); } });
    } },
  epic: { bpm: 150, vol: 0.75,
    chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52], [50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
    mel: [[[0, 62, 6], [6, 65, 2], [8, 69, 8]], [[0, 70, 6], [6, 69, 2], [8, 65, 8]], [[0, 67, 4], [4, 72, 4], [8, 71, 2], [10, 72, 2], [12, 76, 4]], [[0, 73, 8], [8, 69, 4], [12, 64, 4]],
      [[0, 74, 4], [4, 72, 2], [6, 74, 2], [8, 77, 8]], [[0, 74, 4], [4, 70, 4], [8, 72, 2], [10, 74, 2], [12, 77, 4]], [[0, 79, 4], [4, 77, 4], [8, 74, 4], [12, 70, 4]], [[0, 73, 4], [4, 76, 4], [8, 81, 8]]],
    step: function (A, bar, st, t, d) {
      var ch = this.chords[bar];
      if (st === 0) ch.forEach(function (m) { A.pad(t, mtof(m), d * 16, 0.022); });
      if (st === 0 || st === 3 || st === 8 || st === 10) A.kick(t, st === 0 ? 0.42 : 0.3, 90);
      if (st === 4 || st === 12 || (bar === 7 && st >= 12)) A.snare(t, bar === 7 && st >= 12 ? 0.07 + (st - 12) * 0.02 : 0.11);
      A.hat(t, st % 2 ? 0.02 : 0.01);
      if (st % 2 === 0) A.tone(t, mtof(ch[0] - (st % 4 === 2 ? 12 : 24)), d * 1.7, 'sawtooth', 0.11, 0.005, 650);
      A.tone(t, mtof(ch[[0, 2, 1, 2][st % 4]] + 12), d * 0.8, 'square', 0.028, 0.003, 2600);
      this.mel[bar].forEach(function (n) { if (n[0] === st) A.brass(t, mtof(n[1]), d * n[2] * 0.96, 0.05); });
    } }
};
var BGM = (function () {
  var cur = null, wanted = null, bus = null, timer = null, nextT = 0, stepN = 0, noiseBuf = null, analyser = null, master = null;
  function ctx() { return audioCtx; }
  function out() {
    var a = ctx();
    if (!master) { master = a.createGain(); master.gain.value = 1.0; var comp = a.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; analyser = a.createAnalyser(); analyser.fftSize = 512; master.connect(comp); comp.connect(analyser); analyser.connect(a.destination); }
    return master;
  }
  function nb() { var a = ctx(); if (!noiseBuf) { var len = a.sampleRate * 0.5; noiseBuf = a.createBuffer(1, len, a.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
  var A = {
    tone: function (t, f, dur, type, vol, atk, lp) {
      var a = ctx(), o = a.createOscillator(), g = a.createGain(), node = o; o.type = type; o.frequency.value = f;
      if (lp) { var fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(atk + 0.02, dur));
      node.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    },
    kick: function (t, vol, f0) { var a = ctx(), o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); },
    hat: function (t, vol) { var a = ctx(), n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = nb(); f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); n.connect(f); f.connect(g); g.connect(bus); n.start(t, Math.random() * 0.4); n.stop(t + 0.05); },
    snare: function (t, vol) { var a = ctx(), n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = nb(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14); n.connect(f); f.connect(g); g.connect(bus); n.start(t, Math.random() * 0.3); n.stop(t + 0.15); A.tone(t, 185, 0.08, 'triangle', vol * 0.6, 0.003); },
    pad: function (t, f, dur, vol) {
      var a = ctx(), fl = a.createBiquadFilter(), g = a.createGain(); fl.type = 'lowpass'; fl.frequency.value = 1300;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      [-7, 7].forEach(function (dt) { var o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(fl); o.start(t); o.stop(t + dur + 0.05); }); fl.connect(g); g.connect(bus);
    },
    brass: function (t, f, dur, vol) {
      var a = ctx(), o = a.createOscillator(), fl = a.createBiquadFilter(), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = f;
      fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(3200, t + 0.08); fl.frequency.exponentialRampToValueAtTime(1400, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
    }
  };
  function tick() {
    var a = ctx(), tr = TRACKS[cur]; if (!a || !tr) return;
    var d = 60 / tr.bpm / 4;
    if (nextT < a.currentTime - 0.05) nextT = a.currentTime + 0.05;
    while (nextT < a.currentTime + 0.2) { var st = stepN % 16, bar = Math.floor(stepN / 16) % 8; try { tr.step(A, bar, st, nextT, d); } catch (e) {} nextT += d; stepN++; }
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (bus) { var b = bus, a = ctx(); try { b.gain.cancelScheduledValues(a.currentTime); b.gain.setTargetAtTime(0.0001, a.currentTime, 0.25); } catch (e) {} setTimeout(function () { try { b.disconnect(); } catch (e) {} }, 1500); bus = null; }
    cur = null;
  }
  function start(name) {
    var a = ctx(); stop(); cur = name;
    bus = a.createGain(); bus.gain.setValueAtTime(0.0001, a.currentTime); bus.gain.linearRampToValueAtTime(TRACKS[name].vol, a.currentTime + (name === 'epic' ? 1.2 : 2));
    bus.connect(out()); stepN = 0; nextT = a.currentTime + 0.1; tick(); timer = setInterval(tick, 40);
  }
  var api = {
    awakening: false,
    want: function (name) { wanted = name; api.sync(); },
    sync: function () {
      var a = ctx(), target = wanted;
      if (soundOff || document.hidden || !a || a.state !== 'running' || (target === 'epic' && api.awakening)) target = null;
      if (target === cur) return;
      if (target) start(target); else stop();
    },
    state: function () { return { cur: cur, wanted: wanted, off: soundOff, awakening: api.awakening, ctx: ctx() ? ctx().state : 'none' }; },
    level: function () { if (!analyser) return 0; var buf = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buf); var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
  };
  return api;
})();
document.addEventListener('visibilitychange', function () { BGM.sync(); });
