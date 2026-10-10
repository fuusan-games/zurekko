/* ずれっこ：描画（ホスト・参加者で共通。受け取ったビューだけを使う） */
'use strict';
var ui = { gameKey: '', lid: 0, endKey: '', deadline: 0, hide: load(LS_HIDE) === '1', mode: '', suggKey: '', voteKey: '', guessKey: '', lastTurnKey: '', awakened: '', tickSec: -1, sfxAt: 0 };
function render(v) {
  lastView = v; window.__ww.view = v;
  var g = v.g;
  BGM.want(v.phase === 'game' && g && g.phase !== 'intro' ? (g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end' && g && g.result) { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' && !host ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
// ---------------- ロビー ----------------
function seg(id, items, cur, isHost, dis) {
  $(id).innerHTML = items.map(function (it) { var off = !isHost || (dis && dis(it[0])); return '<button data-v="' + it[0] + '" class="' + (String(it[0]) === String(cur) ? 'on' : '') + '"' + (off ? ' disabled' : '') + '>' + it[1] + '</button>'; }).join('');
  $(id).classList.toggle('ro', !isHost);
}
function scoreHtml(v) {
  var keys = Object.keys(v.scores || {}); if (!keys.length) return '';
  keys.sort(function (a, b) { return v.scores[b] - v.scores[a]; });
  var top = v.scores[keys[0]];
  return keys.map(function (k) {
    var nm = k.indexOf('npc:') === 0 ? (function (c) { return c ? c.name + c.e : k; })(L.charById(k.slice(4))) : k.slice(2);
    return '<div class="sc' + (v.scores[k] === top && top > 0 ? ' top' : '') + '"><span class="nm">' + esc(nm) + '</span><span class="pt">' + v.scores[k] + '</span></div>';
  }).join('');
}
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length, o = v.opts;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '">' + avHtml({ kind: 'human', name: s.name }) + '<span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  $('seatHint').textContent = '招待URLかQRで、各自のスマホから参加してね（最大' + MAX_HUMANS + '人）。話し合いは口でもチャットでもOK。';
  $('npcGrid').innerHTML = window.WW_CHARS.map(function (c) {
    var on = o.npcs.indexOf(c.id) >= 0;
    return '<button class="npcCard' + (on ? ' on' : '') + '" data-ch="' + c.id + '"' + (isHost ? '' : ' disabled') + '><span class="em">' + c.e + '</span><span class="nm">' + c.name + '</span><span class="ds">' + esc(c.desc) + '</span></button>';
  }).join('');
  var tot = n + o.npcs.length, bad = tot < 3 || tot > MAX_TOTAL;
  $('totalLine').textContent = '合計 ' + tot + '人（人間' + n + '・NPC' + o.npcs.length + '）' + (tot < 3 ? ' → 3人以上にしてね' : tot > MAX_TOTAL ? ' → ' + MAX_TOTAL + '人までです' : '');
  $('totalLine').classList.toggle('bad', bad);
  seg('lvSeg', [['easy', 'やさしい'], ['normal', 'ふつう'], ['smart', 'かしこい'], ['ultra', 'アストラ<br>ウルトラ😎']], o.lv, isHost);
  seg('roundSeg', [[2, '2回<small>サクッと</small>'], [3, '3回<small>じっくり</small>']], o.rounds, isHost);
  seg('talkSeg', [[30, '30秒'], [60, '60秒'], [90, '90秒'], [120, '2分']], o.talk, isHost);
  seg('wolfSeg', [[1, '1人'], [2, '2人<small>6人以上</small>']], o.wolves, isHost, function (k) { return k === 2 && tot < 6; });
  seg('revSeg', [['off', 'なし<small>おすすめ</small>'], ['on', 'あり<small>ウルフ有利</small>']], o.reverse ? 'on' : 'off', isHost);
  var sh = scoreHtml(v); $('scoreCard').style.display = sh ? '' : 'none'; $('scoreList').innerHTML = sh;
  $('startBtn').disabled = bad;
}
// ---------------- ゲーム ----------------
function myP(g) { return g.me; }
function phaseLabel(g) {
  var rd = 'ラウンド ' + (g.r + 1) + '/' + g.R;
  return { intro: '🎴 お題を確認', hint: rd + '・💡ヒント', talk: rd + '・🗣話し合い', vote: g.voteN > 1 ? '⚖️ 決選投票' : '🗳 投票', voteShow: '📣 開票！', guess: '🐺 逆転チャンス', end: '🏁 結果' }[g.phase] || '';
}
function pcHtml(g, i) {
  var pl = g.players[i], hs = g.hints[i], cls = 'pc';
  if (g.cur === i) cls += ' cur'; if (i === g.me) cls += ' me'; if (g.off && g.off[i]) cls += ' off'; if (g.caught === i && (g.phase === 'guess' || g.phase === 'end')) cls += ' caught';
  var badge = g.cur === i ? '🎤' : g.voted && g.voted[i] ? '✅' : g.off && g.off[i] ? '📴' : g.caught === i && g.phase === 'guess' ? '🐺' : '';
  var rows = ''; for (var r = 0; r < g.R; r++) rows += hs[r] ? '<span class="h">' + esc(hs[r]) + '</span>' : (r <= g.r ? '<span class="h empty">…</span>' : '');
  return '<div class="' + cls + '" data-p="' + i + '">' + (badge ? '<span class="bd">' + badge + '</span>' : '') + '<div class="hd">' + avHtml(pl) + '<span class="nm">' + esc(pl.name) + (i === g.me ? '（あなた）' : '') + '</span></div><div class="hs">' + rows + '</div></div>';
}
function entryHtml(g, e) {
  var pl = e.p != null && e.p >= 0 ? g.players[e.p] : null, mine = e.p === g.me;
  if (e.t === 'sys') return '<div class="lg-sys' + (e.big ? ' big' : '') + '">' + esc(e.text) + '</div>';
  if (e.t === 'hint') return '<div class="lg-hint' + (mine ? ' mine' : '') + '"><span class="rt">R' + (e.r + 1) + '</span>' + avHtml(pl, 'big') + '<div style="flex:1;min-width:0"><span class="nm">' + esc(pl.name) + (mine ? '（あなた）' : '') + (e.auto ? '・おまかせ' : '') + '</span><div class="tx">「' + esc(e.text) + '」</div>' + (e.say ? '<span class="sy">💬 ' + esc(e.say) + '</span>' : '') + '</div></div>';
  if (e.t === 'npc' || e.t === 'chat') return '<div class="lg-row' + (mine ? ' mine' : '') + (pl.kind === 'npc' ? ' npc' : '') + (e.k === 'defend' ? ' defend' : '') + '" style="--ac:' + (pl.col || '#888') + '">' + (mine ? '' : avHtml(pl)) + '<div class="lg-b">' + (mine ? '' : '<span class="who">' + esc(dispName(pl)) + '</span>') + esc(e.text) + '</div></div>';
  if (e.t === 'votes') {
    var lines = Object.keys(e.votes).map(function (k) { return esc(g.players[k].name) + ' → <b>' + esc(g.players[e.votes[k]].name) + '</b>'; }).join('<br>');
    var cnt = e.c.map(function (c, j) { return c ? esc(g.players[j].name) + ' ' + c + '票' : ''; }).filter(Boolean).join('・');
    return '<div class="lg-votes">🗳 ' + (e.n > 1 ? '決選投票の' : '') + '開票！<br>' + lines + '<br>📊 ' + cnt + '</div>';
  }
  if (e.t === 'guess') return '<div class="lg-guess">🐺 ' + esc(pl.name) + ' の答え：「' + esc(e.text) + '」</div>';
  return '';
}
function bigPop(text, red) { var p = $('bigPop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go' + (red ? ' red' : ''); }
function renderGame(v) {
  var g = v.g, me = myP(g), key = v.code + ':' + v.gameNo;
  if (ui.gameKey !== key) {
    ui.gameKey = key; ui.lid = 0; $('log').innerHTML = ''; ui.suggKey = ''; ui.voteKey = ''; ui.guessKey = ''; ui.lastTurnKey = ''; $('msgIn').value = '';
    if (g.ultra && ui.awakened !== key && g.phase === 'intro') { ui.awakened = key; try { awaken(); } catch (e) {} }
  }
  $('phLabel').textContent = phaseLabel(g);
  ui.deadline = g.left ? Date.now() + g.left : 0; paintTimer();
  // 自分のお題
  $('myWord').textContent = g.word || '（観戦中）'; $('myWord').classList.toggle('hid', ui.hide && !!g.word);
  $('hideBtn').textContent = ui.hide ? 'みる' : 'かくす'; $('catTag').textContent = g.cat;
  $('players').innerHTML = g.players.map(function (_, i) { return pcHtml(g, i); }).join('');
  var cur = $('players').querySelector('.pc.cur'); if (cur) { var pr = $('players'); var x = cur.offsetLeft - pr.clientWidth / 2 + cur.clientWidth / 2; if (Math.abs(pr.scrollLeft - x) > 40) pr.scrollTo({ left: x, behavior: 'smooth' }); }
  // ログ（新しい分だけ足す）
  var box = $('log'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 80, fresh = g.log.filter(function (e) { return e.id > ui.lid; });
  if (fresh.length) {
    var html = fresh.map(function (e) { return entryHtml(g, e); }).join('');
    box.insertAdjacentHTML('beforeend', html);
    while (box.children.length > 140) box.removeChild(box.firstChild);
    var first = ui.lid === 0; ui.lid = g.lid;
    if (near || first || fresh.some(function (e) { return e.p === me; })) box.scrollTop = box.scrollHeight;
    if (!first) onFresh(g, fresh, me);
  }
  // 自分の番の合図
  var tk = g.phase === 'hint' && g.cur === me ? 'h' + g.r + ':' + g.k : g.phase === 'vote' && g.myVote == null && me >= 0 ? 'v' + g.voteN : g.phase === 'guess' && g.caught === me ? 'g' : '';
  if (tk && tk !== ui.lastTurnKey) { ui.lastTurnKey = tk; sfx.turn(); vibrate(60); bigPop(tk[0] === 'h' ? 'あなたの番！' : tk[0] === 'v' ? '投票タイム！' : '逆転チャンス！', tk[0] === 'g'); }
  else if (!tk) ui.lastTurnKey = '';
  renderAct(v, g, me);
}
function onFresh(g, fresh, me) {
  var now = Date.now();
  fresh.forEach(function (e) {
    if (e.t === 'hint') sfx.hint();
    else if (e.t === 'votes') sfx.vote();
    else if (e.t === 'sys' && e.wolfFound != null) { sfx.wolf(); bigPop('🐺 ウルフ発見！', true); var gm = $('game'); gm.classList.remove('quake'); void gm.offsetWidth; gm.classList.add('quake'); }
    else if ((e.t === 'npc' || e.t === 'chat') && e.p !== me && now - ui.sfxAt > 350) { ui.sfxAt = now; (e.t === 'npc' ? sfx.npc : sfx.chat)(); }
    if (e.t === 'sys' && e.big && /投票タイム/.test(e.text) && !(g.phase === 'vote' && g.myVote == null && me >= 0)) bigPop('投票タイム！');
  });
}
var QUICK = ['あやしい…', 'わかる！', 'だれがウルフ？', '🤔 うーん', 'それズレてない？', 'わらった😂'];
function renderAct(v, g, me) {
  var mode = 'chat', lab = '', P = function (i) { return g.players[i] ? g.players[i].name : ''; };
  if (g.phase === 'hint' && g.cur === me) { mode = 'hint'; lab = '💡 あなたの番！ ヒントを1つ（お題そのものはNG・短く）'; }
  else if (g.phase === 'vote' && me >= 0 && g.myVote == null) { mode = 'vote'; lab = '🗳 ウルフだと思う人をタップ（1回だけ）'; }
  else if (g.phase === 'guess' && g.caught === me) { mode = 'guess'; lab = '🐺 あなたがウルフでした！ 逆転チャンス：<b>みんなのお題</b>は？'; }
  else if (g.phase === 'hint') lab = '💬 ' + esc(P(g.cur)) + ' がヒントを考え中…' + (g.players[g.cur].kind === 'human' && g.off && g.off[g.cur] ? '（切断中：おまかせで進めます）' : '');
  else if (g.phase === 'talk') lab = '🗣 話し合い中！ 口で話してもOK。NPCの名前を呼ぶと返事するよ';
  else if (g.phase === 'intro') lab = '🎴 お題を確認してね（「かくす」で画面から隠せます）';
  else if (g.phase === 'vote') lab = g.myVote != null ? '✅ ' + esc(P(g.myVote)) + ' に投票しました。みんなを待っています…（' + g.voted.filter(Boolean).length + '/' + g.n + '）' : '🗳 投票中…';
  else if (g.phase === 'voteShow') lab = '📣 開票中…';
  else if (g.phase === 'guess') lab = '🐺 ' + esc(P(g.caught)) + ' が みんなのお題を考え中…';
  $('actLab').innerHTML = lab; $('actLab').classList.toggle('mine', mode !== 'chat');
  // ヒント候補
  var sk = mode === 'hint' ? (g.sugg || []).join('|') : '';
  if (sk !== ui.suggKey) { ui.suggKey = sk; $('sugg').innerHTML = (g.sugg || []).map(function (s) { return '<button data-s="' + esc(s) + '">' + esc(s) + '</button>'; }).join(''); }
  $('sugg').style.display = mode === 'hint' && g.sugg && g.sugg.length ? '' : 'none';
  // 投票ボタン
  var vk = mode === 'vote' ? g.cands.join(',') + ':' + g.voteN : '';
  if (vk !== ui.voteKey) { ui.voteKey = vk; $('voteGrid').innerHTML = mode === 'vote' ? g.cands.filter(function (i) { return i !== me; }).map(function (i) { return '<button data-v="' + i + '">' + avHtml(g.players[i]) + '<span class="n">' + esc(g.players[i].name) + '</span></button>'; }).join('') : ''; }
  $('voteGrid').style.display = mode === 'vote' ? '' : 'none';
  // 答え当ての候補
  if (mode === 'guess') paintGuessList(g); else ui.guessKey = '';
  $('guessList').style.display = mode === 'guess' ? '' : 'none';
  $('quick').style.display = mode === 'chat' && g.phase !== 'intro' ? '' : 'none';
  if (!$('quick').innerHTML) $('quick').innerHTML = QUICK.map(function (q) { return '<button data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
  if (ui.mode !== mode) {
    ui.mode = mode; var inp = $('msgIn');
    $('inRow').classList.toggle('hintMode', mode === 'hint' || mode === 'guess');
    inp.placeholder = mode === 'hint' ? 'ヒント（例：' + ((g.sugg && g.sugg[0]) || 'ふんわり一言') + '）' : mode === 'guess' ? 'みんなのお題を入力 or 下から選ぶ' : mode === 'vote' ? 'チャット（投票は上のボタン）' : 'チャット（NPCの名前を呼ぶと返事するよ）';
    inp.maxLength = mode === 'hint' ? 16 : mode === 'guess' ? 20 : 40;
    $('sendBtn').textContent = mode === 'hint' ? '出す' : mode === 'guess' ? '答える' : '送信';
    if (mode === 'hint' || mode === 'guess') inp.value = '';
  }
  var sb = $('skipBtn'), canSkip = !!host && (g.phase === 'talk' || g.phase === 'intro');
  sb.style.display = canSkip ? '' : 'none';
  sb.textContent = g.phase === 'intro' ? '▶ はじめる' : g.r + 1 < g.R ? '⏭ 話し合いを終えて 次のラウンドへ' : '⏭ 話し合いを終えて 投票へ';
}
function paintGuessList(g) {
  var q = B.norm($('msgIn').value), key = q + '|' + (g.guessList || []).length;
  if (key === ui.guessKey) return; ui.guessKey = key;
  var list = (g.guessList || []).slice();
  if (q) list.sort(function (a, b) { var ha = B.norm(a).indexOf(q) >= 0 ? 0 : 1, hb = B.norm(b).indexOf(q) >= 0 ? 0 : 1; return ha - hb; });
  $('guessList').innerHTML = list.map(function (w) { return '<button data-g="' + esc(w) + '" class="' + (q && B.norm(w).indexOf(q) >= 0 ? 'hit' : '') + '">' + esc(w) + '</button>'; }).join('');
}
function paintTimer() {
  var el = $('timer'); if (!el) return;
  var left = ui.deadline ? Math.max(0, ui.deadline - Date.now()) : 0, v = lastView, g = v && v.g;
  if (!left || !g || g.phase === 'end') { el.style.visibility = 'hidden'; return; }
  el.style.visibility = ''; var s = Math.ceil(left / 1000);
  el.textContent = '⏱ ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
  var mine = (g.phase === 'hint' && g.cur === g.me) || (g.phase === 'vote' && g.myVote == null && g.me >= 0) || (g.phase === 'guess' && g.caught === g.me);
  el.classList.toggle('low', s <= 10 && (mine || g.phase === 'talk'));
  if (mine && s <= 5 && s !== ui.tickSec) { ui.tickSec = s; sfx.tick(); }
}
setInterval(paintTimer, 250);
// ---------------- 結果 ----------------
function renderEnd(v) {
  var g = v.g, r = g.result, me = g.me, key = v.code + ':' + v.gameNo;
  $('scoreList2').innerHTML = scoreHtml(v) || '<p class="hint">まだありません</p>';
  if (ui.endKey === key) return; ui.endKey = key;
  var names = function (arr) { return arr.map(function (i) { return g.players[i].name; }).join('・'); };
  $('pairRow').innerHTML = '<div class="pairCard" style="--d:.3s"><div class="in"><div class="fr"><span class="lb">みんなのお題</span><span class="w">' + esc(r.maj) + '</span></div><div class="bk">❓</div></div></div>' +
    '<div class="pairCard wolf" style="--d:1s"><div class="in"><div class="fr"><span class="lb">🐺 ウルフのお題</span><span class="w">' + esc(r.wolfW) + '</span></div><div class="bk">❓</div></div></div>';
  var cit = r.winner === 'citizen', caught = r.caught >= 0 ? g.players[r.caught].name : null, why;
  if (cit) why = 'ウルフ ' + names(r.wolves) + ' をつかまえた！' + (r.guess ? '（答え「' + r.guess.word + '」は はずれ）' : '');
  else if (r.guess && r.guess.ok) why = 'ウルフ ' + names(r.wolves) + ' が「' + r.guess.word + '」を当てて 大逆転！';
  else if (r.caught >= 0) why = caught + ' は市民だった…！ ウルフは ' + names(r.wolves);
  else why = 'だれもつかまらず… ウルフは ' + names(r.wolves);
  var meWolf = r.wolves.indexOf(me) >= 0, iWon = me >= 0 && (r.winner === 'wolf') === meWolf;
  $('winBan').className = 'winBan ' + (cit ? 'cit' : 'wolf');
  $('winBan').innerHTML = (cit ? '🎉 市民の勝ち！' : '🐺 ウルフの勝ち！') + '<small>' + esc(why) + (me >= 0 ? (iWon ? '　あなたの勝ち！' : '　あなたの負け…') : '') + '</small>';
  $('revList').innerHTML = g.players.map(function (pl, i) {
    var w = r.wolves.indexOf(i) >= 0, vt = r.tally && r.tally.votes[i] != null ? '→ ' + g.players[r.tally.votes[i]].name : '';
    return '<div class="rv' + (w ? ' wolf' : '') + '" style="--d:' + (1.5 + i * 0.16).toFixed(2) + 's">' + avHtml(pl) + '<span class="nm">' + esc(dispName(pl)) + (i === me ? '（あなた）' : '') + (w ? ' 🐺' : '') + (i === r.caught ? ' 👉' : '') + '</span><span class="vt">' + esc(vt) + '</span><span class="wd">' + esc(r.words[i]) + '</span></div>';
  }).join('');
  $('endLine').innerHTML = (g.endLines || []).map(function (l) { var pl = g.players[l.p]; return pl.e + '「' + esc(l.text) + '」'; }).join('　');
  var th = g.players.map(function (pl, i) {
    if (!r.thoughts[i]) return '';
    return '<details class="th"' + (r.wolves.indexOf(i) >= 0 ? ' open' : '') + '><summary>' + avHtml(pl) + esc(dispName(pl)) + (r.wolves.indexOf(i) >= 0 ? '（ウルフだった）' : '') + '</summary><ol>' + r.thoughts[i].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></details>';
  }).join('');
  $('thCard').style.display = th ? '' : 'none'; $('thList').innerHTML = th;
  $('logCopy').innerHTML = g.log.map(function (e) { return entryHtml(g, e); }).join('');
  $('end').scrollTop = 0;
  sfx.drum(); setTimeout(sfx.flip, 300); setTimeout(sfx.flip, 1000);
  setTimeout(function () { if (iWon || me < 0) { sfx.win(); confetti(70); } else sfx.lose(); }, 2200);
}
