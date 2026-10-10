// ずれっこ：NPCの方針パラメータを自己対戦で学習する（CMA-ES風の進化戦略・ワーカースレッド並列）
// usage: node tools/train.js [generations=40] [gamesPerEval=480]
// 出力：weights.js（ゲームが読み込む学習済み重み）、tools/train-report.json（学習曲線・前後比較）
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os'), fs = require('fs'), path = require('path');
const S = require('./simlib.js'), { B, DB, play, won } = S;
// 人間役のくせ：ふんわり派〜ストレート派、辞書にない言葉をよく使う人
const HUMAN_STYLES = [{ shift: -0.6, off: 0.15 }, { shift: -0.3, off: 0.1 }, { shift: 0, off: 0.15 }, { shift: 0.3, off: 0.2 }, { shift: 0, off: 0.3 }];

// ---------- 1卓の構成（シードから決定的に作る） ----------
// 実際の遊び方に合わせた卓：4〜6人、人間役0〜3人（ソロ=1人が最多）、残りのNPC席の半分以上が学習中の方針θ、残りは手作りNPC。
// 逆転ルールは なし65% / あり35%。目的関数＝「θの席の勝率」（ウルフ側35%・市民側65%で重み付け）＋少しの形づけ。
// ※以前は「θ2席＋人間役60%」だけで学習したため、θ市民が人間役のヒントにただ乗りする（自分はぼかすだけ）方針に寄ってしまった。
function table(r) {
  const n = 4 + Math.floor(r() * 3), u = r();
  const h = Math.min(n - 2, u < 0.2 ? 0 : u < 0.55 ? 1 : u < 0.7 ? 2 : 3);
  const rem = n - h, nT = Math.ceil(rem / 2), kinds = [];
  for (let i = 0; i < h; i++) kinds.push('human'); for (let i = 0; i < nT; i++) kinds.push('theta'); for (let i = nT; i < rem; i++) kinds.push('hand');
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
  return kinds;
}
function fitness(P, pairs, seed, games) {
  let wolfW = 0, citW = 0, nw = 0, nc = 0, wolfHide = 0, citCatch = 0;
  for (let g = 0; g < games; g++) {
    const r = B.rng(seed * 7919 + g * 104729 + 13), kinds = table(r), n = kinds.length, R = r() < 0.4 ? 2 : 3, reverse = r() < 0.35;
    const pair = pairs[Math.floor(r() * pairs.length)];
    const seats = kinds.map(k => k === 'theta' ? { kind: 'npc', P } : k === 'hand' ? { kind: 'npc', P: B.HAND } : { kind: 'human', hp: HUMAN_STYLES[Math.floor(r() * HUMAN_STYLES.length)] });
    const T = kinds.map((k, i) => i).filter(i => kinds[i] === 'theta'), O = kinds.map((k, i) => i).filter(i => kinds[i] !== 'theta');
    const wolfSeat = g % 2 === 0 ? T[Math.floor(r() * T.length)] : O[Math.floor(r() * O.length)];   // 層別：偶数=θがウルフ、奇数=θは市民
    const res = play(pair, seats, { rounds: R, wolfSeat, reverse }, r);
    if (g % 2 === 0) { nw++; if (res.winner === 'wolf') wolfW++; if (res.caught !== res.wolf) wolfHide++; }
    else { nc++; if (res.winner === 'citizen') citW++; if (res.caught === res.wolf) citCatch++; }
  }
  const wolf = wolfW / nw, cit = citW / nc, hide = wolfHide / nw, catchR = citCatch / nc;
  return { f: 0.35 * (wolf + 0.1 * hide) + 0.65 * (cit + 0.1 * catchR), wolf, cit, hide, catch: catchR };
}
if (!isMainThread) {
  const split = S.split();
  parentPort.on('message', m => {
    const P = B.fromVec(m.vec), pairs = m.set === 'test' ? split.test : split.train;
    parentPort.postMessage({ id: m.id, r: fitness(P, pairs, m.seed, m.games) });
  });
  return;
}
// ---------- メイン：進化戦略 ----------
const GENS = +(process.argv[2] || 40), GAMES = +(process.argv[3] || 480), LAMBDA = 16, MU = 6;
const NW = Math.max(1, Math.min(os.cpus().length, 8));
const workers = [], queue = [], waiting = {}; let nextId = 1;
for (let i = 0; i < NW; i++) { const w = new Worker(__filename); w.busy = false; w.on('message', m => { w.busy = false; waiting[m.id](m.r); delete waiting[m.id]; pump(); }); workers.push(w); }
function pump() { workers.forEach(w => { if (!w.busy && queue.length) { const t = queue.shift(); w.busy = true; waiting[t.id] = t.res; w.postMessage(t.msg); } }); }
function evalVec(vec, seed, games, set) { return new Promise(res => { const id = nextId++; queue.push({ id, res, msg: { id, vec, seed, games, set: set || 'train' } }); pump(); }); }
const K = B.PKEYS, D = K.length;
const toU = v => v.map((x, i) => (x - K[i][1]) / (K[i][2] - K[i][1]));
const fromU = u => u.map((x, i) => K[i][1] + Math.min(1, Math.max(0, x)) * (K[i][2] - K[i][1]));
function randn(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
(async () => {
  const t0 = Date.now(), rng = B.rng(424242), split = S.split();
  console.log(`pairs: train ${split.train.length} / held-out test ${split.test.length}; params ${D}; workers ${NW}; λ=${LAMBDA} μ=${MU}; ${GENS} gens × ${GAMES} games`);
  const w = []; for (let i = 0; i < MU; i++) w.push(Math.log(MU + 0.5) - Math.log(i + 1)); const ws = w.reduce((a, b) => a + b); for (let i = 0; i < MU; i++) w[i] /= ws;
  const mueff = 1 / w.reduce((a, b) => a + b * b, 0), cs = (mueff + 2) / (D + mueff + 5), ds = 1 + cs + 2 * Math.max(0, Math.sqrt((mueff - 1) / (D + 1)) - 1), chiN = Math.sqrt(D) * (1 - 1 / (4 * D) + 1 / (21 * D * D));
  let m = toU(B.toVec(B.HAND)), sigma = 0.18, ps = new Array(D).fill(0);
  const hist = []; let best = { f: -1 };
  const handVal = await evalVec(B.toVec(B.HAND), 999001, 4000);
  console.log('hand-tuned baseline (train pairs, 4000 games):', JSON.stringify(handVal));
  for (let g = 0; g < GENS; g++) {
    const seed = 1000 + g, Z = [];
    for (let k = 0; k < LAMBDA / 2; k++) { const z = []; for (let i = 0; i < D; i++) z.push(randn(rng)); Z.push(z, z.map(x => -x)); }   // 対称サンプリング
    const X = Z.map(z => m.map((x, i) => x + sigma * z[i]));
    const R = await Promise.all(X.map(x => evalVec(fromU(x), seed, GAMES)));
    const ord = R.map((r, i) => i).sort((a, b) => R[b].f - R[a].f);
    const zm = new Array(D).fill(0); for (let k = 0; k < MU; k++) for (let i = 0; i < D; i++) zm[i] += w[k] * Z[ord[k]][i];
    m = m.map((x, i) => Math.min(1, Math.max(0, x + sigma * zm[i])));
    ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * zm[i]);
    const pn = Math.sqrt(ps.reduce((a, b) => a + b * b, 0)); sigma *= Math.exp((cs / ds) * (pn / chiN - 1)); sigma = Math.min(0.35, Math.max(0.02, sigma));
    let line = `gen ${String(g + 1).padStart(2)}  best ${R[ord[0]].f.toFixed(3)}  median ${R[ord[LAMBDA / 2]].f.toFixed(3)}  σ ${sigma.toFixed(3)}`;
    const h = { gen: g + 1, best: R[ord[0]].f, median: R[ord[LAMBDA / 2]].f, sigma };
    if ((g + 1) % 5 === 0 || g === GENS - 1) {   // 平均ベクトルを新しい種で検証（過学習・ノイズ対策）
      const v = await evalVec(fromU(m), 777000 + g, 3000); h.meanVal = v.f; line += `  | mean@3000 ${v.f.toFixed(3)} (wolf ${v.wolf.toFixed(3)} cit ${v.cit.toFixed(3)})`;
      if (v.f > best.f) best = { f: v.f, vec: fromU(m), gen: g + 1, v };
    }
    hist.push(h); console.log(line);
  }
  // ホールドアウト（学習に使っていないお題ペア）での前後比較
  const testHand = await evalVec(B.toVec(B.HAND), 555, 6000, 'test');
  const testBest = await evalVec(best.vec, 555, 6000, 'test');
  console.log('held-out test pairs, 6000 games:  hand', JSON.stringify(testHand), '\n                                    trained', JSON.stringify(testBest));
  const P = B.fromVec(best.vec); Object.keys(P).forEach(k => { P[k] = Array.isArray(P[k]) ? P[k].map(x => +x.toFixed(4)) : +P[k].toFixed(4); });
  const meta = { trainedAt: new Date().toISOString(), gens: GENS, gamesPerEval: GAMES, lambda: LAMBDA, bestGen: best.gen, trainFitness: best.f, handTrainFitness: handVal.f, testHand, testTrained: testBest, minutes: +((Date.now() - t0) / 60000).toFixed(1) };
  fs.writeFileSync(path.join(__dirname, '..', 'weights.js'), '/* ずれっこ：学習済みのNPCパラメータ（tools/train.js が自己対戦で学習して書き出したファイル。手で編集しない） */\n' +
    'this.WW_WEIGHTS = ' + JSON.stringify({ P, meta }, null, 1) + ';\n');
  fs.writeFileSync(path.join(__dirname, 'train-report.json'), JSON.stringify({ meta, hist, hand: B.HAND, trained: P }, null, 1));
  console.log('wrote weights.js', JSON.stringify(P));
  workers.forEach(w => w.terminate());
})();
