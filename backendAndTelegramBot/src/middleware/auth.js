const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-kiosk-key-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// Check if an IP belongs to a private/local network
function isLocalIP(ip) {
  if (!ip) return false;
  const cleanIp = ip.replace('::ffff:', '');
  
  // Localhost
  if (cleanIp === '127.0.0.1' || cleanIp === '::1') return true;
  
  // 10.0.0.0 - 10.255.255.255
  if (cleanIp.startsWith('10.')) return true;
  
  // 172.16.0.0 - 172.31.255.255
  if (cleanIp.startsWith('172.')) {
    const secondOctet = parseInt(cleanIp.split('.')[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  
  // 192.168.0.0 - 192.168.255.255
  if (cleanIp.startsWith('192.168.')) return true;
  
  return false;
}

// Handler for POST /api/login
function loginHandler(req, res) {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    
    // Set HttpOnly cookie
    res.cookie('kiosk_token', token, {
      httpOnly: true,
      secure: false, // Set to true if using HTTPS
      sameSite: 'lax',
      maxAge: 1 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    return res.json({ success: true, message: 'Logged in successfully' });
  }
  return res.status(401).json({ success: false, message: 'Invalid password' });
}

// Handler for POST /api/logout
function logoutHandler(req, res) {
  res.clearCookie('kiosk_token');
  return res.json({ success: true });
}

// Middleware for protecting HTTP routes
function authenticateHttp(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Bypass for local IPs
  if (isLocalIP(clientIp)) {
    req.isLocal = true;
    req.user = { username: 'local_admin' };
    return next();
  }
  
  const token = req.cookies && req.cookies.kiosk_token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.isLocal = false;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// Function to authenticate WebSocket upgrades
function authenticateWs(req, cb) {
  // Extract real IP from Nginx headers, fallback to socket address
  let clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress;
  if (clientIp && clientIp.includes(',')) {
    clientIp = clientIp.split(',')[0].trim();
  }
  
  // Bypass for local IPs
  if (isLocalIP(clientIp)) {
    return cb(null, { username: 'local_admin' });
  }
  
  // Parse cookies from headers
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return cb(new Error('Unauthorized'));
  }
  
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    cookies[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  
  const token = cookies['kiosk_token'];
  if (!token) {
    return cb(new Error('Unauthorized'));
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return cb(null, decoded);
  } catch (err) {
    return cb(new Error('Unauthorized'));
  }
}

module.exports = {
  isLocalIP,
  loginHandler,
  logoutHandler,
  authenticateHttp,
  authenticateWs,
  JWT_SECRET
};
