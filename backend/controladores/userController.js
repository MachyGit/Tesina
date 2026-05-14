const pool = require('../config/db');
const bcrypt = require('bcryptjs');

exports.crearUsuario = async (req, res) => {
  const { nombre, email, password, rol, curso_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (nombre, email, password, rol, curso_id, creado_por) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, email, hash, rol, curso_id || null, req.user.id]
    );
    res.json({ message: 'Usuario creado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listarUsuarios = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, email, rol, curso_id, fecha_creacion FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.asignarRol = async (req, res) => {
  const { userId, nuevoRol } = req.body;
  try {
    await pool.query('UPDATE users SET rol = ? WHERE id = ?', [nuevoRol, userId]);
    res.json({ message: 'Rol actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
