const pool = require('../config/db');

exports.crearAviso = async (req, res) => {
  const { titulo, contenido, tipo, curso_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO avisos (titulo, contenido, tipo, autor_id, curso_id, fecha) VALUES (?, ?, ?, ?, ?, NOW())',
      [titulo, contenido, tipo, req.user.id, curso_id || null]
    );
    res.json({ message: 'Aviso publicado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listarAvisos = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT a.*, u.nombre as autor FROM avisos a JOIN users u ON a.autor_id = u.id ORDER BY a.fecha DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.eliminarAviso = async (req, res) => {
  try {
    await pool.query('DELETE FROM avisos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Aviso eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
