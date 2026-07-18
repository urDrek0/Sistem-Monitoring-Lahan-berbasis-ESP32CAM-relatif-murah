const dgram = require('dgram');
const { udpFrameAssemblies, processChunkedMessage } = require('./frameReassembler');
const { handleIncomingCameraFrame } = require('./aiWorker');

const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
  const remoteIp = rinfo.address.replace('::ffff:', '');
  const deviceId = `cam_${remoteIp.replace(/\./g, '_')}`;
  processChunkedMessage(deviceId, remoteIp, msg, udpFrameAssemblies, handleIncomingCameraFrame);
});

udpServer.on('error', (err) => {
  console.error(`[UDP Server] Error:\n${err.stack}`);
});

udpServer.bind(3001, () => {
  console.log('[UDP Server] Listening for binary livestream on port 3001');
});

module.exports = udpServer;
