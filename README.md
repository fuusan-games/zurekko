# ずれっこ 〜ひとりだけ ちがうお題〜

ワードウルフ風のパーティーゲーム（ふらっとgames／制作 watg）。静的サイト＋PeerJS（P2P・ホストが正）。人間1〜6人＋NPC（ふーさん🐻・ミミ🐰・ニャコ😺・ポチ太🐶・ロボミ🤖・コンタ🦊）、合計3〜8人。

- 遊ぶ：`python3 -m http.server` で開く（招待URL・音声入力は https か localhost で）
- テスト：`node test/logic.test.js`（23件）／`node test/sim.js 1500`（NPCの強さ・バランス）／
  `node test/stun-server.js <ip> 3478 & node test/e2e.js <ip> <port>`（ヘッドレスE2E、音声入力はモック）
- NPCの学習：`node tools/train.js 40 400` → `weights.js` を書き出す（自己対戦＋人間っぽいプレイヤーとの対戦、CMA-ES風の進化戦略、お題ペアの21%はテスト用に学習から除外）
- NPCは「自分のお題」と「公開されたヒント・チャット」だけで推理します（他人のお題は見ない）。
