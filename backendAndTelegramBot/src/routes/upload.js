const fs = require('fs');
const path = require('path');
const { logEvent, getLogs } = require('../services/sqllite_logger');
const { notifyCaptureResult } = require('../telegram/index');

function handleUpload(wss) {
  return async (req, res) => {
    const sensor = req.query.sensor;
    const ip = req.query.ip;

    if (!req.body || !sensor || !ip) {
      return res.status(400).send('Missing body, sensor or ip');
    }

    const timestamp = Date.now();
    const filename = `motion_${ip.replace(/\./g, '_')}_${sensor}_${timestamp}.jpg`;
    const photosDir = path.join(__dirname, '../../../data/photos');
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true });
    }
    const filepath = path.join(photosDir, filename);
    const imageUrl = `/data/photos/${filename}`;

    try {
      if (sensor === 'capture') {
        fs.writeFileSync(filepath, req.body);

        const { getDevices } = require('../websocket');
        const devices = getDevices();
        const deviceId = `cam_${ip.replace(/\./g, '_')}`;
        const device = devices.get(deviceId);
        const location = device ? device.ip : ip;

        logEvent({
          type: 'telegram capture',
          sensor: sensor,
          location: location,
          deviceId: deviceId,
          imageUrl: imageUrl,
          timestamp: new Date().toISOString()
        });

        const payloadLogs = JSON.stringify({
          type: 'historical_logs',
          logs: getLogs()
        });
        wss.clients.forEach((client) => {
          if (client.readyState === 1 && !client.path.startsWith('/camera')) {
            client.send(payloadLogs);
          }
        });

        notifyCaptureResult(filename);
        return res.send('Uploaded (Capture)');
      }

      // Unknown sensor type — ignore
      res.send('Uploaded');
    } catch (err) {
      console.error('Error processing upload:', err);
      if (!res.headersSent) {
        res.status(500).send('Error processing upload');
      }
    }
  };
}

module.exports = handleUpload;
