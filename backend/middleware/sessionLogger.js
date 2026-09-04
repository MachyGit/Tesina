// backend/middleware/sessionLogger.js
const pool = require('../config/db');

// Registrar una acción en la tabla session_logs
const logAction = async (userId, accion, ip = null, userAgent = null) => {
  try {
    await pool.query(
      'INSERT INTO session_logs (user_id, accion, ip, user_agent) VALUES (?, ?, ?, ?)',
      [userId, accion, ip, userAgent]
    );
  } catch {
    // No cortar el flujo si falla el log
  }
};

module.exports = { logAction };
