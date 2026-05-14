const pool = require('../config/db');

exports.verLogs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT sl.*, u.nombre, u.rol FROM session_logs sl JOIN users u ON sl.user_id = u.id ORDER BY sl.fecha DESC LIMIT 200'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
