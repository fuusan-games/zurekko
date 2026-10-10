/* ずれっこ：ホスト側の進行（部屋・ゲーム開始・タイマー・操作の受付・各参加者に送る内容） */
'use strict';
function hostId(code) { return ID_PREFIX + code; }
var DEFAULT_NPCS = ['fuu', 'mimi', 'pochi', 'robo'];
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', nextSid: 2, gameNo: 0,
    opts: { npcs: solo ? DEFAULT_NPCS.slice() : ['fuu', 'robo'], lv: 'normal', rounds: 3, talk: 60, wolves: 1, reverse: false },
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null, scores: {}, recent: [], history: [] };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false, chatAt: {} };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (resumeRoom && resumeRoom.G) { host.room.phase = 'lobby'; host.room.G = null; host.room.notice = { id: Date.now(), msg: '前回のゲームはここまで。ロビーから はじめてね' }; }   // 頭脳の状態は保存しないので、ゲーム途中からは再開しない
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 100);
}
function totalOf(R) { return R.seats.length + R.opts.npcs.length; }
function hostStartGame() {
  var R = host.room, n = totalOf(R);
  if (n < 3) { toast('3人以上で遊べます（NPCを増やしてね）'); return; }
  if (n > MAX_TOTAL) { toast('合計' + MAX_TOTAL + '人までです（NPCを減らしてね）'); return; }
  R.gameNo++; R.lobbyReq = null;
  var players = R.seats.map(function (s) { return { kind: 'human', sid: s.sid, name: s.name }; }).concat(R.opts.npcs.map(function (id) { return { kind: 'npc', ch: id }; }));
  for (var i = players.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = players[i]; players[i] = players[j]; players[j] = t; }   // 席をまぜる
  var ultra = R.opts.lv === 'ultra';
  R.G = L.newGame(DB, PW, { players: players, lv: R.opts.lv, rounds: R.opts.rounds, talk: R.opts.talk, wolves: R.opts.wolves, reverse: R.opts.reverse, turbo: TURBO, recent: R.recent, now: Date.now() + (ultra && !TURBO ? 7000 : 0) });
  R.G.ultra = ultra;
  R.recent.push(R.G.pairId); if (R.recent.length > 60) R.recent.shift();
  R.phase = 'game'; R.scored = false;
  hostBroadcast();
}
function seatIndex(G, sid) { for (var i = 0; i < G.players.length; i++) if (G.players[i].kind === 'human' && G.players[i].sid === sid) return i; return -1; }
function isOffFn() {
  var R = host.room;
  return function (p) { var pl = R.G.players[p]; if (pl.kind !== 'human') return false; var s = seatBySid(pl.sid); return !s || (s.kind === 'remote' && !s.connected); };
}
function hostTick() {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  var did = L.tick(G, now, isOffFn());
  if (G.phase === 'end' && !R.scored) {
    R.scored = true; R.phase = 'end';
    var res = G.result;
    G.players.forEach(function (pl, i) {
      var key = pl.kind === 'npc' ? 'npc:' + pl.ch : 'h:' + pl.name, isW = res.wolves.indexOf(i) >= 0, win = (res.winner === 'wolf') === isW;
      R.scores[key] = (R.scores[key] || 0) + (win ? (isW ? 3 : 1) : 0);
    });
    R.history.push({ winner: res.winner, maj: res.maj, wolfW: res.wolfW }); if (R.history.length > 20) R.history.shift();
    did = true;
  }
  if (did) hostBroadcast();
}
// 操作（ホスト本人は sid=1）。エラー文字列 or null
function hostAction(sid, m) {
  var R = host.room, G = R.G, now = Date.now();
  if (!G || (R.phase !== 'game' && R.phase !== 'end')) return null;
  var p = seatIndex(G, sid), a = String(m.a || ''), err = null;
  if (a === 'skip') { if (sid !== 1) return 'ホストだけが進められます'; err = L.skip(G, now); }
  else if (p < 0) return 'あなたは このゲームに参加していません';
  else if (a === 'hint') err = L.hint(G, p, m.v, now);
  else if (a === 'vote') err = L.vote(G, p, m.v, now);
  else if (a === 'guess') err = L.guess(G, p, m.v, now);
  else if (a === 'chat') {
    if (now - (host.chatAt[sid] || 0) < 1200) return 'ちょっと待ってね（連続投稿）';
    host.chatAt[sid] = now; err = L.chat(G, p, m.v, now);
  } else return null;
  if (!err) { hostTick(); hostBroadcast(); }
  return err;
}
function viewFor(sid) {
  var R = host.room, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: JSON.parse(JSON.stringify(R.opts)), scores: R.scores, history: R.history,
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !R.G) return v;
  var G = R.G;
  v.g = L.view(G, seatIndex(G, sid), now);   // ← この人に見せてよい情報だけ（他人のお題は入らない）
  v.g.ultra = !!G.ultra; v.g.off = G.players.map(function (pl) { if (pl.kind !== 'human') return false; var s = seatBySid(pl.sid); return !!s && s.kind === 'remote' && !s.connected; });
  v.g.startIn = Math.max(0, G.at - now);
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() {
  var now = Date.now(); if (now - saveT < 1500 && host.room.phase === 'game') return; saveT = now;
  var R = host.room, copy = {}; Object.keys(R).forEach(function (k) { if (k !== 'G') copy[k] = R[k]; });   // ゲームの中身（お題・頭脳）は保存しない
  try { localStorage.setItem(LS_HOST, JSON.stringify({ room: copy, saved: now })); } catch (e) {}
}
