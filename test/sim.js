// ずれっこ：NPCの強さをシミュレーションで測る（学習に使っていない「ホールドアウト」のお題ペアで）
// usage: node test/sim.js [gamesPerBlock=2000]
'use strict';
const S = require('../tools/simlib.js'), { B, play, won } = S;
const W = S.C.WW_WEIGHTS ? S.C.WW_WEIGHTS.P : null;
if (!W) { console.log('weights.js がありません（node tools/train.js で学習）'); process.exit(1); }
const N = +(process.argv[2] || 2000), pairs = S.split().test, rng = B.rng(31337);
const pct = x => (100 * x).toFixed(1) + '%';
const npc = (P, lv) => ({ kind: 'npc', P, lv: B.LV[lv || 'full'] }), human = () => ({ kind: 'human', hp: [{ shift: -0.3 }, { shift: 0 }, { shift: 0.3 }, { shift: 0, off: 0.3 }][Math.floor(rng() * 4)] });
function block(mk, opt) {
  // mk() → { seats, focus:[席], wolfFrom:'focus'|'other'|'any' }
  const st = { n: 0, caught: 0, guessN: 0, guessOk: 0, citWin: 0, aware: 0, focusWolfN: 0, focusWolfHide: 0, focusWolfWin: 0, focusCitN: 0, focusCitWin: 0, focusCitCatch: 0, focusWins: 0, focusGames: 0 };
  for (let g = 0; g < N; g++) {
    const m = mk(g), n = m.seats.length, others = m.seats.map((_, i) => i).filter(i => m.focus.indexOf(i) < 0);
    let wolfSeat = Math.floor(rng() * n);
    if (m.wolfFrom === 'alt') wolfSeat = g % 2 ? m.focus[Math.floor(rng() * m.focus.length)] : others[Math.floor(rng() * others.length)];
    const r = play(pairs[Math.floor(rng() * pairs.length)], m.seats, { rounds: (opt && opt.rounds) || 3, wolfSeat, reverse: !!(opt && opt.reverse === true) }, rng);
    st.n++; if (r.caught === r.wolf) { st.caught++; if (r.guessOk != null) { st.guessN++; if (r.guessOk) st.guessOk++; } } if (r.winner === 'citizen') st.citWin++;
    if (r.aware[r.aware.length - 1] > 0.5) st.aware++;
    if (m.focus.indexOf(r.wolf) >= 0) { st.focusWolfN++; if (r.caught !== r.wolf) st.focusWolfHide++; if (r.winner === 'wolf') st.focusWolfWin++; }
    else { st.focusCitN++; if (r.winner === 'citizen') st.focusCitWin++; if (r.caught === r.wolf) st.focusCitCatch++; }
    m.focus.forEach(i => { st.focusGames++; if (won(r, i)) st.focusWins++; });
  }
  return st;
}
function byPolicy(mk, rev) {   // 同じ卓に2つの方針 → 方針ごとの勝率
  const w = {}, c = {};
  for (let g = 0; g < N; g++) {
    const m = mk(g), n = m.seats.length, wolfSeat = g % n;
    const r = play(pairs[Math.floor(rng() * pairs.length)], m.seats, { rounds: 3, wolfSeat, reverse: !!rev }, rng);
    m.tags.forEach((t, i) => { if (!t) return; c[t] = (c[t] || 0) + 1; if (won(r, i)) w[t] = (w[t] || 0) + 1; });
  }
  const out = {}; Object.keys(c).forEach(t => out[t] = w[t] / c[t]); return out;
}
const t0 = Date.now(), R = { N, testPairs: pairs.length };
console.log(`held-out pairs: ${pairs.length}, ${N} games per block. Rule: 逆転なし (game default) unless noted\n`);
// A) NPCだけの卓（5人全員NPC）
console.log('A) NPC-only tables (5 NPCs, same policy, 3 rounds)');
R.A = {};
[['hand-tuned', B.HAND, 'full'], ['trained', W, 'full'], ['やさしい', W, 'easy'], ['ふつう', W, 'normal'], ['かしこい', W, 'smart'], ['アストラウルトラ', W, 'ultra']].forEach(([lab, P, lv]) => {
  const s = block(() => ({ seats: [0, 0, 0, 0, 0].map(() => npc(P, lv)), focus: [], wolfFrom: 'any' }));
  R.A[lab] = { catch: s.caught / s.n, guess: s.guessOk / Math.max(1, s.guessN), citizenWin: s.citWin / s.n, wolfAwareR3: s.aware / s.n };
  console.log(`  ${lab.padEnd(10)} wolf caught ${pct(s.caught / s.n)} | wolf guess ok ${pct(s.guessOk / Math.max(1, s.guessN))} | citizens win ${pct(s.citWin / s.n)} | wolf realises it is the wolf by R3 ${pct(s.aware / s.n)}`);
});
// B) 人間っぽい3人 + NPC2人（方針ごと）
console.log('\nB) mixed tables: 2 NPCs (policy) + 3 simulated humans; wolf alternates NPC / human');
R.B = {};
[['hand-tuned', B.HAND], ['trained', W]].forEach(([lab, P]) => {
  const s = block(() => ({ seats: [npc(P), npc(P), human(), human(), human()], focus: [0, 1], wolfFrom: 'alt' }));
  R.B[lab] = { catchAsCitizen: s.focusCitCatch / s.focusCitN, survivalAsWolf: s.focusWolfHide / s.focusWolfN, wolfWin: s.focusWolfWin / s.focusWolfN, citizenWin: s.focusCitWin / s.focusCitN, guess: s.guessOk / Math.max(1, s.guessN), npcWinRate: s.focusWins / s.focusGames };
  console.log(`  ${lab.padEnd(10)} as citizens: wolf caught ${pct(R.B[lab].catchAsCitizen)} (win ${pct(R.B[lab].citizenWin)}) | as wolf: survives vote ${pct(R.B[lab].survivalAsWolf)} (win ${pct(R.B[lab].wolfWin)}) | guess ok (all caught wolves) ${pct(R.B[lab].guess)} | NPC seat win rate ${pct(R.B[lab].npcWinRate)}`);
});
// C) 学習済み vs 手作り（同じ卓：学習2・手作り2・人間1、ウルフは席を順番に）
console.log('\nC) head-to-head: 2 trained + 2 hand-tuned + 1 human (wolf seat rotates)');
const mkC = () => ({ seats: [npc(W), npc(W), npc(B.HAND), npc(B.HAND), human()], tags: ['trained', 'trained', 'hand', 'hand', null] });
R.C = byPolicy(mkC); R.Crev = byPolicy(mkC, true);
console.log(`  win rate (逆転なし): trained ${pct(R.C.trained)} vs hand-tuned ${pct(R.C.hand)}   | (逆転あり): trained ${pct(R.Crev.trained)} vs hand-tuned ${pct(R.Crev.hand)}`);
// D) 強さのはしご（各レベル1人ずつ＋人間1）
console.log('\nD) difficulty ladder: one NPC of each level + 1 human (wolf seat rotates)');
const mkD = () => ({ seats: [npc(W, 'easy'), npc(W, 'normal'), npc(W, 'smart'), npc(W, 'ultra'), human()], tags: ['やさしい', 'ふつう', 'かしこい', 'アストラウルトラ', null] });
R.D = byPolicy(mkD); R.Drev = byPolicy(mkD, true);
console.log('  (逆転あり) ' + Object.keys(R.Drev).map(k => `${k} ${pct(R.Drev[k])}`).join(' / '));
console.log('  win rate: ' + Object.keys(R.D).map(k => `${k} ${pct(R.D[k])}`).join(' / '));
// E) 人間に対するバランス（人間3＋そのレベルのNPC2）：逆転ルールあり／なし
console.log('\nE) balance for a human table: 3 simulated humans + 2 NPCs of a level (wolf anywhere)');
R.E = {};
['easy', 'normal', 'smart', 'ultra'].forEach(lv => {
  const on = block(() => ({ seats: [npc(W, lv), npc(W, lv), human(), human(), human()], focus: [0, 1], wolfFrom: 'any' }), { reverse: true });
  const off = block(() => ({ seats: [npc(W, lv), npc(W, lv), human(), human(), human()], focus: [0, 1], wolfFrom: 'any' }), { reverse: false });
  R.E[lv] = { citizenWinReverseOn: on.citWin / on.n, citizenWinReverseOff: off.citWin / off.n, npcWinOn: on.focusWins / on.focusGames, humanWolfCaught: 0 };
  console.log(`  ${B.LV[lv] ? lv.padEnd(7) : lv} citizens win: 逆転あり ${pct(on.citWin / on.n)} / 逆転なし ${pct(off.citWin / off.n)} | NPC seat win rate (逆転なし) ${pct(off.focusWins / off.focusGames)}`);
});
// F) ひとりモード（人間1＋同じレベルのNPC4）：人間の勝率
console.log('\nF) solo mode: 1 simulated human + 4 NPCs of a level (逆転なし)');
R.F = {};
['easy', 'normal', 'smart', 'ultra'].forEach(lv => {
  let hc = 0, hcN = 0, hw = 0, hwN = 0;
  for (let g = 0; g < N; g++) { const seats = [{ kind: 'human', hp: { shift: 0 } }, npc(W, lv), npc(W, lv), npc(W, lv), npc(W, lv)], ws = g % 5;
    const r = play(pairs[Math.floor(rng() * pairs.length)], seats, { rounds: 3, wolfSeat: ws, reverse: false }, rng);
    if (ws === 0) { hwN++; if (won(r, 0)) hw++; } else { hcN++; if (won(r, 0)) hc++; } }
  R.F[lv] = { humanWin: (hc + hw) / N, asCitizen: hc / hcN, asWolf: hw / hwN };
  console.log(`  ${lv.padEnd(7)} human wins ${pct(R.F[lv].humanWin)} (as citizen ${pct(R.F[lv].asCitizen)}, as wolf ${pct(R.F[lv].asWolf)})`);
});
require('fs').writeFileSync(__dirname + '/../tools/sim-report.json', JSON.stringify(R, null, 1));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s) → tools/sim-report.json`);
