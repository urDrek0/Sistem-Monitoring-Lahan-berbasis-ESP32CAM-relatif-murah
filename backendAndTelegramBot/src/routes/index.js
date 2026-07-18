const express = require('express');
const handleTripwire = require('./tripwire');
const handleUpload = require('./upload');

const { loginHandler, logoutHandler, authenticateHttp, isLocalIP } = require('../middleware/auth');

function createRouter(wss) {
  const router = express.Router();
  
  // Use express.json() for login route body parsing
  router.use(express.json());

  router.post('/api/login', loginHandler);
  router.post('/api/logout', logoutHandler);
  
  router.get('/api/verify', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (isLocalIP(clientIp)) {
      return res.json({ success: true, local: true, authenticated: true });
    }
    
    // Test the cookie if not local
    authenticateHttp(req, res, () => {
      res.json({ success: true, local: false, authenticated: true, user: req.user });
    });
  });

  router.get('/', (req, res) => {
    res.send('hello world');
  });

  // Example of how to protect an endpoint: router.get('/action', authenticateHttp, handleAction);
  // We'll leave action and upload unprotected for now unless needed, 
  // because ESP32 might call them directly without Kiosk cookies.
  router.get('/api/tripwire', handleTripwire(wss));
  router.post('/upload', express.raw({ limit: '10mb', type: 'image/jpeg' }), handleUpload(wss));

  return router;
}

module.exports = createRouter;
