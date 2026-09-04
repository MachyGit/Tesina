// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ── Verificar JWT ──────────────────────────────────────────────────────────────
const verifyToken = async (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que el usuario siga activo en la DB
    const [rows] = await pool.query(
      'SELECT id, nombre, rol, activo FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ error: 'Cuenta desactivada o inexistente' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada. Ingresá nuevamente.' });
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// ── Verificar rol ──────────────────────────────────────────────────────────────
// Uso: checkRol('director', 'secretaria')
const checkRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({
      error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.`
    });
  }
  next();
};

// ── Verificar token interno del bot ───────────────────────────────────────────
// El bot manda el header: X-Bot-Secret: <BOT_SECRET del .env>
const verifyBotSecret = (req, res, next) => {
  const secret = req.headers['x-bot-secret'];
  if (!secret || secret !== process.env.BOT_SECRET) {
    return res.status(403).json({ error: 'Acceso de bot no autorizado' });
  }
  next();
};

module.exports = { verifyToken, checkRol, verifyBotSecret };
