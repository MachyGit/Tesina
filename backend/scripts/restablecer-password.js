// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/scripts/restablecer-password.js
// Restablece (o verifica) la contraseña de UNA cuenta sin tocar ningún otro dato.
// Guarda la clave con bcrypt, igual que el login, y deja la cuenta lista para ingresar
// (activo = 1, pendiente = 0, debe_cambiar_password = 0).
//
// Uso (desde la carpeta raíz del proyecto, donde está el .env):
//   node backend/scripts/restablecer-password.js                       -> director por defecto, clave generada
//   node backend/scripts/restablecer-password.js correo@x.com          -> clave generada al azar
//   node backend/scripts/restablecer-password.js correo@x.com MiClave123
//   node backend/scripts/restablecer-password.js --verificar correo@x.com MiClave123   (solo comprueba, no cambia nada)
//
// También funciona si lo corrés desde la carpeta backend: `node scripts/restablecer-password.js`.
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const EMAIL_DIRECTOR = 'lenunez@escuelasproa.edu.ar';

(async () => {
  const args = process.argv.slice(2);
  const soloVerificar = args[0] === '--verificar';
  if (soloVerificar) args.shift();

  const email = String(args[0] || EMAIL_DIRECTOR).toLowerCase().trim();
  let clave = args[1];
  const generada = !clave && !soloVerificar;
  if (generada) clave = crypto.randomBytes(6).toString('base64url') + '9a'; // ej. "Xk3fQz1a9a"

  try {
    const [rows] = await pool.query(
      'SELECT id, rol, activo, pendiente, debe_cambiar_password, password FROM users WHERE email = ?', [email]
    );
    if (!rows.length) {
      console.error(`❌ No existe ninguna cuenta con el email ${email}`);
      process.exitCode = 1; return;
    }
    const u = rows[0];

    if (soloVerificar) {
      const coincide = await bcrypt.compare(String(clave || ''), u.password);
      console.log(`Cuenta: ${email} (rol: ${u.rol}, activo: ${u.activo}, pendiente: ${u.pendiente}, debe_cambiar_password: ${u.debe_cambiar_password})`);
      console.log(coincide ? '✅ La contraseña COINCIDE con la guardada.' : '❌ La contraseña NO coincide con la guardada.');
      process.exitCode = coincide ? 0 : 1; return;
    }

    if (String(clave).length < 8) {
      console.error('❌ La contraseña debe tener al menos 8 caracteres.');
      process.exitCode = 1; return;
    }

    const hash = await bcrypt.hash(String(clave), 10);
    await pool.query(
      'UPDATE users SET password = ?, activo = 1, pendiente = 0, debe_cambiar_password = 0 WHERE id = ?',
      [hash, u.id]
    );
    // Comprobación inmediata contra lo que quedó guardado
    const [[chk]] = await pool.query('SELECT password FROM users WHERE id = ?', [u.id]);
    const ok = await bcrypt.compare(String(clave), chk.password);
    if (!ok) { console.error('❌ Algo falló: la contraseña guardada no coincide.'); process.exitCode = 1; return; }

    console.log(`✅ Contraseña restablecida para ${email} (rol: ${u.rol}).`);
    if (generada) console.log(`   Contraseña nueva: ${clave}`);
    console.log('   Ya podés iniciar sesión. Cambiala desde tu perfil después de entrar.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
})();
