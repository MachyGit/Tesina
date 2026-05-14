const pool = require('../config/db');

exports.registrarAsistencia = async (req, res) => {
  const { alumno_id, estado } = req.body;
  try {
    await pool.query(
      'INSERT INTO asistencia (alumno_id, fecha, estado, preceptor_id) VALUES (?, CURDATE(), ?, ?)',
      [alumno_id, estado, req.user.id]
    );
    res.json({ message: 'Asistencia registrada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verAsistencia = async (req, res) => {
  const { alumno_id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM asistencia WHERE alumno_id = ? ORDER BY fecha DESC',
      [alumno_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
