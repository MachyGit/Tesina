const pool = require('../config/db');

const logAction = async (userId, accion) => {
  await pool.query(
    'INSERT INTO session_logs (user_id, accion, fecha) VALUES (?, ?, NOW())',
    [userId, accion]
  );
};

module.exports = { logAction };
