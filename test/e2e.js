// E2E：ずれっこ — ①ひとり＋NPC（390×844、本物のタップで ヒント・チャット・投票）②375×667のレイアウト ③ホスト＋ゲストのオンライン（PeerJS＋ローカルSTUN）
// usage: node test/stun-server.js <box-ip> 3478 &  python3 -m http.server 8642 &  node test/e2e.js <box-ip> 8642
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8642;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__ww.view && JSON.parse(JSON.stringify(window.__ww.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__ww.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight); if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const ir = document.getElementById('inRow').getBoundingClientRect(), mi = document.getElementById('msgIn');
      const wide = []; document.querySelectorAll('.screen.active *').forEach(e => { const b = e.getBoundingClientRect(); if (vis(e) && b.right > innerWidth + 1 && getComputedStyle(e).pointerEvents !== 'none' && !e.closest('#players, #sugg, #quick, .seg')) wide.push(e.id || e.className); });
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, fab: !!fr, hits, inGame: document.body.classList.contains('in-game'), inBottom: ir.bottom, vh: innerHeight, font: parseFloat(getComputedStyle(mi).fontSize), wide: wide.slice(0, 5) };
    });
    if (r.hits.length) fail(`[${tag}] ひろばボタンが重なっている: ${r.hits.join(', ')}`);
    if (r.wide.length) fail(`[${tag}] 横にはみ出し: ${r.wide.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] ゲーム中にひろばボタンが出ている`);
      if (r.docScroll > 1) fail(`[${tag}] ゲーム画面がスクロールする ${r.docScroll}`);
      if (r.inBottom > r.vh + 0.5) fail(`[${tag}] 入力欄が画面外 ${r.inBottom}/${r.vh}`);
      if (r.font < 16) fail(`[${tag}] 入力欄の文字が16px未満（iOSでズームする）`);
    }
    return r;
  }
  // ---------- ① ひとり＋NPC ----------
  console.log('① ひとり＋NPC（390×844）');
  {
    const p = await phone('solo');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    const t = await layout(p, 'title'); if (t.fab) ok('タイトルに「🏠 ひろばへ」が出る (?from=portal)'); else fail('タイトルにひろばボタンがない');
    await p.screenshot({ path: SS + 'e2e_01_title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn');
    await waitV(p, 'v.phase === "lobby"');
    await p.tap('#npcGrid [data-ch="kon"]'); await p.tap('#lvSeg [data-v="smart"]'); await p.tap('#talkSeg [data-v="30"]');
    let v = await view(p); if (v.opts.npcs.indexOf('kon') >= 0 && v.opts.lv === 'smart' && v.opts.reverse === false) ok('ロビー：NPC追加（コンタ🦊）・かしこい・逆転なし(既定)'); else fail('lobby opts ' + JSON.stringify(v.opts));
    await layout(p, 'lobby'); await p.screenshot({ path: SS + 'e2e_02_lobby.png', fullPage: true });
    await p.tap('#startBtn');
    await waitV(p, 'v.phase === "game"');
    await p.tap('#skipBtn').catch(() => {});   // はじめる
    let typed = false, chipped = false, chatted = false, voted = false, shotH = false, shotT = false, shotV = false, guessed = false;
    for (let i = 0; i < 600; i++) {
      v = await view(p); if (!v || v.phase === 'end') break;
      const g = v.g;
      if (g.phase === 'hint' && g.cur === g.me && g.sugg) {
        await layout(p, 'hint');
        if (!typed) { await p.tap('#msgIn'); await p.fill('#msgIn', g.word); await p.tap('#sendBtn'); await sleep(150);
          const v2 = await view(p); if (v2.g.hints[g.me].length === g.hints[g.me].length) ok('お題そのもののヒントは出せない'); else fail('own word accepted');
          await p.fill('#msgIn', 'ふんわり'); if (!shotH) { shotH = true; await p.screenshot({ path: SS + 'e2e_03_myturn.png' }); } await p.tap('#sendBtn'); typed = true; }
        else { await p.tap('#sugg button'); chipped = true; }
        await sleep(200); continue;
      }
      if (g.phase === 'talk') {
        if (!chatted) { await p.fill('#msgIn', 'ロボミはどう思う？'); await p.tap('#sendBtn'); chatted = true; await sleep(1200); }
        if (!shotT) { shotT = true; await sleep(800); await layout(p, 'talk'); await p.screenshot({ path: SS + 'e2e_04_talk.png' }); }
        await p.tap('#skipBtn').catch(() => {}); await sleep(150); continue;
      }
      if (g.phase === 'vote' && g.myVote == null) {
        if (!shotV) { shotV = true; await p.screenshot({ path: SS + 'e2e_05_vote.png' }); }
        await p.tap('#voteGrid button'); await p.tap('#cfYes'); voted = true; await sleep(150); continue;
      }
      if (g.phase === 'guess' && g.caught === g.me) { await p.screenshot({ path: SS + 'e2e_05b_guess.png' }); await p.tap('#guessList button'); await p.tap('#cfYes'); guessed = true; continue; }
      await sleep(100);
    }
    typed && chipped ? ok('ヒント：手入力 と 候補チップ の両方を本物のタップで') : fail(`hints typed=${typed} chip=${chipped}`);
    v = await view(p);
    const robo = v.g.log.some(e => e.t === 'npc' && v.g.players[e.p].ch === 'robo');
    chatted && robo ? ok('チャット送信・ロボミ🤖が返事') : fail('chat/robo reply');
    voted ? ok('投票（確認ダイアログ付き）') : fail('no vote');
    if (guessed) ok('逆転チャンスの答え選び');
    await waitV(p, 'v.phase === "end"', 30000).then(() => ok('結果画面まで到達'), () => fail('no end'));
    await sleep(2600); await p.screenshot({ path: SS + 'e2e_06_end.png' });
    const pc = await p.textContent('#pairRow'); v = await view(p);
    if (pc.indexOf(v.g.result.maj) >= 0 && pc.indexOf(v.g.result.wolfW) >= 0) ok('結果：2つのお題・勝敗・心の声 を表示'); else fail('pairRow');
    const endFab = await p.isVisible('#hirobaFab'); if (endFab) ok('結果画面では ひろばボタンが戻る'); else fail('no fab on end');
    // 2戦目は自動で（逆転ありに切り替え）
    await p.tap('#toLobbyBtn'); await waitV(p, 'v.phase === "lobby"'); await p.tap('#revSeg [data-v="on"]'); await p.tap('#startBtn');
    await p.evaluate(() => { window.__ww.autoplay = true; });
    await waitV(p, 'v.phase === "end"', 60000).then(() => ok('2戦目（逆転あり・自動）も完走'), () => fail('game2'));
    await p.screenshot({ path: SS + 'e2e_07_end2.png' });
    await p.context().close();
  }
  // ---------- ② 375×667 とキーボード ----------
  console.log('② 375×667・キーボード');
  {
    const p = await phone('small', 375, 667);
    await p.goto(ROOT + '?turbo'); await p.fill('#nameIn', 'ちび'); await p.tap('#soloBtn'); await waitV(p, 'v.phase === "lobby"'); await layout(p, 'lobby375');
    await p.tap('#talkSeg [data-v="120"]'); await p.tap('#startBtn'); await waitV(p, 'v.phase === "game"');
    await p.evaluate(() => { window.__ww.autoplay = true; });
    await waitV(p, 'v.g.phase === "talk"', 30000); await p.evaluate(() => { window.__ww.autoplay = false; });
    await layout(p, 'talk375'); await p.screenshot({ path: SS + 'e2e_08_375.png' });
    // iOSのキーボードを再現：見える高さが 330px になったとき、入力欄がその中に収まる
    const kb = await p.evaluate(() => { document.documentElement.style.setProperty('--vvh', '330px'); document.body.classList.add('kb'); const r = document.getElementById('inRow').getBoundingClientRect(); return r.bottom; });
    kb <= 330.5 ? ok('キーボード表示時（見える高さ330px）も入力欄が見える位置 ' + Math.round(kb)) : fail('input hidden by keyboard ' + kb);
    await p.screenshot({ path: SS + 'e2e_09_keyboard.png' });
    await p.context().close();
  }

  // ---------- ④ 🎤 音声入力（SpeechRecognition をモックして流れを確認。本物の音声はヘッドレスでは試せない） ----------
  console.log('④ 🎤 音声入力（モック）');
  {
    const p = await phone('mic');
    await p.addInitScript(() => {
      class FakeSR { constructor() { window.__sr = this; this.lang = ''; }
        start() { window.__srLang = this.lang; if (window.__srDeny) { setTimeout(() => { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); }, 30); return; } setTimeout(() => this.onstart && this.onstart(), 10); }
        stop() { setTimeout(() => this.onend && this.onend(), 30); } abort() { this.stop(); } }
      window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
      window.__say = (t, fin) => { const r = [{ transcript: t }]; r.isFinal = !!fin; window.__sr.onresult({ results: [r], resultIndex: 0 }); };
    });
    await p.goto(ROOT + '?turbo'); await p.fill('#nameIn', 'こえ'); await p.tap('#soloBtn'); await waitV(p, 'v.phase === "lobby"');
    await p.tap('#npcGrid [data-ch="kon"]'); await p.tap('#talkSeg [data-v="120"]'); await p.tap('#startBtn'); await waitV(p, 'v.phase === "game"');
    // 話し合いまで：自分の番は候補チップ
    const toPhase = async (ph) => { for (let i = 0; i < 400; i++) { const v = await view(p); if (v.g.phase === ph) return v; if (v.g.phase === 'intro' || v.g.phase === 'talk') { await p.tap('#skipBtn').catch(() => {}); } if (v.g.phase === 'hint' && v.g.cur === v.g.me && v.g.sugg) await p.tap('#sugg button').catch(() => {}); await sleep(80); } };
    await p.tap('#skipBtn').catch(() => {});
    for (let i = 0; i < 400; i++) { const v = await view(p); if (v.g.phase === 'talk') break; if (v.g.phase === 'hint' && v.g.cur === v.g.me && v.g.sugg) await p.tap('#sugg button').catch(() => {}); await sleep(80); }
    const freeze = () => p.evaluate(() => { const G = window.__ww.hostRoom().G; if (G.phase === 'talk') G.at = Date.now() + 1e6; });   // turboでは話し合いが一瞬なので止めておく
    await freeze();
    // タップで開始 → 途中の文字が見える → もう一度タップで送信
    await p.tap('#micBtn');
    const st = await p.evaluate(() => ({ rec: document.getElementById('micBtn').classList.contains('rec'), ind: document.getElementById('micInd').classList.contains('show'), lang: window.__srLang }));
    st.rec && st.ind && st.lang === 'ja-JP' ? ok('🎤タップで聞き取り開始（ja-JP・赤いマイク表示）') : fail('mic start ' + JSON.stringify(st));
    await p.evaluate(() => window.__say('ロボミは どう', false)); await sleep(80);
    (await p.textContent('#micText')) === 'ロボミは どう' ? ok('話している途中の文字がリアルタイムに出る') : fail('interim not shown');
    await p.screenshot({ path: SS + 'e2e_13_mic_listening.png' });
    let v0 = await view(p); const lid0 = v0.g.lid;
    await p.evaluate(() => window.__say('ロボミはどう思う？', true)); await p.tap('#micBtn'); await sleep(700);
    let v = await view(p);
    const mine = v.g.log.find(e => e.id > lid0 && e.t === 'chat' && e.p === v.g.me);
    mine && mine.text === 'ロボミはどう思う？' ? ok('もう一度タップで、話した言葉がチャットとして送信') : fail('voice chat not posted');
    v.g.log.some(e => e.id > lid0 && e.t === 'npc' && v.g.players[e.p].ch === 'robo') ? ok('ロボミ🤖が音声チャットに返事（文字のチャットと同じ道）') : fail('robo no reply to voice');
    await p.screenshot({ path: SS + 'e2e_14_mic_sent.png' });
    // 長押し：はなすと送信
    await sleep(1300);
    const lid1 = (await view(p)).g.lid;
    await p.dispatchEvent('#micBtn', 'pointerdown'); await sleep(600);
    const holdTxt = await p.textContent('#micHow');
    await p.evaluate(() => window.__say('あやしい人がいる', true)); await p.dispatchEvent('#micBtn', 'pointerup'); await sleep(500);
    v = await view(p);
    /はなす/.test(holdTxt) && v.g.log.some(e => e.id > lid1 && e.t === 'chat' && e.text === 'あやしい人がいる') ? ok('長押し→はなすと送信（プッシュ・トゥ・トーク）') : fail('hold-to-talk ' + holdTxt);
    // 説明っぽい音声チャット → NPCの推理に入る（ヒントの半分の重み）
    await sleep(1300);
    const clue = await p.evaluate(() => { const w = window.__ww.view.g.word; const t = DB.words[w].terms.find(x => x.s >= 2); return 'なんか' + t.d + 'って感じ'; });
    const lid2 = (await view(p)).g.lid;
    // 10秒だまると自動で止まる（途中の文字のままでも送られる）
    await p.tap('#micBtn'); await p.evaluate(t => window.__say(t, false), clue);
    const t0 = Date.now(); await p.waitForFunction(() => !document.getElementById('micBtn').classList.contains('rec'), null, { timeout: 15000 }).catch(() => {});
    const el = (Date.now() - t0) / 1000; await sleep(600); v = await view(p);
    el > 8 && el < 13 && v.g.log.some(e => e.id > lid2 && e.t === 'chat' && e.text === clue) ? ok(`無音${el.toFixed(1)}秒で自動停止→途中の文字「${clue}」を送信`) : fail('silence auto-stop ' + el);
    v.g.log.some(e => e.id > lid2 && e.t === 'npc') ? ok('説明っぽい音声チャットにNPCが反応：' + v.g.log.filter(e => e.id > lid2 && e.t === 'npc').map(e => e.text).slice(0, 1).join('')) : console.log('  (NPCの反応なし：反応は確率的)');
    // 自分の番：ヒントは確認してから。直して出せる
    await p.tap('#skipBtn').catch(() => {});
    let gotHint = false;
    for (let i = 0; i < 300; i++) { const vv = await view(p); if (vv.g.phase === 'hint' && vv.g.cur === vv.g.me && vv.g.sugg) { gotHint = true; break; } if (vv.g.phase === 'talk') await p.tap('#skipBtn').catch(() => {}); if (vv.g.phase === 'vote' || vv.phase === 'end') break; await sleep(50); }
    if (gotHint) {
      const before = (await view(p)).g.hints[(await view(p)).g.me].length;
      await p.tap('#micBtn'); await p.evaluate(() => window.__say('えっと、ふんわり。', true)); await p.tap('#micBtn'); await sleep(200);
      const cf = await p.evaluate(() => ({ on: document.getElementById('confirmModal').classList.contains('active'), title: document.getElementById('cfTitle').textContent, val: document.getElementById('msgIn').value }));
      cf.on && /ヒント/.test(cf.title) && cf.val === 'ふんわり' ? ok('ヒントの番：音声は「えっと」「。」を除いて入力欄へ→確認ダイアログ') : fail('hint confirm ' + JSON.stringify(cf));
      await p.screenshot({ path: SS + 'e2e_15_mic_hint_confirm.png' });
      await p.tap('#cfNo'); await p.fill('#msgIn', 'ふんわり系'); await p.tap('#sendBtn'); await sleep(200);
      v = await view(p); const hs = v.g.hints[v.g.me];
      hs.length === before + 1 && hs[hs.length - 1] === 'ふんわり系' ? ok('「やめる（直す）」→入力欄で直して出せた') : fail('edited hint not submitted ' + JSON.stringify(hs));
    } else fail('did not reach my hint turn');
    // 許可されなかったとき
    await p.evaluate(() => { window.__srDeny = true; }); await p.tap('#micBtn'); await sleep(300);
    const dn = await p.evaluate(() => ({ t: document.getElementById('toast').textContent, na: document.getElementById('micBtn').classList.contains('na') }));
    /マイク/.test(dn.t) && dn.na ? ok('マイク拒否：案内を出してボタンをグレーに') : fail('deny ' + JSON.stringify(dn));
    await p.context().close();
    // 未対応ブラウザ
    const q = await phone('nomic');
    await q.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
    await q.goto(ROOT + '?turbo'); await q.fill('#nameIn', 'なし'); await q.tap('#soloBtn'); await waitV(q, 'v.phase === "lobby"'); await q.tap('#startBtn'); await waitV(q, 'v.phase === "game"');
    await q.tap('#micBtn'); await sleep(200);
    const nm = await q.evaluate(() => ({ na: document.getElementById('micBtn').classList.contains('na'), t: document.getElementById('toast').textContent }));
    nm.na && /未対応/.test(nm.t) ? ok('未対応ブラウザ：🎤はグレー、タップで案内') : fail('unsupported ' + JSON.stringify(nm));
    await layout(q, 'nomic'); await q.context().close();
  }
  // ---------- ③ オンライン ----------
  console.log('③ オンライン（ホスト＋ゲスト、NPC入り）');
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET); await host.fill('#nameIn', 'ホスト'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent) && !document.getElementById('connecting').classList.contains('active'), null, { timeout: 40000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    (await host.$('#qr svg')) ? ok('部屋コード ' + code + '・QRコード') : fail('no QR');
    await host.screenshot({ path: SS + 'e2e_10_host_lobby.png', fullPage: true });
    await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
    let joined = true; await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('ゲストが招待URLで参加（WebRTC）'), () => { joined = false; fail('guest could not join'); });
    if (joined) {
      await host.tap('#npcGrid [data-ch="mimi"]'); await host.tap('#talkSeg [data-v="30"]');
      await waitV(guest, 'v.opts.npcs.length === 3'); ok('ゲストのロビーにNPC設定が反映');
      await host.tap('#startBtn');
      await waitV(guest, 'v.phase === "game"', 15000);
      const G = await host.evaluate(() => { const G = window.__ww.hostRoom().G; return { words: G.words, players: G.players.map(p => p.name) }; });
      const gi = G.players.indexOf('たろう'), gw = G.words[gi], other = G.words.find(w => w !== gw);
      let leaks = 0, seen = 0;
      await guest.evaluate(() => { window.__ww.autoplay = true; }); await host.evaluate(() => { window.__ww.autoplay = true; });
      for (let i = 0; i < 400; i++) { const gv = await view(guest); if (!gv || gv.phase === 'end') break; seen++; if (gv.g.word !== gw) leaks++; const j = JSON.stringify(gv); if (j.indexOf(other) >= 0 && !(gv.g.phase === 'guess' && gv.g.caught === gv.g.me)) leaks++; if (i === 8) await guest.screenshot({ path: SS + 'e2e_11_guest_game.png' }); await sleep(60); }
      leaks === 0 && seen > 5 ? ok(`ゲストに届く画面データに 他人のお題が入っていない（${seen}回チェック・自分のお題「${gw}」だけ）`) : fail('secret leak ' + leaks);
      await waitV(guest, 'v.phase === "end"', 60000).then(() => ok('ゲスト側も結果画面まで到達'), () => fail('guest no end'));
      await sleep(2500); await guest.screenshot({ path: SS + 'e2e_12_guest_end.png' });
      // 入り直し：ロビーに戻って、ゲストがリロード→「部屋に戻る」
      await host.evaluate(() => { window.__ww.autoplay = false; }); await host.tap('#toLobbyBtn');
      await waitV(guest, 'v.phase === "lobby"'); await guest.reload(); await sleep(500);
      if (await guest.isVisible('#rejoinBtn')) { await guest.tap('#rejoinBtn'); await waitV(guest, 'v.phase === "lobby" && v.seats.length === 2', 40000).then(() => ok('リロード後「部屋に戻る」で同じ席に復帰'), () => fail('rejoin failed')); }
      else fail('no rejoin button');
    }
    await host.context().close(); await guest.context().close();
  }
  await browser.close();
  console.log(errors.length ? `\n${errors.length} problem(s)` : '\nALL OK');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
