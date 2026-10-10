// Minimal STUN (RFC 5389) Binding responder for local testing only.
// The box blocks outbound UDP (no public STUN) and Chrome is policy-restricted to
// "default_public_interface_only", so tests point Chrome at this responder to obtain
// server-reflexive candidates on the box's interface. Signaling still uses the real PeerJS cloud.
const dgram = require('dgram');
const host = process.argv[2] || '0.0.0.0', port = +(process.argv[3] || 3478);
const sock = dgram.createSocket('udp4');
sock.on('message', (msg, rinfo) => {
  if (msg.length < 20 || msg.readUInt16BE(0) !== 0x0001 || msg.readUInt32BE(4) !== 0x2112A442) return;
  const tid = msg.slice(8, 20);
  const attr = Buffer.alloc(12);
  attr.writeUInt16BE(0x0020, 0); attr.writeUInt16BE(8, 2); attr.writeUInt8(0, 4); attr.writeUInt8(1, 5);
  attr.writeUInt16BE(rinfo.port ^ 0x2112, 6);
  const ip = rinfo.address.split('.').map(Number);
  const magic = [0x21, 0x12, 0xA4, 0x42];
  for (let i = 0; i < 4; i++) attr.writeUInt8(ip[i] ^ magic[i], 8 + i);
  const head = Buffer.alloc(20);
  head.writeUInt16BE(0x0101, 0); head.writeUInt16BE(attr.length, 2); head.writeUInt32BE(0x2112A442, 4); tid.copy(head, 8);
  sock.send(Buffer.concat([head, attr]), rinfo.port, rinfo.address);
});
sock.bind(port, host, () => console.log('STUN listening on', host + ':' + port));
