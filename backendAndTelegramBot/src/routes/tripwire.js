const { logEvent, getLogs } = require('../services/sqllite_logger');

function handleTripwire(wss) {
  return (req, res) => {
    const location = req.query.location || 'Unknown Location';
    const sensor = req.query.sensor || 'Tripwire_01';

    try {
      const { triggerTripwireAlert } = require('../telegram/index');
      triggerTripwireAlert(location, sensor);

      logEvent({
        type: 'tripwire alert',
        sensor: sensor,
        location: location,
        message: 'Voltage Drop Detected (<= 1.0V)!',
        timestamp: new Date().toISOString()
      });

      const payloadLogs = JSON.stringify({
        type: 'historical_logs',
        logs: getLogs()
      });
      wss.clients.forEach((client) => {
        if (client.readyState === 1 && (!client.path || !client.path.startsWith('/camera'))) {
          client.send(payloadLogs);
        }
      });

      console.log(`[API] Tripwire triggered via API: ${sensor} at ${location}`);
      res.status(200).send(`Tripwire alert triggered for sensor: ${sensor} at location: ${location}`);
    } catch (err) {
      console.error('[API] Error triggering tripwire:', err);
      res.status(500).send('Internal Server Error');
    }
  };
}

module.exports = handleTripwire;
