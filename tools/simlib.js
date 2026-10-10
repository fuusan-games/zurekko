// ずれっこ：オフライン用のシミュレーター（学習・テスト共通）。ゲーム本体と同じ brain.js / お題DB を読み込む。
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
function load(files) {
  const c = { console }; vm.createContext(c);
  (files || ['words1.js', 'words2.js', 'words3.js', 'brain.js', 'weights.js']).forEach(f => { const p = path.join(ROOT, f); if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), c, { filename: f }); });
  return c;
}
const C = load(), B = C.WWB, DB = B.build(C.WW_WORDS);
// 人間っぽいプレイヤーのモデル（辞書から選ぶ＋ゆらぎ＋辞書にない言葉や言い回し）
const HUMAN_LV = { noise: 0, voteNoise: 0.2, aware: 0.6, betaMul: 0.6, guessNoise: 0.25 };
const FILL = ['うーん', '好き', 'よく見る', 'みんな知ってる', 'なつかしい', '大人も子どもも', 'たまに', 'ふつう', 'まあまあ', '日本'];
const DECO = [['', 'っぽい'], ['', 'かな'], ['', '系'], ['なんか', ''], ['', 'みたいな'], ['けっこう', '']];
function humanHint(M, r, R, rng, hp) {
  hp = hp || {};
  const pick = a => a[Math.floor(rng() * a.length)];
  const wn = B.norm(M.w), mine = M.hints[M.me].map(h => h.n);
  if (rng() < (hp.off == null ? 0.15 : hp.off)) return pick(FILL);
  const post = B.posterior(M), q = post.q * HUMAN_LV.aware;
  let pool = null;
  if (q > 0.55 && rng() < 0.6) {   // 「自分ズレてるかも」と気づいた人間：みんなのヒントに寄せる
    const echo = []; M.hints.forEach((hs, j) => { if (j !== M.me) hs.forEach(h => { if (h.n.indexOf(wn) < 0) echo.push(h.t); }); });
    const ow = DB.words[M.words[post.topW]].terms.filter(t => t.s === 1 && t.f[0].indexOf(wn) < 0).map(t => t.d);
    pool = echo.concat(ow).filter(t => mine.indexOf(B.norm(t)) < 0);
    if (pool.length) return pick(pool);
  }
  const target = [1.3, 2, 2.6][B.stage(r, R)] + (hp.shift || 0) + (rng() - 0.5) * 1.4;
  const terms = DB.words[M.w].terms.filter(t => mine.indexOf(t.f[0]) < 0 && t.f[0].indexOf(wn) < 0 && !DB.cats[DB.words[M.w].cat].some(x => t.f[0].indexOf(DB.words[x].n) >= 0));
  if (!terms.length) return pick(FILL);
  let best = null, bs = Infinity; terms.forEach(t => { const s = Math.abs(t.s - target) + rng() * 0.9; if (s < bs) { bs = s; best = t; } });
  let txt = best.d;
  if (rng() < 0.22) { const d = pick(DECO); txt = d[0] + txt + d[1]; }
  return txt;
}
// 1ゲーム。agents[i] = { kind:'npc', P, lv } | { kind:'human' }
function play(pair, agents, opt, rng) {
  const n = agents.length, R = opt.rounds || 3;
  const flip = rng() < 0.5, maj = flip ? pair.a : pair.b, wolfW = flip ? pair.b : pair.a;
  const wolf = opt.wolfSeat != null ? opt.wolfSeat : Math.floor(rng() * n);
  const words = agents.map((a, i) => i === wolf ? wolfW : maj);
  const minds = agents.map((a, i) => B.mind(DB, { word: words[i], me: i, n, wolves: 1, P: a.kind === 'npc' ? a.P : B.HAND, lv: a.kind === 'npc' ? (a.lv || B.LV.full) : HUMAN_LV, rng, persona: a.persona }));
  const start = Math.floor(rng() * n), aware = [];
  for (let r = 0; r < R; r++) {
    for (let k = 0; k < n; k++) {
      const i = (start + r + k) % n, a = agents[i];
      let h = a.kind === 'npc' ? B.chooseHint(minds[i], r, R).text : humanHint(minds[i], r, R, rng, a.hp);
      if (B.containsWord(h, words[i])) h = 'うーん';
      minds.forEach(M => B.observe(M, i, h, r));
    }
    aware.push(B.posterior(minds[wolf]).q);
  }
  const all = agents.map((_, i) => i);
  function tally(cands) { const v = new Array(n).fill(0); minds.forEach(M => { const t = B.vote(M, cands); if (t >= 0) v[t]++; }); const mx = Math.max(...cands.map(j => v[j])); return { v, top: cands.filter(j => v[j] === mx) }; }
  let t = tally(all), caught = -1;
  if (t.top.length === 1) caught = t.top[0]; else { const t2 = tally(t.top); if (t2.top.length === 1) caught = t2.top[0]; }
  let guessOk = null;
  if (caught === wolf && opt.reverse !== false) { guessOk = B.guess(minds[wolf]).word === maj; }
  const winner = caught === wolf && !guessOk ? 'citizen' : 'wolf';
  return { wolf, caught, guessOk, winner, words, maj, aware };
}
const won = (res, i) => (res.winner === 'wolf') === (i === res.wolf);
// 学習用・評価用のペア分割（固定シードで約20%をホールドアウト）
function split(seed) {
  const r = B.rng(seed || 20261010), test = [], train = [];
  DB.pairs.forEach(p => (r() < 0.2 ? test : train).push(p));
  return { train, test };
}
module.exports = { C, B, DB, play, won, split, humanHint, HUMAN_LV, load };
