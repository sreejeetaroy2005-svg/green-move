const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'greenmove_hackathon_super_secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // expect "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, JWT_SECRET };
