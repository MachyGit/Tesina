const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logAction } = require('../middleware/sessionLogger');

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });
    await pool.query('INSERT INTO session_logs (user_id, hora_ingreso) VALUES (?, NOW())', [user.id]);
    await logAction(user.id, 'LOGIN');
    const token = jwt.sign({ id: user.id, rol: user.rol, nombre: user.nombre }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, nombre: user.nombre, rol: user.rol } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    await pool.query(
      'UPDATE session_logs SET hora_egreso = NOW() WHERE user_id = ? AND hora_egreso IS NULL ORDER BY hora_ingreso DESC LIMIT 1',
      [req.user.id]
    );
    await logAction(req.user.id, 'LOGOUT');
    res.json({ message: 'Sesión cerrada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
