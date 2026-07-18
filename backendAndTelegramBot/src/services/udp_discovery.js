const dgram = require('dgram');

function initUdpDiscovery(port = 3005) {
  const server = dgram.createSocket('udp4');

  server.on('error', (err) => {
    console.error(`[UDP Discovery] Server error:\n${err.stack}`);
    server.close();
  });

  server.on('message', (msg, rinfo) => {
    const message = msg.toString().trim();
    if (message === 'discovery_ping') {
      console.log(`[UDP Discovery] Received ping from ${rinfo.address}:${rinfo.port}`);
      
      const reply = Buffer.from('discovery_ack');
      server.send(reply, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error(`[UDP Discovery] Error sending reply to ${rinfo.address}:`, err);
        } else {
          console.log(`[UDP Discovery] Sent ack back to ${rinfo.address}:${rinfo.port}`);
        }
      });
    }
  });

  server.on('listening', () => {
    const address = server.address();
    console.log(`[UDP Discovery] Server listening on UDP ${address.address}:${address.port}`);
  });

  server.bind(port, '0.0.0.0');
}

module.exports = { initUdpDiscovery };
