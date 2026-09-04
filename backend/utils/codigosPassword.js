// backend/utils/codigosPassword.js
// Helpers compartidos para códigos de acceso (primer ingreso) y enlaces de
// recuperación de contraseña. Los usan authController y userController.
const crypto = require('crypto');
const pool = require('../config/db');

// Código numérico de 6 dígitos: fácil de tipear, se usa en el primer ingreso
// (nuevo usuario) y en el reseteo manual hecho por un director/secretaria.
const generarCodigo = () => String(crypto.randomInt(100000, 999999));

// Token largo para el enlace de "olvidé mi contraseña". Se manda por mail en
// texto plano, pero en la base SIEMPRE se guarda hasheado (hashToken) para
// que un volcado de la DB no sirva para tomar cuentas.
const generarTokenLink = () => crypto.randomBytes(32).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Guarda un código/token pendiente para un usuario. Si ya tenía uno sin usar
// del mismo tipo, lo pisa (evita acumular códigos viejos y que quede
// ambigüedad sobre cuál es el vigente).
const guardarCodigo = async (userId, tokenGuardado, tipo, minutosVida, generadoPor = null) => {
  const expira = new Date(Date.now() + minutosVida * 60 * 1000);
  await pool.query(
    'DELETE FROM codigos_password WHERE user_id = ? AND tipo = ? AND usado = 0',
    [userId, tipo]
  );
  await pool.query(
    `INSERT INTO codigos_password (user_id, token, tipo, generado_por, expira_en)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, tokenGuardado, tipo, generadoPor, expira]
  );
};

// Busca un código válido (no usado, no vencido) por su valor guardado + tipo.
const buscarCodigoValido = async (tokenGuardado, tipo) => {
  const [rows] = await pool.query(
    `SELECT * FROM codigos_password
     WHERE token = ? AND tipo = ? AND usado = 0 AND expira_en > NOW()
     LIMIT 1`,
    [tokenGuardado, tipo]
  );
  return rows[0] || null;
};

const marcarUsado = async (id) => {
  await pool.query('UPDATE codigos_password SET usado = 1 WHERE id = ?', [id]);
};

module.exports = {
  generarCodigo,
  generarTokenLink,
  hashToken,
  guardarCodigo,
  buscarCodigoValido,
  marcarUsado,
};
