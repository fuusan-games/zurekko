/* ずれっこ：NPCの頭脳（ブラウザ／Node 共通・副作用なし）
 * - お題DBの組み立て、ヒントの正規化と「どのお題っぽいか」の判定
 * - ベイズ風の推理：自分のお題＋公開されたヒントだけから、「相手のお題」と「誰がウルフか（自分かも？）」を推定
 * - ヒント選び（ラウンドが進むほど具体的に／自分がズレていそうなら多数派にまぎれる）、投票、ウルフになったときの答え当て
 * NPCは他の人のお題を一切見ません（見られるのは自分のお題と、全員に公開されたヒントだけ）。
 */
(function (root) {
'use strict';
var B = {};
var KANJI = /^[\u4e00-\u9fff]$/;
var PUNCT = /[\s\u3000、。・，．,.!！?？「」『』（）()\[\]【】〜~…"'`＿_\-]+/g;
B.norm = function (s) {
  s = String(s == null ? '' : s);
  try { s = s.normalize('NFKC'); } catch (e) {}
  s = s.toLowerCase().replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  return s.replace(PUNCT, '');
};
// 乱数（シード付き）
B.rng = function (seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------- お題DB ----------
function parseTerms(str, spec) {
  return String(str || '').split(/\s+/).filter(Boolean).map(function (tok) {
    var s = spec; if (/!$/.test(tok)) { s = 3; tok = tok.slice(0, -1); }
    var forms = tok.split('|').filter(Boolean);
    return { d: forms[0], f: forms.map(B.norm).filter(Boolean), s: s };
  }).filter(function (t) { return t.f.length; });
}
B.build = function (groups) {
  var db = { words: {}, pairs: [], cats: {}, gen: {}, dropped: [] };
  function word(w, cat) {
    var o = db.words[w];
    if (!o) { o = db.words[w] = { w: w, n: B.norm(w), cat: cat, partners: [], terms: [], tix: {}, pairIds: [] }; db.cats[cat].push(w); }
    else if (o.cat !== cat) db.dropped.push({ word: w, why: 'category conflict ' + o.cat + '/' + cat });
    return o;
  }
  function add(o, partner, t, kind) {
    var bad = t.f.some(function (f) { return f.indexOf(o.n) >= 0 || f.indexOf(partner.n) >= 0; });
    if (bad) { db.dropped.push({ word: o.w, term: t.d, why: 'contains a word of the pair' }); return; }
    var k = t.f[0], ex = o.tix[k];
    if (ex) { ex.s = Math.min(ex.s, t.s); if (ex.kind.indexOf(kind) < 0) ex.kind.push(kind); t.f.forEach(function (f) { if (ex.f.indexOf(f) < 0) ex.f.push(f); }); return; }
    var term = { d: t.d, f: t.f.slice(), s: t.s, kind: [kind] };
    o.tix[k] = term; o.terms.push(term);
  }
  groups.forEach(function (g) {
    db.cats[g.cat] = db.cats[g.cat] || [];
    db.gen[g.cat] = (db.gen[g.cat] || []).concat(parseTerms(g.gen, 0));
    g.pairs.forEach(function (row) {
      var a = word(row[0], g.cat), b = word(row[1], g.cat), id = db.pairs.length;
      db.pairs.push({ id: id, a: row[0], b: row[1], cat: g.cat });
      if (a.partners.indexOf(b.w) < 0) a.partners.push(b.w);
      if (b.partners.indexOf(a.w) < 0) b.partners.push(a.w);
      a.pairIds.push(id); b.pairIds.push(id);
      parseTerms(row[2], 1).forEach(function (t) { add(a, b, t, 'shared'); add(b, a, t, 'shared'); });
      parseTerms(row[3], 2).forEach(function (t) { add(a, b, t, 'uniq'); });
      parseTerms(row[4], 2).forEach(function (t) { add(b, a, t, 'uniq'); });
    });
  });
  return db;
};
// ヒント hn（正規化済み）とお題 x の結びつき。{v:0..1+, k:'exact'|'part'|'name'|'gen'|null, s}
function rawMatch(db, hn, x) {
  var o = db.words[x], best = { k: null, s: 0, q: 0 };
  if (hn && o) {
    if (hn.length >= 2 && hn.indexOf(o.n) >= 0) best = { k: 'name', s: 3, q: 3 };
    for (var i = 0; i < o.terms.length; i++) {
      var t = o.terms[i];
      for (var j = 0; j < t.f.length; j++) {
        var f = t.f[j], q = 0, k = null;
        if (f === hn) { k = 'exact'; q = 2; }
        else if (((f.length >= 2 || KANJI.test(f)) && hn.indexOf(f) >= 0) || ((hn.length >= 2 || KANJI.test(hn)) && f.indexOf(hn) >= 0)) { k = 'part'; q = 1; }
        if (k && (q > best.q || (q === best.q && t.s > best.s))) best = { k: k, s: t.s, q: q, t: t };
      }
    }
    if (!best.k) { var g = db.gen[o.cat] || []; for (var m = 0; m < g.length; m++) if (g[m].f.some(function (f) { return f === hn || (f.length >= 2 && hn.indexOf(f) >= 0); })) { best = { k: 'gen', s: 0, q: 0 }; break; } }
  }
  return best;
}
B.rawMatch = rawMatch;
// ヒント1つ ×（同じカテゴリの全お題）の結びつきを1行にまとめてキャッシュ
function rawRow(db, hn, cat) {
  var C = db._rows || (db._rows = {}), cc = C[cat] || (C[cat] = {}), row = cc[hn];
  if (row) return row;
  row = db.cats[cat].map(function (x) { return rawMatch(db, hn, x); });
  if (Object.keys(cc).length > 20000) C[cat] = {};
  return (C[cat][hn] = row);
}
// 学習されたパラメータで数値化
function mval(P, r) { if (!r.k) return 0; if (r.k === 'gen') return P.gen; if (r.k === 'name') return P.a[2]; var v = P.a[r.s - 1]; return r.k === 'part' ? v * P.part : v; }
B.fit = function (db, P, text, x) { return mval(P, rawMatch(db, B.norm(text), x)); };
B.containsWord = function (text, w) { var n = B.norm(text), wn = B.norm(w); return !!wn && n.indexOf(wn) >= 0; };

// ---------- 心（NPCひとりぶんの推理状態） ----------
function combos(n, k) { var out = []; (function rec(s, cur) { if (cur.length === k) { out.push(cur.slice()); return; } for (var i = s; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); } })(0, []); return out; }
// 弱いレベルは「学習済みの方針」を手作り方針（協力的・ヒントが具体的）の方へ寄せる（mixHand=寄せる割合）
function blendP(P, lv) {
  var m = lv && lv.mixHand; if (!m || !B.HAND || P === B.HAND) return P;
  var key = '_mix' + m; if (P[key]) return P[key];
  var out = {}; Object.keys(B.HAND).forEach(function (k) { var a = P[k], h = B.HAND[k]; out[k] = Array.isArray(h) ? h.map(function (x, i) { return (1 - m) * a[i] + m * x; }) : (k === 'decoy' ? Math.exp((1 - m) * Math.log(a) + m * Math.log(h)) : (1 - m) * a + m * h); });
  try { Object.defineProperty(P, key, { value: out, enumerable: false }); } catch (e) {}
  return out;
}
B.blendP = blendP;
B.mind = function (db, o) {
  var lv = o.lv || B.LV.full, P = blendP(o.P, lv), w = o.word, W = db.words[w];
  var others = [], lp = [];
  db.cats[W.cat].forEach(function (x) { if (x === w) return; others.push(x); lp.push(W.partners.indexOf(x) >= 0 ? 0 : Math.log(P.decoy)); });
  var words = [w].concat(others), S = [], hints = [];
  for (var i = 0; i < o.n; i++) { S.push(new Float64Array(words.length)); hints.push([]); }
  var catArr = db.cats[W.cat], ci = words.map(function (x) { return catArr.indexOf(x); });
  return { db: db, cat: W.cat, ci: ci, P: P, lv: lv, ps: o.persona || {}, w: w, me: o.me, n: o.n, nw: o.wolves || 1, words: words, lp: [0].concat(lp), S: S, hints: hints, said: {}, rng: o.rng || Math.random,
    K: combos(o.n, o.wolves || 1), cache: null, log: [] };
};
B.observe = function (M, p, text, r) {
  var hn = B.norm(text); M.hints[p].push({ t: String(text), n: hn, r: r }); M.said[hn] = (M.said[hn] || 0) + 1; M.cache = null;
  if (p === M.me) return;
  var P = M.P, row = M.S[p], rr = rawRow(M.db, hn, M.cat);
  for (var c = 0; c < M.words.length; c++) row[c] += Math.log(P.eps + mval(P, rr[M.ci[c]]));
};
// チャット（声・文字）での説明を「弱い証拠」として取り込む。ヒント一覧には入れない。辞書に引っかからない文は何もしない
B.observeSoft = function (M, p, text, w) {
  if (p === M.me) return false;
  var hn = B.norm(text); if (!hn || hn.length > 40) return false;
  var rr = rawRow(M.db, hn, M.cat), vals = [], lo = Infinity, hi = -Infinity;
  for (var c = 0; c < M.words.length; c++) { var v = mval(M.P, rr[M.ci[c]]); vals.push(v); if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-9) return false;   // どのお題にも同じ → 手がかりにならない
  for (c = 0; c < M.words.length; c++) M.S[p][c] += w * Math.log(M.P.eps + vals[c]);
  M.cache = null; return true;
};
B.posterior = function (M) {
  if (M.cache) return M.cache;
  var n = M.n, me = M.me, nc = M.words.length, beta = M.P.beta * (M.lv.betaMul || 1), K = M.K;
  var lps = [], max = -Infinity, ix = [];
  var base = 0; for (var j0 = 0; j0 < n; j0++) if (j0 !== me) base += M.S[j0][0];
  for (var c = 1; c < nc; c++) for (var k = 0; k < K.length; k++) {
    var Kk = K[k], meIn = Kk.indexOf(me) >= 0, ll = 0;
    if (Kk.length === 1) { var kk = Kk[0]; if (meIn) { for (var j1 = 0; j1 < n; j1++) if (j1 !== me) ll += M.S[j1][c]; } else ll = base - M.S[kk][0] + M.S[kk][c]; }
    else for (var j = 0; j < n; j++) { if (j === me) continue; var inK = Kk.indexOf(j) >= 0; ll += M.S[j][inK === meIn ? 0 : c]; }
    var v = M.lp[c] + beta * ll; lps.push(v); ix.push([c, k, meIn]); if (v > max) max = v;
  }
  var Z = 0; for (var i = 0; i < lps.length; i++) { lps[i] = Math.exp(lps[i] - max); Z += lps[i]; }
  var q = 0, sus = new Float64Array(n), susC = new Float64Array(n), zC = 0, pOw = new Float64Array(nc), pOc = new Float64Array(nc), pO = new Float64Array(nc);
  for (i = 0; i < lps.length; i++) {
    var p = lps[i] / Z, c2 = ix[i][0], Kk2 = K[ix[i][1]];
    pO[c2] += p;
    if (ix[i][2]) { q += p; pOw[c2] += p; } else { zC += p; pOc[c2] += p; Kk2.forEach(function (j) { susC[j] += p; }); }
    Kk2.forEach(function (j) { sus[j] += p; });
  }
  for (c = 0; c < nc; c++) { pOw[c] = q > 1e-12 ? pOw[c] / q : pO[c]; pOc[c] = zC > 1e-12 ? pOc[c] / zC : pO[c]; }
  for (j = 0; j < n; j++) susC[j] = zC > 1e-12 ? susC[j] / zC : 1 / Math.max(1, n - 1);
  susC[me] = 0;
  var top = 1; for (c = 2; c < nc; c++) if (pO[c] > pO[top]) top = c;
  var topW = 1; for (c = 2; c < nc; c++) if (pOw[c] > pOw[topW]) topW = c;
  M.cache = { q: q, sus: sus, susC: susC, pO: pO, pOw: pOw, pOc: pOc, top: top, topW: topW };
  return M.cache;
};
function gumbel(r) { return -Math.log(-Math.log(Math.max(1e-12, r()))); }
function sig(x) { return 1 / (1 + Math.exp(-x)); }
// そのヒントがどれくらい「具体的（＝バレやすい）」か：相手のお題候補と共通なら1、片方だけなら 2〜3
function specOf(M, t, pOc) {
  var s = 0, z = 0, rr = rawRow(M.db, t.f[0], M.cat);
  for (var c = 1; c < M.words.length; c++) { if (pOc[c] < 1e-4) continue; var r = rr[M.ci[c]]; s += pOc[c] * (r.k && r.k !== 'gen' ? 1 : t.s); z += pOc[c]; }
  return z ? s / z : t.s;
}
function forbidden(M, hn) { if (!hn || hn.length > 24) return true; var cat = M.db.cats[M.db.words[M.w].cat]; for (var i = 0; i < cat.length; i++) if (hn.indexOf(M.db.words[cat[i]].n) >= 0) return true; return false; }
B.stage = function (r, R) { return R <= 1 ? 2 : Math.round(r * 2 / (R - 1)); };
// ヒントを選ぶ。r = 0始まりのラウンド, R = 全ラウンド数
B.chooseHint = function (M, r, R) {
  var P = M.P, lv = M.lv, ps = M.ps, post = B.posterior(M), mine = M.hints[M.me].map(function (h) { return h.n; });
  var q = post.q * (lv.aware == null ? 1 : lv.aware) * (ps.aware || 1);
  var g = sig((q - P.th) / P.tw), target = P.tgt[B.stage(r, R)] + (ps.spec || 0);
  var cand = [], seen = {};
  function push(t, src) { var k = t.f[0]; if (seen[k] || mine.indexOf(k) >= 0 || forbidden(M, k)) return; seen[k] = 1; cand.push({ t: t, src: src }); }
  M.db.words[M.w].terms.forEach(function (t) { push(t, 'own'); });
  if (g > 0.02 && lv.aware !== 0) {
    var ow = M.db.words[M.words[post.topW]]; ow.terms.forEach(function (t) { push(t, 'lie'); });
    M.hints.forEach(function (hs, j) { if (j !== M.me) hs.forEach(function (h) { push({ d: h.t, f: [h.n], s: 2 }, 'echo'); }); });
  }
  var best = null, bu = -Infinity, w = M.w;
  cand.forEach(function (c) {
    var hn = c.t.f[0], rr = rawRow(M.db, hn, M.cat), mw = mval(P, rr[M.ci[0]]);
    if (c.src !== 'own' && mw <= 0 && q < P.lieTh) return;          // まだ確信がないうちは自分のお題に合わないことは言わない
    var spec = c.src === 'own' ? specOf(M, c.t, post.pOc) : 2;
    var uC = -Math.abs(spec - target) * P.kS - (M.said[hn] ? P.echoC : 0) - (mw > 0 ? 0 : P.offPen);
    var fitMaj = 0; for (var k = 1; k < M.words.length; k++) if (post.pOw[k] > 1e-3) fitMaj += post.pOw[k] * mval(P, rr[M.ci[k]]);
    var uW = fitMaj * P.kB + mw * P.kBw - (c.src === 'lie' && mw <= 0 && q < P.lieTh ? 3 : 0);
    var u = (1 - g) * uC + g * uW + (lv.noise || 0) * gumbel(M.rng);
    if (u > bu) { bu = u; best = c; }
  });
  if (!best) { var fb = ['うーん', 'なんとなく', 'あれ系', 'よく見る']; return { text: fb[Math.floor(M.rng() * fb.length)], q: q, mode: 'fallback' }; }
  return { text: best.t.d, q: post.q, g: g, mode: g > 0.5 ? (best.src === 'own' ? 'blend' : best.src) : 'honest', spec: best.t.s };
};
// 投票先（cands：投票できる席の一覧）
B.vote = function (M, cands) {
  var post = B.posterior(M), lv = M.lv, P = M.P, list = cands.filter(function (j) { return j !== M.me; });
  if (!list.length) return -1;
  if (M.rng() < (lv.voteNoise || 0)) return list[Math.floor(M.rng() * list.length)];
  var q = post.q * (lv.aware == null ? 1 : lv.aware), c = post.topW, fit = {}, fmin = Infinity, fmax = -Infinity;
  list.forEach(function (j) { var hs = M.hints[j].length || 1; fit[j] = M.S[j][c] / hs; fmin = Math.min(fmin, fit[j]); fmax = Math.max(fmax, fit[j]); });
  var best = list[0], bs = -Infinity;
  list.forEach(function (j) {
    var vag = fmax > fmin ? (fmax - fit[j]) / (fmax - fmin) : 0.5;   // 多数派のお題に合っていない人ほど、みんなに疑われやすい
    var s = (1 - q) * post.susC[j] + q * P.dv * vag + 0.001 * M.rng();
    if (s > bs) { bs = s; best = j; }
  });
  return best;
};
// ウルフだとバレたときに、多数派のお題を当てる
B.guess = function (M) {
  var post = B.posterior(M), lv = M.lv, order = [];
  for (var c = 1; c < M.words.length; c++) order.push(c);
  order.sort(function (a, b) { return post.pOw[b] - post.pOw[a]; });
  var pick = order[0];
  if (M.rng() < (lv.guessNoise || 0)) pick = order[Math.floor(M.rng() * Math.min(4, order.length))];
  return { word: M.words[pick], p: post.pOw[pick], top: order.slice(0, 3).map(function (c) { return { w: M.words[c], p: post.pOw[c] }; }) };
};
// あの人のヒントで、いちばん「ズレて」聞こえたもの（セリフ用）
B.oddHint = function (M, j) {
  var post = B.posterior(M), c = post.top, best = null, bs = -Infinity, P = M.P;
  M.hints[j].forEach(function (h) { var rr = rawRow(M.db, h.n, M.cat), s = Math.log(P.eps + mval(P, rr[M.ci[c]])) - Math.log(P.eps + mval(P, rr[M.ci[0]])); if (s > bs) { bs = s; best = h; } });
  return best && bs > 0.2 ? best.t : null;
};
B.goodHint = function (M, j) {
  var best = null, bs = 0; M.hints[j].forEach(function (h) { var v = mval(M.P, rawMatch(M.db, h.n, M.w)); if (v > bs) { bs = v; best = h; } }); return best ? best.t : null;
};
// 人間向けのヒント候補（自分のお題のヒントだけ。ふんわり→具体的の順にまぜる）
B.suggest = function (db, w, used, rng, n) {
  var W = db.words[w]; if (!W) return [];
  var u = {}; (used || []).forEach(function (x) { u[B.norm(x)] = 1; });
  var cat = db.cats[W.cat].map(function (x) { return db.words[x].n; });
  var ts = W.terms.filter(function (t) { return !u[t.f[0]] && !cat.some(function (c) { return t.f[0].indexOf(c) >= 0; }); });
  rng = rng || Math.random;
  var by = [1, 2, 3].map(function (s) { return ts.filter(function (t) { return t.s === s; }).sort(function () { return rng() - 0.5; }); });
  var out = [], i = 0; n = n || 6;
  while (out.length < n && (by[0].length || by[1].length || by[2].length)) { var b = by[[0, 0, 1, 2, 1, 0][i++ % 6]]; if (b.length) out.push(b.shift().d); }
  return out;
};
// 難しさ（学習した方針をどれだけ「にぶく」するか）
B.LV = {
  easy: { noise: 1.6, voteNoise: 0.45, aware: 0, betaMul: 0.45, guessNoise: 0.6, mixHand: 1 },
  normal: { noise: 0.8, voteNoise: 0.2, aware: 0.5, betaMul: 0.7, guessNoise: 0.3, mixHand: 0.4 },
  smart: { noise: 0.3, voteNoise: 0.06, aware: 0.85, betaMul: 0.9, guessNoise: 0.1, mixHand: 0.7 },
  ultra: { noise: 0.08, voteNoise: 0, aware: 1, betaMul: 1, guessNoise: 0 },
  full: { noise: 0, voteNoise: 0, aware: 1, betaMul: 1, guessNoise: 0 }
};
// 手で決めた最初のパラメータ（学習前の基準）。学習済みは weights.js の WW_WEIGHTS
B.HAND = { beta: 1, eps: 0.08, a: [0.6, 1, 1], part: 0.6, gen: 0.3, decoy: 0.15, th: 0.5, tw: 0.1, lieTh: 0.7, kS: 1, kB: 1.5, kBw: 0.5, echoC: 0.3, offPen: 2, tgt: [1.2, 2, 2.6], dv: 1 };
B.PKEYS = [
  ['beta', 0.2, 3], ['eps', 0.01, 0.6], ['a0', 0.1, 1.5], ['a1', 0.3, 2], ['a2', 0.3, 2.5], ['part', 0.1, 1.2], ['decoy', 0.005, 1], ['th', 0.1, 0.9], ['tw', 0.02, 0.4],
  ['lieTh', 0.3, 0.98], ['kS', 0.1, 3], ['kB', 0.1, 4], ['kBw', 0, 2], ['echoC', -1, 2], ['offPen', 0, 4], ['tgt0', 0.8, 3], ['tgt1', 0.8, 3], ['tgt2', 0.8, 3], ['dv', 0, 2]
];
B.toVec = function (P) { return B.PKEYS.map(function (k) { var n = k[0]; return /^a\d$/.test(n) ? P.a[+n[1]] : /^tgt\d$/.test(n) ? P.tgt[+n[3]] : P[n]; }); };
B.fromVec = function (v) {
  var P = { a: [0, 0, 0], tgt: [0, 0, 0], gen: 0.3 };
  B.PKEYS.forEach(function (k, i) { var x = Math.min(k[2], Math.max(k[1], v[i])), n = k[0]; if (/^a\d$/.test(n)) P.a[+n[1]] = x; else if (/^tgt\d$/.test(n)) P.tgt[+n[3]] = x; else P[n] = x; });
  return P;
};
if (typeof module !== 'undefined' && module.exports) module.exports = B; else root.WWB = B;
})(this);
