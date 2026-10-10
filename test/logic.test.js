// ずれっこ：ロジックのテスト（node test/logic.test.js）
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const C = { console }; vm.createContext(C);
['words1.js', 'words2.js', 'words3.js', 'brain.js', 'weights.js', 'chars.js', 'logic.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), C, { filename: f }));
const B = C.WWB, L = C.WWL, DB = B.build(C.WW_WORDS), PW = C.WW_WEIGHTS.P;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e && e.message)); } }

console.log('お題データ');
t('150ペア以上・300語以上', () => { assert(DB.pairs.length >= 150, DB.pairs.length); assert(Object.keys(DB.words).length >= 300); });
t('ペアの2語は同じカテゴリで別の語', () => DB.pairs.forEach(p => { assert.notStrictEqual(p.a, p.b); assert.strictEqual(DB.words[p.a].cat, DB.words[p.b].cat, p.a + '/' + p.b); }));
t('ペアの重複なし', () => { const s = new Set(); DB.pairs.forEach(p => { const k = [p.a, p.b].sort().join('/'); assert(!s.has(k), k); s.add(k); }); });
t('どの語にも ヒント語が4つ以上（共通1つ以上・その語だけ1つ以上）', () => Object.values(DB.words).forEach(w => {
  assert(w.terms.length >= 4, w.w + ' ' + w.terms.length);
  assert(w.terms.some(x => x.s === 1), w.w + ' no shared'); assert(w.terms.some(x => x.s >= 2), w.w + ' no unique');
}));
t('ヒント語に、自分やペア相手のお題そのものが入っていない', () => Object.values(DB.words).forEach(w => w.terms.forEach(x => {
  [w.w].concat(w.partners).forEach(o => x.f.forEach(f => assert(f.indexOf(DB.words[o].n) < 0, w.w + ':' + x.d + ' contains ' + o)));
})));
t('語が2つのカテゴリにまたがらない', () => assert(!DB.dropped.some(d => /category/.test(d.why)), JSON.stringify(DB.dropped.filter(d => /category/.test(d.why)))));

console.log('ヒントの当てはまり（ことばの正規化・部分一致）');
t('カタカナ/ひらがな・全角半角・記号を同一視', () => { assert.strictEqual(B.norm('ラーメン！'), B.norm('らーめん')); assert.strictEqual(B.norm('ＡＢＣ'), B.norm('abc')); });
t('「ー」は残す（スープ≠スプーン）', () => assert(!B.containsWord('スプーン', 'スープ')));
t('その語だけのヒントは、その語に高く・相手に低く', () => {
  let ok = 0, n = 0;
  DB.pairs.slice(0, 80).forEach(p => { const A = DB.words[p.a], u = A.terms.find(x => x.s >= 2 && x.kind.indexOf('uniq') >= 0); if (!u) return; n++; if (B.fit(DB, PW, u.d, p.a) > B.fit(DB, PW, u.d, p.b)) ok++; });
  assert(ok / n > 0.9, ok + '/' + n);
});
t('共通ヒントは両方に当てはまる', () => {
  let ok = 0, n = 0;
  DB.pairs.slice(0, 80).forEach(p => { const s = DB.words[p.a].terms.find(x => x.kind.indexOf('shared') >= 0); if (!s) return; n++; if (B.fit(DB, PW, s.d, p.a) > 0.3 && B.fit(DB, PW, s.d, p.b) > 0.3) ok++; });
  assert(ok / n > 0.9, ok + '/' + n);
});
t('かな書き・言い回し付きでも当たる（「〜っぽい」）', () => {
  const p = DB.pairs[0], u = DB.words[p.a].terms.find(x => x.s >= 2);
  assert(B.fit(DB, PW, u.d + 'っぽい', p.a) > 0.3, u.d);
});
t('辞書にない言葉は どちらにも中立', () => { const p = DB.pairs[0]; assert(Math.abs(B.fit(DB, PW, 'ぴよぴよぱ', p.a) - B.fit(DB, PW, 'ぴよぴよぱ', p.b)) < 1e-9); });

console.log('NPCの推理');
function table(pair, wolf, hintsFor) {   // NPC本人(0)の頭脳に、他の人のヒントを見せる
  const words = [0, 1, 2, 3, 4].map(i => i === wolf ? pair.b : pair.a);
  const M = B.mind(DB, { word: words[0], me: 0, n: 5, P: PW, lv: B.LV.full, rng: B.rng(1) });
  for (let j = 1; j < 5; j++) hintsFor(words[j], j).forEach(h => B.observe(M, j, h, 0));
  return M;
}
const uniq = (w, k) => DB.words[w].terms.filter(x => x.s >= 2).map(x => x.d)[k || 0];
t('ズレたヒントを出した人を いちばん疑う（多数のペアで）', () => {
  let ok = 0, n = 0;
  DB.pairs.forEach(p => { if (!uniq(p.a, 1) || !uniq(p.b, 1)) return; n++; const M = table(p, 3, (w, j) => [uniq(w, j % 2)]); const po = B.posterior(M); let top = 1; for (let j = 2; j < 5; j++) if (po.susC[j] > po.susC[top]) top = j; if (top === 3) ok++; });
  assert(ok / n > 0.8, ok + '/' + n);
});
t('自分がウルフだと気づく（みんなのヒントが自分とズレている）', () => {
  let ok = 0, n = 0;
  DB.pairs.forEach(p => { if (!uniq(p.a, 1)) return; n++; const words = [p.b, p.a, p.a, p.a, p.a];
    const M = B.mind(DB, { word: p.b, me: 0, n: 5, P: PW, lv: B.LV.full, rng: B.rng(2) }); for (let j = 1; j < 5; j++) B.observe(M, j, uniq(words[j], j % 2), 0);
    if (B.posterior(M).q > 0.5) ok++; });
  assert(ok / n > 0.8, ok + '/' + n);
});
t('ウルフの答え当て：多数派のお題を当てる', () => {
  let ok = 0, n = 0;
  DB.pairs.forEach(p => { if (!uniq(p.a, 1)) return; n++; const M = B.mind(DB, { word: p.b, me: 0, n: 5, P: PW, lv: B.LV.full, rng: B.rng(3) });
    for (let j = 1; j < 5; j++) B.observe(M, j, uniq(p.a, j % 2), 0); if (B.guess(M).word === p.a) ok++; });
  assert(ok / n > 0.8, ok + '/' + n);
});
t('NPCのヒントに カテゴリ内のお題が入らない', () => {
  const rng = B.rng(5);
  for (let g = 0; g < 200; g++) { const p = DB.pairs[g % DB.pairs.length], M = B.mind(DB, { word: p.a, me: 0, n: 4, P: PW, lv: B.LV.normal, rng }); for (let r = 0; r < 3; r++) { const h = B.chooseHint(M, r, 3); const hn = B.norm(h); DB.cats[p.cat].forEach(w => assert(hn.indexOf(DB.words[w].n) < 0, h + ' ⊃ ' + w)); B.observe(M, 0, h, r); } }
});
t('頭脳は他人のお題を受け取らない（mind の入力は 自分のお題 と 公開ヒント だけ）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'logic.js'), 'utf8');
  const m = src.match(/B\.mind\(db, \{([^}]*)\}/); assert(m); assert(!/words\b|maj|wolfW|wolves:\s*G\.wolves/.test(m[1].replace('word: G.words[i]', '')), m[1]);
});

t('説明っぽいチャット（音声入力含む）は弱い証拠としてNPCの推理に入る／ただの雑談は入らない', () => {
  let ok = 0, n = 0;
  DB.pairs.forEach(p => { const u = uniq(p.b, 0); if (!u) return; n++;
    const M = B.mind(DB, { word: p.a, me: 0, n: 4, P: PW, lv: B.LV.full, rng: B.rng(4) }); const s0 = B.posterior(M).susC[2];
    assert(!B.observeSoft(M, 2, 'うーん あやしいなあ', 0.5));
    if (B.observeSoft(M, 2, 'なんか' + u + 'って感じ', 0.5) && B.posterior(M).susC[2] > s0) ok++; });
  assert(ok / n > 0.85, ok + '/' + n);
});

console.log('ゲーム進行と秘密の漏れ');
function runGame(seed, humans, npcs, opts) {
  const rng = B.rng(seed), players = [];
  for (let i = 0; i < humans; i++) players.push({ kind: 'human', sid: i + 1, name: 'P' + i });
  npcs.forEach(id => players.push({ kind: 'npc', ch: id }));
  let now = 1e6; const G = L.newGame(DB, PW, Object.assign({ players, lv: 'smart', rounds: 3, talk: 2, turbo: true, rng, now }, opts || {}));
  const views = []; let guard = 0;
  while (G.phase !== 'end' && guard++ < 20000) {
    now += 20; L.tick(G, now, () => false);
    for (let p = 0; p < humans; p++) {
      const v = L.view(G, p, now);
      if (v.phase === 'hint' && v.cur === p && v.sugg && v.sugg.length) L.hint(G, p, v.sugg[0], now);
      if (v.phase === 'talk' && rng() < 0.05) L.chat(G, p, ['ロボミ、どう思う？', 'あやしい…', 'ポチ太ズレてない？'][Math.floor(rng() * 3)], now);
      if (v.phase === 'vote' && v.myVote == null) L.vote(G, p, v.cands.filter(i => i !== p)[0], now);
      if (v.phase === 'guess' && v.guessList && p === G.caught) L.guess(G, p, v.guessList[0], now);
      views.push({ p, v: L.view(G, p, now) });
    }
  }
  return { G, views };
}
t('ゲームが最後まで進む（人間1〜3人＋NPC、2/3ラウンド、ウルフ1/2人、逆転あり/なし）', () => {
  for (let s = 0; s < 40; s++) { const h = 1 + s % 3, np = ['fuu', 'mimi', 'nyaco', 'pochi', 'robo', 'kon'].slice(0, 3 + s % 3); const { G } = runGame(100 + s, h, np, { rounds: 2 + s % 2, wolves: h + np.length >= 6 && s % 2 ? 2 : 1, reverse: s % 4 === 0 });
    assert.strictEqual(G.phase, 'end', 'seed ' + s); assert(G.result && /citizen|wolf/.test(G.result.winner)); }
});
t('他の人のお題・ウルフが誰か・NPCの心の声 は、結果発表まで どの参加者のビューにも入らない', () => {
  let checked = 0;
  for (let s = 0; s < 30; s++) {
    const { G, views } = runGame(500 + s, 2, ['fuu', 'nyaco', 'robo', 'kon'], { reverse: true });
    views.forEach(({ p, v }) => {
      if (v.phase === 'end') return;
      const mine = G.words[p], other = G.words.find(w => w !== mine);
      const j = JSON.stringify(v);
      assert(!('result' in v) && !('words' in v) && !('wolves' in v) && !('thoughts' in v) && !('minds' in v), 'forbidden key');
      if (v.phase !== 'guess' || p !== G.caught) assert(j.indexOf(other) < 0, 'seed ' + s + ' seat ' + p + ' sees "' + other + '" in ' + v.phase);
      checked++;
    });
  }
  assert(checked > 1000, checked);
});
t('自分のお題を含むヒントは出せない', () => {
  const { G } = (() => { const players = [{ kind: 'human', sid: 1, name: 'A' }, { kind: 'npc', ch: 'fuu' }, { kind: 'npc', ch: 'robo' }]; const G = L.newGame(DB, PW, { players, turbo: true, rng: B.rng(9), now: 0 }); return { G }; })();
  let now = 0; while (!(G.phase === 'hint' && L.cur(G) === 0) && now < 1e5) { now += 20; L.tick(G, now, () => false); }
  assert(L.hint(G, 0, G.words[0] + 'だよ', now), 'should be rejected');
});
t('NPCのチャット反応：名前を呼ぶと返事が来る', () => {
  const players = [{ kind: 'human', sid: 1, name: 'A' }, { kind: 'npc', ch: 'fuu' }, { kind: 'npc', ch: 'robo' }, { kind: 'npc', ch: 'mimi' }];
  const G = L.newGame(DB, PW, { players, turbo: true, rng: B.rng(11), now: 0, talk: 30 }); let now = 0;
  while (G.phase !== 'talk' && now < 1e6) { now += 20; L.tick(G, now, () => false); const v = L.view(G, 0, now); if (v.phase === 'hint' && v.cur === 0) L.hint(G, 0, v.sugg[0], now); }
  const before = G.lid; L.chat(G, 0, 'ロボミはどう思う？', now);
  for (let i = 0; i < 100; i++) { now += 20; L.tick(G, now, () => false); }
  assert(G.log.some(e => e.id > before && e.t === 'npc' && G.players[e.p].ch === 'robo'), 'robo replied');
});
t('学習済みの重みが読み込まれている', () => { assert(C.WW_WEIGHTS && C.WW_WEIGHTS.meta && C.WW_WEIGHTS.meta.gens > 0); B.PKEYS.forEach(k => { const v = B.toVec(PW)[B.PKEYS.indexOf(k)]; assert(v >= k[1] - 1e-9 && v <= k[2] + 1e-9, k[0]); }); });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
