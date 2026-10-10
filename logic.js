/* ずれっこ：ゲームの進行（ホストだけが動かす。ブラウザ／Node 共通・DOMなし）
 * 流れ：お題確認 → [ヒント（順番に1人1つ）→ 話し合い] × ラウンド数 → 投票（同数なら決選1回）→ ウルフが当たったら逆転チャンス（多数派のお題を当てる）→ 結果
 * 秘密：L.view(G, p) は「その人のお題」だけを入れる。他人のお題・NPCの頭の中は結果発表まで入れない。
 */
(function (root) {
'use strict';
var B = root.WWB, CH = root.WW_CHARS, L = {};
L.LV_KEYS = ['easy', 'normal', 'smart', 'ultra'];
L.LV_NAMES = { easy: 'やさしい', normal: 'ふつう', smart: 'かしこい', ultra: 'アストラウルトラ😎' };
L.charById = function (id) { for (var i = 0; i < CH.length; i++) if (CH[i].id === id) return CH[i]; return null; };
L.T = { intro: 5000, npcHint: [1700, 3300], hint: 90000, off: 8000, react: [900, 2200], vote: 60000, npcVote: [1500, 5000], voteShow: 4500, guess: 60000, npcGuess: [3500, 5000], k: 1 };
L.TURBO = { intro: 300, npcHint: [60, 140], hint: 6000, off: 600, react: [40, 120], vote: 6000, npcVote: [60, 200], voteShow: 400, guess: 6000, npcGuess: [100, 200], k: 0.02 };
L.MAX_LOG = 160;
function rr(G, a) { return a[0] + G.rng() * (a[1] - a[0]); }
function pick(G, a) { return a[Math.floor(G.rng() * a.length)]; }
function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }
function shuffle(G, a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(G.rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
L.cleanText = function (s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 40); };

// ---------- 開始 ----------
// o = { players:[{kind:'human',sid,name}|{kind:'npc',ch}], lv, rounds, talk(秒), wolves, reverse, turbo, rng, now, recent:[pairId] }
L.newGame = function (db, P, o) {
  var rng = o.rng || Math.random, now = o.now != null ? o.now : Date.now(), n = o.players.length, T = o.turbo ? L.TURBO : L.T;
  var recent = o.recent || [], pool = db.pairs.filter(function (p) { return recent.indexOf(p.id) < 0; });
  if (o.pairId != null) pool = [db.pairs[o.pairId]];
  if (!pool.length) pool = db.pairs;
  var pair = pool[Math.floor(rng() * pool.length)], flip = rng() < 0.5;
  var maj = flip ? pair.a : pair.b, wolfW = flip ? pair.b : pair.a, nw = Math.max(1, Math.min(o.wolves || 1, n >= 6 ? 2 : 1));
  var seats = []; for (var i = 0; i < n; i++) seats.push(i);
  var G = { rng: rng, T: T, db: db, n: n, R: o.rounds || 3, talk: o.talk == null ? 60 : o.talk, lv: o.lv || 'normal', reverse: o.reverse !== false, nw: nw,
    pairId: pair.id, cat: pair.cat, maj: maj, wolfW: wolfW, words: [], wolves: [], players: [], minds: [],
    phase: 'intro', at: now + T.intro, r: 0, k: 0, start: 0, log: [], lid: 0, hints: [], votes: {}, voteN: 1, cands: seats.slice(), tally: null, caught: -1, guess: null, winner: null,
    queue: [], used: {}, thoughts: [], sugg: {}, npcAt: 0, deadline: 0, said: {}, accused: {}, result: null };
  shuffle(G, seats); G.wolves = seats.slice(0, nw);
  o.players.forEach(function (pl, i) {
    var ch = pl.kind === 'npc' ? L.charById(pl.ch) : null;
    G.players.push(pl.kind === 'npc' ? { kind: 'npc', ch: ch.id, name: ch.name, e: ch.e, col: ch.col } : { kind: 'human', sid: pl.sid, name: pl.name });
    G.words.push(G.wolves.indexOf(i) >= 0 ? wolfW : maj);
    G.hints.push([]); G.thoughts.push([]);
  });
  // 頭脳：NPCは選んだ強さで。人間の席にも「代理用」の頭脳（切断時の代打ち用。その人のお題と公開ヒントだけ）
  G.players.forEach(function (pl, i) {
    var ch = pl.kind === 'npc' ? L.charById(pl.ch) : null;
    G.minds.push(B.mind(db, { word: G.words[i], me: i, n: n, wolves: nw, P: P, lv: B.LV[pl.kind === 'npc' ? G.lv : 'normal'], rng: rng, persona: ch ? ch.ps : null }));
  });
  G.start = Math.floor(rng() * n);
  sys(G, '🎴 お題が配られました（カテゴリ：' + G.cat + '）。自分のお題を こっそり確認してね。ウルフ' + (nw > 1 ? 'は' + nw + '人' : 'は1人') + '…誰かは、まだ誰も知りません。');
  return G;
};
function push(G, e) { e.id = ++G.lid; G.log.push(e); if (G.log.length > L.MAX_LOG) G.log.splice(0, G.log.length - L.MAX_LOG); return e; }
function sys(G, text, extra) { var e = { t: 'sys', text: text }; if (extra) for (var k in extra) e[k] = extra[k]; return push(G, e); }
function npc(G, p) { return G.players[p].kind === 'npc' ? L.charById(G.players[p].ch) : null; }
L.cur = function (G) { return (G.start + G.r + G.k) % G.n; };
function nameOf(G, p) { return G.players[p].name; }
// セリフ：同じNPCが同じ文を続けて言わないように
function line(G, p, key, o, cond) {
  var ch = npc(G, p); if (!ch) return null;
  var arr = (ch.L[key] || []).filter(function (t) { return !cond || cond(t); }); if (!arr.length) return null;
  var fresh = arr.filter(function (t) { return !G.said[ch.id + t]; }); if (!fresh.length) { arr.forEach(function (t) { delete G.said[ch.id + t]; }); fresh = arr; }
  var t = pick(G, fresh); G.said[ch.id + t] = 1; return fill(t, o || {});
}
function say(G, p, text, kind, delay, now) { if (text) G.queue.push({ at: now + delay, p: p, text: text, kind: kind || 'talk' }); }
function pct(x) { return Math.max(1, Math.min(99, Math.round(x * 100))); }

// ---------- ヒント ----------
function startRound(G, now) {
  G.phase = 'hint'; G.k = 0; G.npcAt = 0; G.deadline = 0; G.sugg = {};
  sys(G, '💡 ラウンド ' + (G.r + 1) + ' / ' + G.R + '：順番に ヒントを1つずつ' + (G.r === 0 ? '。最初は ふんわりがコツ！' : G.r === G.R - 1 ? '（最後のヒント！）' : ''), { big: 1 });
  beginTurn(G, now);
}
function beginTurn(G, now) {
  var p = L.cur(G); G.npcAt = 0;
  G.deadline = G.players[p].kind === 'human' ? now + G.T.hint : 0;
}
L.hint = function (G, p, text, now, auto) {
  if (G.phase !== 'hint' || L.cur(G) !== p) return 'いまは あなたの番ではありません';
  text = L.cleanText(text, 16);
  if (!text) return 'ヒントを入力してね';
  if (B.containsWord(text, G.words[p])) return 'お題そのものは言えません（ちがう言葉でヒントを！）';
  G.lastHint = push(G, { t: 'hint', p: p, text: text, r: G.r, auto: auto ? 1 : 0 });
  G.hints[p].push(text);
  G.minds.forEach(function (M) { B.observe(M, p, text, G.r); });
  react(G, p, text, now);
  G.k++;
  if (G.k >= G.n) startTalk(G, now); else beginTurn(G, now);
  return null;
};
// 誰かのヒントに、NPCがたまに ひとこと
function react(G, p, text, now) {
  var cands = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== p) cands.push(i); });
  if (!cands.length || G.rng() > 0.45) return;
  var i = pick(G, cands), ch = npc(G, i), M = G.minds[i];
  if (G.rng() > ch.ps.talk) return;
  var post = B.posterior(M), fitMe = B.fit(G.db, M.P, text, M.w), fitO = B.fit(G.db, M.P, text, M.words[post.top]);
  var t = null;
  if (post.q > 0.55) { if (G.rng() < 0.5) t = line(G, i, 'cover'); }
  else if (fitMe >= 0.5 && fitO < 0.3) t = line(G, i, 'agree', { n: nameOf(G, p), h: text });
  else if (fitMe < 0.2 && fitO >= 0.5 && G.r > 0 && G.rng() < 0.7) t = line(G, i, 'suspect', { n: nameOf(G, p), h: text, p: pct(post.susC[p]) });
  say(G, i, t, 'react', rr(G, G.T.react), now);
}

// ---------- 話し合い ----------
function startTalk(G, now) {
  G.phase = 'talk'; G.deadline = 0;
  G.at = now + Math.max(5, G.talk) * 1000 * (G.T.k < 1 ? G.T.k : 1);
  var last = G.r === G.R - 1;
  sys(G, last ? '🗣 最後の話し合い！ このあと投票です' : '🗣 話し合いタイム（口で話してOK・チャットもOK）', { big: 1 });
  // NPCの考えを記録（結果発表で「心の声」として見せる）
  G.players.forEach(function (pl, i) {
    if (pl.kind !== 'npc') return;
    var M = G.minds[i], post = B.posterior(M), ch = npc(G, i), q = post.q * (M.lv.aware == null ? 1 : M.lv.aware) * (ch.ps.aware || 1);
    var top = -1; for (var j = 0; j < G.n; j++) if (j !== i && (top < 0 || post.susC[j] > post.susC[top])) top = j;
    G.thoughts[i].push({ r: G.r, q: post.q, top: top, ps: post.susC[top], other: M.words[post.top], po: post.pO[post.top] });
  });
  // NPCの発言（性格で量と中身が変わる）
  var span = Math.max(4000, (G.at - now) * 0.6), order = [];
  G.players.forEach(function (pl, i) { if (pl.kind === 'npc') order.push(i); }); shuffle(G, order);
  order.forEach(function (i, idx) {
    var ch = npc(G, i), M = G.minds[i]; if (G.rng() > ch.ps.talk + (last ? 0.2 : 0)) return;
    var post = B.posterior(M), q = post.q * (M.lv.aware == null ? 1 : M.lv.aware) * (ch.ps.aware || 1);
    var top = -1; for (var j = 0; j < G.n; j++) if (j !== i && (top < 0 || post.susC[j] > post.susC[top])) top = j;
    var base = 1 / Math.max(1, G.n - 1), t = null, target = -1, delay = 600 * G.T.k + span * (idx + G.rng() * 0.6) / Math.max(1, order.length);
    if (q > 0.55) {   // 自分がズレてるかも → まぎれる（キツネとネコは、わざと誰かを疑ってみせる）
      if ((ch.id === 'kon' || ch.id === 'nyaco') && G.rng() < 0.6) { target = B.vote(M, G.players.map(function (_, j) { return j; })); var hh = G.hints[target][G.hints[target].length - 1]; t = hh ? line(G, i, 'suspect', { n: nameOf(G, target), h: hh, p: pct(0.4 + G.rng() * 0.3) }) : null; }
      if (!t) t = line(G, i, 'cover');
    } else if (top >= 0 && post.susC[top] >= Math.max(base * 1.25, ch.ps.acc * (G.r === 0 ? 1.3 : 1))) {
      var odd = B.oddHint(M, top); target = top;
      t = odd ? line(G, i, 'suspect', { n: nameOf(G, top), h: odd, p: pct(post.susC[top]) }) : line(G, i, 'suspect', { n: nameOf(G, top), h: G.hints[top][0] || '…', p: pct(post.susC[top]) }, function (s) { return s.indexOf('{h}') < 0; });
    } else t = line(G, i, 'vague', { p: pct(base) });
    say(G, i, t, 'talk', delay, now);
    if (target >= 0 && G.players[target].kind === 'npc' && G.rng() < 0.85) {   // 疑われたNPCは言い返す
      var gh = B.goodHint(G.minds[target], target) || G.hints[target][0];
      say(G, target, line(G, target, 'defend', { h: gh, n: nameOf(G, i) }), 'defend', delay + rr(G, [1200, 2400]) * Math.max(G.T.k, 0.05), now);
    }
  });
}
L.skip = function (G, now) {   // ホスト：話し合いを切り上げる
  if (G.phase === 'talk') { G.at = now; return null; }
  if (G.phase === 'intro') { G.at = now; return null; }
  return 'いまは進められません';
};
function endTalk(G, now) {
  G.queue = G.queue.filter(function (q) { return q.kind === 'defend' && q.at - now < 1500; });
  if (G.r + 1 < G.R) { G.r++; startRound(G, now); } else startVote(G, now, null);
}

// ---------- 投票 ----------
function startVote(G, now, cands) {
  G.phase = 'vote'; G.votes = {}; G.tally = null; G.deadline = now + G.T.vote;
  G.cands = cands || G.players.map(function (_, i) { return i; });
  G.voteAt = {};
  G.players.forEach(function (pl, i) { if (pl.kind === 'npc') G.voteAt[i] = now + rr(G, G.T.npcVote); });
  sys(G, cands ? '⚖️ 同数！ ' + cands.map(function (j) { return nameOf(G, j); }).join('・') + ' で決選投票' : '🗳 投票タイム！ ウルフだと思う人をタップ', { big: 1 });
}
L.vote = function (G, p, target, now) {
  if (G.phase !== 'vote') return 'いまは投票できません';
  if (G.votes[p] != null) return 'もう投票しました';
  target = +target;
  if (target === p || G.cands.indexOf(target) < 0 || !(target >= 0 && target < G.n)) return 'その人には投票できません';
  G.votes[p] = target;
  if (Object.keys(G.votes).length >= G.n) tallyVotes(G, now);
  return null;
};
function tallyVotes(G, now) {
  var c = new Array(G.n).fill(0); Object.keys(G.votes).forEach(function (k) { c[G.votes[k]]++; });
  var mx = Math.max.apply(null, G.cands.map(function (j) { return c[j]; })), top = G.cands.filter(function (j) { return c[j] === mx; });
  G.tally = { c: c, votes: Object.assign({}, G.votes), top: top, n: G.voteN };
  G.phase = 'voteShow'; G.at = now + G.T.voteShow;
  push(G, { t: 'votes', votes: G.tally.votes, c: c, top: top, n: G.voteN });
}
function afterVoteShow(G, now) {
  var top = G.tally.top;
  if (top.length > 1) {
    if (G.voteN === 1) { G.voteN = 2; startVote(G, now, top); return; }
    sys(G, '😶 決選投票も同数…だれも つかまりませんでした', { big: 1 }); finish(G, now, -1); return;
  }
  var c = top[0]; G.caught = c;
  var isWolf = G.wolves.indexOf(c) >= 0;
  sys(G, '👉 ' + nameOf(G, c) + ' が いちばん票を集めました…', { big: 1 });
  if (isWolf && G.reverse) {
    G.phase = 'guess'; G.deadline = now + G.T.guess; G.guessAt = G.players[c].kind === 'npc' ? now + rr(G, G.T.npcGuess) : 0;
    sys(G, '🐺 ' + nameOf(G, c) + ' は ウルフでした！ でも 逆転チャンス：みんなのお題を当てたら ウルフの勝ち！', { big: 1, wolfFound: c });
    say(G, c, line(G, c, 'outWolf'), 'talk', 500 * G.T.k, now);
  } else {
    if (!isWolf) say(G, c, line(G, c, 'outCit'), 'talk', 300 * G.T.k, now);
    finish(G, now, isWolf ? 'citizen' : 'wolf');
  }
}
// ---------- 逆転（ウルフが多数派のお題を当てる） ----------
L.guessCands = function (G) { return G.db.cats[G.cat].filter(function (w) { return w !== G.wolfW; }).slice().sort(); };
L.guess = function (G, p, word, now) {
  if (G.phase !== 'guess' || p !== G.caught) return 'いまは答えられません';
  word = L.cleanText(word, 20); if (!word) return '答えを入力してね';
  var ok = B.norm(word) === B.norm(G.maj);
  G.guess = { p: p, word: word, ok: ok };
  push(G, { t: 'guess', p: p, text: word });
  finish(G, now, ok ? 'wolf' : 'citizen');
  return null;
};
function finish(G, now, winner) {
  if (winner === -1) winner = 'wolf';
  G.winner = winner; G.phase = 'end'; G.queue = [];
  var g = G.guess;
  sys(G, g ? (g.ok ? '🎯 「' + g.word + '」…正解！ ウルフの大逆転！' : '❌ 「' + g.word + '」…はずれ！') : '', { big: 1 });
  G.result = { maj: G.maj, wolfW: G.wolfW, words: G.words.slice(), wolves: G.wolves.slice(), caught: G.caught, guess: g, winner: winner, tally: G.tally, cat: G.cat,
    thoughts: G.players.map(function (pl, i) { return pl.kind === 'npc' ? L.thoughtText(G, i) : null; }) };
  G.log = G.log.filter(function (e) { return e.text !== ''; });
  G.players.forEach(function (pl, i) { if (pl.kind !== 'npc') return; var w = (winner === 'wolf') === (G.wolves.indexOf(i) >= 0); say(G, i, line(G, i, w ? 'win' : 'lose'), 'talk', 0, now); });
  G.endLines = G.queue.map(function (q) { return { p: q.p, text: q.text }; }); G.queue = [];
}
// 結果発表で見せる NPC の「心の声」
L.thoughtText = function (G, i) {
  var out = [], M = G.minds[i], wasAware = false;
  G.thoughts[i].forEach(function (t) {
    var s = 'R' + (t.r + 1) + '：';
    if (t.q > 0.5 && !wasAware) { wasAware = true; s += 'あれ？ みんなのヒントが「' + t.other + '」っぽい…ズレてるのは自分かも（' + pct(t.q) + '%）→ まぎれる作戦'; }
    else if (t.q > 0.5) s += 'たぶん自分がウルフ（' + pct(t.q) + '%）。みんなのお題は「' + t.other + '」とみた';
    else if (t.ps > 1.3 / Math.max(1, G.n - 1)) s += nameOf(G, t.top) + 'があやしい（' + pct(t.ps) + '%）。相手のお題は「' + t.other + '」かな（' + pct(t.po) + '%）';
    else s += 'まだ様子見（自分がズレてる確率 ' + pct(t.q) + '%）';
    out.push(s);
  });
  if (G.tally && G.tally.votes[i] != null) out.push('投票：' + nameOf(G, G.tally.votes[i]));
  if (G.guess && G.guess.p === i) { var gg = B.guess(M); out.push('答え当て：「' + G.guess.word + '」（確信度 ' + pct(gg.p) + '%）'); }
  return out;
};

// ---------- 進行（ホストのタイマーから呼ぶ） ----------
// isOff(p)：その人間が切断中なら true（代打ちする）
L.tick = function (G, now, isOff) {
  isOff = isOff || function () { return false; };
  var did = false;
  G.queue.sort(function (a, b) { return a.at - b.at; });
  while (G.queue.length && G.queue[0].at <= now && G.phase !== 'end') { var q = G.queue.shift(); push(G, { t: 'npc', p: q.p, text: q.text, k: q.kind }); did = true; }
  if (G.phase === 'intro') { if (now >= G.at) { startRound(G, now); did = true; } }
  else if (G.phase === 'hint') {
    var p = L.cur(G), pl = G.players[p];
    if (pl.kind === 'npc') {
      if (!G.npcAt) G.npcAt = now + rr(G, G.T.npcHint);
      else if (now >= G.npcAt) {
        var h = B.chooseHint(G.minds[p], G.r, G.R), txt = h.text;
        var ln = line(G, p, 'hint', { h: txt });
        if (L.hint(G, p, txt, now)) L.hint(G, p, 'うーん', now);
        else if (ln && G.rng() < 0.55) G.lastHint.say = ln;
        did = true;
      }
    } else if ((isOff(p) && now >= (G.deadline - G.T.hint + G.T.off)) || now >= G.deadline) {
      var sg = L.suggestFor(G, p), t2 = sg[0] || 'うーん';
      if (L.hint(G, p, t2, now, true)) L.hint(G, p, 'うーん', now, true);
      did = true;
    }
  } else if (G.phase === 'talk') { if (now >= G.at) { endTalk(G, now); did = true; } }
  else if (G.phase === 'vote') {
    G.players.forEach(function (pl2, i) {
      if (G.votes[i] != null || G.phase !== 'vote') return;
      var due = pl2.kind === 'npc' ? now >= G.voteAt[i] : (isOff(i) && now >= G.deadline - G.T.vote + G.T.off) || now >= G.deadline;
      if (due) { L.vote(G, i, B.vote(G.minds[i], G.cands), now); did = true; }
    });
  } else if (G.phase === 'voteShow') { if (now >= G.at) { afterVoteShow(G, now); did = true; } }
  else if (G.phase === 'guess') {
    var c = G.caught;
    if (G.players[c].kind === 'npc') { if (now >= G.guessAt) { var gs = B.guess(G.minds[c]); var gl = line(G, c, 'guess', { w: gs.word, p: pct(gs.p) }); if (gl) push(G, { t: 'npc', p: c, text: gl, k: 'talk' }); L.guess(G, c, gs.word, now); did = true; } }
    else if ((isOff(c) && now >= G.deadline - G.T.guess + G.T.off * 3) || now >= G.deadline) { var g2 = B.guess(G.minds[c]); sys(G, '⏰ 時間切れ…（代わりに おまかせで答えます）'); L.guess(G, c, isOff(c) ? g2.word : '（時間切れ）', now); did = true; }
  }
  return did;
};
L.suggestFor = function (G, p) {
  var key = G.r + ':' + p;
  if (!G.sugg[key]) { var used = []; G.hints.forEach(function (hs) { used = used.concat(hs); }); G.sugg[key] = B.suggest(G.db, G.words[p], used, G.rng, 6); }
  return G.sugg[key];
};

// ---------- チャット（人間の自由発言。NPCはキーワードで反応） ----------
var RX = { acc: /あやし|怪し|ウルフ|うるふ|ズレ|ずれ|違う|ちがう|おかし|犯人|うそ|嘘|狼/, q: /[?？]|だれ|誰|どう思|どう？|どっち|わかる|分かる|教えて/, laugh: /(w|ｗ|笑|草)$/, greet: /よろしく|こんにち|はじめまして|やあ|おはよ|こんばん|ヨロシク/ };
L.chat = function (G, p, text, now) {
  if (G.phase === 'end') return 'ゲームは終わりました';
  text = L.cleanText(text, 40); if (!text) return null;
  if (p >= 0 && B.containsWord(text, G.words[p])) return 'お題そのものは言えません';
  push(G, { t: 'chat', p: p, text: text });
  var npcs = []; G.players.forEach(function (pl, i) { if (pl.kind === 'npc' && i !== p) npcs.push(i); });
  if (!npcs.length) return null;
  var men = []; G.players.forEach(function (pl, i) { if (i === p) return; var nm = pl.name; if (nm.length >= 2 ? text.indexOf(nm) >= 0 : text.indexOf(nm + 'さん') >= 0) men.push(i); if (pl.kind === 'npc' && pl.ch === 'pochi' && text.indexOf('ポチ') >= 0 && men.indexOf(i) < 0) men.push(i); if (pl.kind === 'npc' && pl.ch === 'robo' && /ロボ/.test(text) && men.indexOf(i) < 0) men.push(i); });
  // 説明っぽいチャット（「麺が太い感じ」など）は、NPCの推理にも弱い証拠として入る（ヒントの半分の重み）
  var clue = false; G.minds.forEach(function (M, i) { if (i !== p && B.observeSoft(M, p, text, 0.5)) clue = true; });
  var acc = RX.acc.test(text), q = RX.q.test(text), d = function () { return rr(G, [800, 2000]) * (G.T.k < 1 ? 0.05 : 1); };
  var mNpc = men.filter(function (i) { return G.players[i].kind === 'npc'; });
  if (mNpc.length && acc && !q) { var k = mNpc[0]; say(G, k, line(G, k, 'defend', { h: B.goodHint(G.minds[k], k) || G.hints[k][0] || '…', n: nameOf(G, p) }, G.hints[k].length ? null : function (s) { return s.indexOf('{h}') < 0; }), 'defend', d(), now); return null; }
  if (mNpc.length) { answer(G, mNpc[0], now, d()); return null; }
  if (men.length && acc) {   // 人間を名指しで疑った → NPCが同意したり、かばったり
    var j = men[0], i2 = pick(G, npcs.filter(function (x) { return x !== j; }).concat(npcs)), M = G.minds[i2], post = B.posterior(M);
    if (i2 === j) return null;
    var hi = post.susC[j] > 1.25 / Math.max(1, G.n - 1);
    say(G, i2, hi ? line(G, i2, 'suspect', { n: nameOf(G, j), h: B.oddHint(M, j) || G.hints[j][G.hints[j].length - 1] || '…', p: pct(post.susC[j]) }) : line(G, i2, 'dunno'), 'talk', d(), now);
    return null;
  }
  if (clue && !acc && !q && G.rng() < 0.7) {   // NPCがその説明に反応：自分のお題に合えば共感、合わなければ ツッコミ
    var i4 = pick(G, npcs), M4 = G.minds[i4], f = B.fit(G.db, M4.P, text, M4.w), h4 = text.length > 14 ? text.slice(0, 13) + '…' : text;
    say(G, i4, line(G, i4, f > 0.3 ? 'agree' : 'suspect', { n: nameOf(G, p), h: h4, p: pct(B.posterior(M4).susC[p] || 0.3) }), 'talk', d(), now);
    return null;
  }
  if (acc || q) { shuffle(G, npcs).slice(0, 1 + (G.rng() < 0.4 ? 1 : 0)).forEach(function (i, x) { answer(G, i, now, d() + x * 900 * (G.T.k < 1 ? 0.05 : 1)); }); return null; }
  if (RX.greet.test(text)) { shuffle(G, npcs).slice(0, 2).forEach(function (i, x) { say(G, i, line(G, i, 'greet'), 'talk', d() + x * 700, now); }); return null; }
  if (RX.laugh.test(text) && G.rng() < 0.5) { var i3 = pick(G, npcs); say(G, i3, line(G, i3, 'laugh'), 'talk', d(), now); }
  return null;
};
function answer(G, i, now, delay) {
  var M = G.minds[i], post = B.posterior(M), top = -1;
  for (var j = 0; j < G.n; j++) if (j !== i && (top < 0 || post.susC[j] > post.susC[top])) top = j;
  var q = post.q * (M.lv.aware == null ? 1 : M.lv.aware);
  if (q > 0.55) { var t = B.vote(M, G.players.map(function (_, x) { return x; })); say(G, i, line(G, i, 'asked', { n: nameOf(G, t), p: pct(0.3 + G.rng() * 0.3) }), 'talk', delay, now); return; }
  if (G.hints.every(function (h) { return !h.length; }) || post.susC[top] < 1.15 / Math.max(1, G.n - 1)) { say(G, i, line(G, i, 'dunno'), 'talk', delay, now); return; }
  say(G, i, line(G, i, 'asked', { n: nameOf(G, top), p: pct(post.susC[top]) }), 'talk', delay, now);
}

// ---------- その人に見せてよい情報だけ ----------
L.view = function (G, p, now) {
  var v = { n: G.n, R: G.R, r: G.r, k: G.k, cur: G.phase === 'hint' ? L.cur(G) : -1, phase: G.phase, cat: G.cat, lv: G.lv, reverse: G.reverse, nw: G.nw, talk: G.talk,
    players: G.players.map(function (pl) { return { kind: pl.kind, sid: pl.sid, name: pl.name, ch: pl.ch, e: pl.e, col: pl.col }; }),
    hints: G.hints.map(function (h) { return h.slice(); }), log: G.log.slice(-120), lid: G.lid,
    left: Math.max(0, (G.phase === 'talk' || G.phase === 'intro' || G.phase === 'voteShow' ? G.at : G.deadline || G.at) - now),
    voted: G.phase === 'vote' ? G.players.map(function (_, i) { return G.votes[i] != null; }) : null, cands: G.cands.slice(), voteN: G.voteN, tally: G.tally, caught: G.caught,
    me: p, word: p >= 0 ? G.words[p] : null };
  if (p >= 0 && G.phase === 'vote' && G.votes[p] != null) v.myVote = G.votes[p];
  if (p >= 0 && G.phase === 'hint' && L.cur(G) === p && G.players[p].kind === 'human') v.sugg = L.suggestFor(G, p);
  if (G.phase === 'guess' && p === G.caught) v.guessList = L.guessCands(G);
  if (G.phase === 'end') { v.result = G.result; v.endLines = G.endLines; }
  return v;
};
if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.WWL = L;
})(this);
