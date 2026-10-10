/* ずれっこ：🎤 音声入力（Web Speech API）。話した言葉を文字にして、チャット（またはヒント・答え）として出す
 * ・タップで開始／もう一度タップで送信（トグル）、長押しなら はなすと送信（プッシュ・トゥ・トーク）
 * ・途中の文字はリアルタイム表示。10秒しゃべらないと自動で止まる
 * ・チャットはそのまま送信（文字のチャットと同じ道を通るので、NPCも同じように読んで反応する）
 * ・ヒント／答えのときは 入力欄に入れて確認（直してから出せる）
 * ・対応していないブラウザでは ボタンをグレーにして、タップで案内を出す
 */
'use strict';
var MIC = (function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var btn = $('micBtn'), ind = $('micInd'), txt = $('micText'), how = $('micHow');
  var rec = null, on = false, finalT = '', interimT = '', silT = 0, capT = 0, downAt = 0, held = false, denied = false, startedAt = 0;
  var SILENCE = 10000, CAP = 45000, HOLD = 400;
  function supported() { return !!SR; }
  if (!SR) { btn.classList.add('na'); btn.setAttribute('aria-label', '音声入力（このブラウザは未対応）'); }
  function note() {
    toast(!SR ? '🎤 このブラウザは音声入力に未対応です（iPhoneはSafari、Android・PCはChromeで使えます）'
      : '🎤 マイクが使えません。iPhoneは「設定 → Safari → マイク」と「Siriと音声入力」をオンに。ほかはブラウザのマイク許可を確認してね');
  }
  function paint() {
    document.body.classList.toggle('mic-on', on);
    btn.classList.toggle('rec', on);
    ind.classList.toggle('show', on);
    var t = (finalT + interimT).trim();
    txt.textContent = t || '…どうぞ、話してね';
    txt.classList.toggle('empty', !t);
    how.textContent = held ? 'はなすと送信' : 'もう一度🎤で送信（10秒だまると自動で止まるよ）';
  }
  function resetSilence() { clearTimeout(silT); silT = setTimeout(function () { stop(); }, SILENCE); }
  function start() {
    if (!SR) { note(); return; }
    if (on) return;
    if (!lastView || lastView.phase !== 'game') return;
    try { unlockAudio(); } catch (e) {}
    finalT = ''; interimT = ''; held = false;
    try {
      rec = new SR();
      rec.lang = 'ja-JP'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    } catch (e) { note(); return; }
    var me = rec;
    rec.onresult = function (e) {
      if (rec !== me) return;
      var f = '', it = '';
      for (var i = 0; i < e.results.length; i++) { var r = e.results[i]; if (r.isFinal) f += r[0].transcript; else it += r[0].transcript; }
      finalT = f; interimT = it; resetSilence(); paint();
    };
    rec.onspeechstart = resetSilence;
    rec.onerror = function (e) {
      if (rec !== me) return;
      var c = e && e.error;
      if (c === 'not-allowed' || c === 'service-not-allowed') { denied = true; btn.classList.add('na'); note(); }
      else if (c === 'no-speech') toast('🎤 聞き取れませんでした。もう一度どうぞ');
      else if (c === 'audio-capture') toast('🎤 マイクが見つかりません');
      else if (c === 'network') toast('🎤 音声認識にはネット接続が必要です');
      else if (c && c !== 'aborted') toast('🎤 音声入力エラー（' + c + '）');
      if (c !== 'no-speech' && c !== 'aborted') { finalT = ''; interimT = ''; }
    };
    rec.onend = function () { if (rec !== me) return; finish(); };
    try { rec.start(); } catch (e) { rec = null; toast('🎤 音声入力を開始できませんでした'); return; }
    on = true; startedAt = Date.now(); denied = false; btn.classList.remove('na');
    try { BGM.want(null); } catch (e) {}   // 聞き取りやすいようにBGMを止める（終わったら戻す）
    resetSilence(); clearTimeout(capT); capT = setTimeout(stop, CAP);
    sfx.turn && sfx.turn(); paint();
  }
  function stop() { if (!on || !rec) return; clearTimeout(silT); clearTimeout(capT); try { rec.stop(); } catch (e) { finish(); } }
  function abort() { if (!rec) return; var r = rec; rec = null; on = false; clearTimeout(silT); clearTimeout(capT); try { r.abort(); } catch (e) {} paint(); restore(); }
  function restore() { if (lastView) { try { render(lastView); } catch (e) {} } }
  function finish() {
    var text = (finalT + interimT).replace(/\s+/g, ' ').trim();   // iOSは最後まで「確定」にならないことがあるので、途中の文字も使う
    rec = null; on = false; held = false; clearTimeout(silT); clearTimeout(capT); paint(); restore();
    if (text) commit(text);
  }
  function commit(text) {
    var v = lastView; if (!v || !v.g || v.phase !== 'game') return;
    var mode = ui.mode, inp = $('msgIn');
    if (mode === 'hint') {
      text = text.replace(/[。、．,.!！?？]+$/, '').replace(/^(えっと|えーと|うーん|あの)[、\s]*/, '').slice(0, 16);
      inp.value = text;
      confirmBox('このヒントで出しますか？', '「' + text + '」\n直したいときは「やめる」→ 入力欄で直して「出す」', '出す', function () { submitInput(); });
      $('cfNo').textContent = 'やめる（直す）';
    } else if (mode === 'guess') {
      inp.value = text.replace(/[。、!！?？]+$/, '').slice(0, 20); paintGuessList(v.g); submitInput();
    } else {
      inp.value = ''; if (act('chat', text.slice(0, 40))) toast('🎤 送信：' + text.slice(0, 20));
    }
  }
  // タップ＝トグル、長押し＝はなすと送信
  btn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (!SR || denied) { note(); return; }
    if (on) { stop(); downAt = 0; return; }
    downAt = Date.now(); start();
  });
  function up() { if (!downAt) return; var d = Date.now() - downAt; downAt = 0; if (on && d >= HOLD) { held = true; stop(); } }
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', function () { if (downAt && Date.now() - downAt >= HOLD) up(); });
  btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  btn.addEventListener('click', function (e) { e.preventDefault(); });
  // 長押し中は表示を「はなすと送信」に
  setInterval(function () { if (on && downAt && !held && Date.now() - downAt >= HOLD) { held = true; paint(); } if (on && !document.body.classList.contains('in-game')) abort(); }, 150);
  ind.addEventListener('click', function () { stop(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) abort(); });
  paint();
  return { supported: supported, start: start, stop: stop, abort: abort, isOn: function () { return on; } };
})();
