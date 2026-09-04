// backend/controladores/telegramController.js
const pool = require('../config/db');

// ── VINCULAR CUENTA vía token (llamado por el bot) ────────────────────────────
// El bot manda: { token: "123456", telegram_id: "7859819402" }
exports.vincularCuenta = async (req, res) => {
  const { token, telegram_id } = req.body;

  if (!token || !telegram_id) {
    return res.status(400).json({ error: 'token y telegram_id son requeridos' });
  }

  try {
    // Buscar token válido y no expirado
    const [rows] = await pool.query(`
      SELECT tt.user_id, tt.expira_en, tt.usado, u.nombre, u.rol
      FROM telegram_tokens tt
      JOIN users u ON tt.user_id = u.id
      WHERE tt.token = ?
    `, [String(token)]);

    if (!rows.length) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    const registro = rows[0];

    if (registro.usado) {
      return res.status(400).json({ error: 'Este código ya fue usado' });
    }
    if (new Date() > new Date(registro.expira_en)) {
      return res.status(400).json({ error: 'El código expiró. Generá uno nuevo desde el campus.' });
    }

    // Verificar que el telegram_id no esté ya usado por otro usuario
    const [yaUsado] = await pool.query(
      'SELECT id FROM users WHERE telegram_id = ? AND id != ?',
      [String(telegram_id), registro.user_id]
    );
    if (yaUsado.length) {
      return res.status(409).json({ error: 'Este Telegram ya está vinculado a otra cuenta' });
    }

    // Vincular
    await pool.query(
      'UPDATE users SET telegram_id = ? WHERE id = ?',
      [String(telegram_id), registro.user_id]
    );
    await pool.query(
      'UPDATE telegram_tokens SET usado = 1 WHERE token = ?',
      [String(token)]
    );

    res.json({
      message: '✅ Cuenta vinculada correctamente',
      nombre: registro.nombre,
      rol:    registro.rol
    });
  } catch (err) {
    console.error('Error al vincular cuenta:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── VERIFICAR SI UN TELEGRAM_ID ESTÁ VINCULADO ────────────────────────────────
exports.verificarTelegramId = async (req, res) => {
  const { telegram_id } = req.query;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id requerido' });

  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, rol, activo FROM users WHERE telegram_id = ?',
      [String(telegram_id)]
    );

    if (!rows.length) {
      return res.json({ vinculado: false });
    }

    const u = rows[0];
    if (!u.activo) {
      return res.json({ vinculado: false, error: 'Cuenta desactivada' });
    }

    res.json({ vinculado: true, nombre: u.nombre, rol: u.rol });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};


// ── LOGS ──────────────────────────────────────────────────────────────────────
exports.listarLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const [rows] = await pool.query(`
      SELECT sl.id, u.nombre, u.rol, sl.accion, sl.ip, sl.hora
      FROM session_logs sl
      JOIN users u ON sl.user_id = u.id
      ORDER BY sl.hora DESC
      LIMIT ?
    `, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
