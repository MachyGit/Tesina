// backend/controladores/qrController.js
const pool = require('../config/db');
const crypto = require('crypto');
const QRCode = require('qrcode');

exports.generarQR = async (req, res) => {
  const { curso_id } = req.body;
  const codigo = crypto.randomBytes(16).toString('hex');
  try {
    const [result] = await pool.query(
      'INSERT INTO qr_asistencia (codigo, curso_id, creado_por) VALUES (?, ?, ?)',
      [codigo, curso_id || null, req.user.id]
    );
    const base = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${base}/qr.html?codigo=${codigo}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300 });
    res.json({ id: result.insertId, codigo, url, qr: qrDataUrl });
  } catch (err) {
    console.error('Error generar QR:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.registrarPorQR = async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: 'Código requerido' });
  try {
    const [qr] = await pool.query('SELECT * FROM qr_asistencia WHERE codigo = ? AND activo = 1', [codigo]);
    if (!qr.length) return res.status(400).json({ error: 'QR inválido o inactivo' });

    // Validar restricción por curso/año si el QR está asociado a un curso
    if (qr[0].curso_id) {
      const [alumno] = await pool.query('SELECT curso_id FROM users WHERE id = ?', [req.user.id]);
      if (!alumno.length) return res.status(404).json({ error: 'Alumno no encontrado' });
      if (alumno[0].curso_id && alumno[0].curso_id !== qr[0].curso_id) {
        return res.status(403).json({ error: 'No podés registrar asistencia para este curso/año' });
      }
      // Si el alumno no tiene curso_id asignado, también se puede restringir o permitir según criterio
      // Aplicamos restricción estricta: debe pertenecer al mismo curso
      if (!alumno[0].curso_id) {
        return res.status(403).json({ error: 'Tu cuenta no tiene un curso asignado. Contactá a preceptoría.' });
      }
    }

    const [result] = await pool.query(
      'INSERT IGNORE INTO registro_qr (qr_id, alumno_id, ip) VALUES (?, ?, ?)',
      [qr[0].id, req.user.id, req.ip]
    );
    if (result.affectedRows === 0) {
      return res.json({ message: 'Ya registraste tu asistencia con este QR' });
    }
    res.json({ message: 'Asistencia registrada correctamente' });
  } catch (err) {
    console.error('Error registrar QR:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.listarRegistrosQR = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.fecha_hora, u.nombre, u.email
      FROM registro_qr r
      JOIN users u ON u.id = r.alumno_id
      ORDER BY r.fecha_hora DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
