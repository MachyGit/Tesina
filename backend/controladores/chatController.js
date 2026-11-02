// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/controladores/chatController.js
const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

// Roles permitidos para usar el chat
const ROLES_CHAT = ['director', 'secretaria', 'preceptor', 'profesor'];

// Carpeta donde se guardan los archivos en el servidor
const UPLOADS_DIR = path.join(__dirname, '../../uploads/chat');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Extensiones permitidas (sin ejecutables)
const EXTENSIONES_PERMITIDAS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.zip', '.rar', '.mp4', '.mp3'
];

// ── Helper: verificar que el usuario tenga acceso al chat ─────────────────────
const _checkChatAccess = (user, res) => {
  if (!ROLES_CHAT.includes(user.rol)) {
    res.status(403).json({ error: 'Solo el personal puede acceder al chat' });
    return false;
  }
  return true;
};

// ── Helper: valida que el destinatario exista, esté activo y sea del personal ──
// Devuelve true si es válido; si no, ya respondió con el error.
const _validarDestinatario = async (req, res, destinatarioId) => {
  if (isNaN(destinatarioId)) { res.status(400).json({ error: 'userId inválido' }); return false; }
  if (destinatarioId === req.user.id) { res.status(400).json({ error: 'No podés escribirte a vos mismo' }); return false; }
  const [dest] = await pool.query('SELECT id, rol FROM users WHERE id = ? AND activo = 1', [destinatarioId]);
  if (!dest.length) { res.status(404).json({ error: 'Destinatario no encontrado' }); return false; }
  if (!ROLES_CHAT.includes(dest[0].rol)) {
    res.status(403).json({ error: 'Solo podés enviar mensajes a personal de la escuela' });
    return false;
  }
  return true;
};

// ── LISTAR CONTACTOS DISPONIBLES ──────────────────────────────────────────────
// Devuelve todos los usuarios staff + cantidad de mensajes no leídos
exports.listarContactos = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  try {
    const [contactos] = await pool.query(`
      SELECT u.id, u.nombre, u.rol, u.foto,
        (
          SELECT COUNT(*) FROM mensajes m
          WHERE m.remitente_id = u.id
            AND m.destinatario_id = ?
            AND m.leido = 0
            AND m.oculto_destinatario = 0
        ) AS no_leidos
      FROM users u
      WHERE u.rol IN ('director','secretaria','preceptor','profesor')
        AND u.id != ?
        AND u.activo = 1
      ORDER BY no_leidos DESC, u.nombre
    `, [req.user.id, req.user.id]);

    res.json(contactos);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── OBTENER CONVERSACIÓN CON UN USUARIO ───────────────────────────────────────
exports.obtenerConversacion = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  const otroId = parseInt(req.params.userId);
  if (isNaN(otroId)) return res.status(400).json({ error: 'userId inválido' });

  try {
    // Marcar como leídos los mensajes que me manda el otro
    await pool.query(
      'UPDATE mensajes SET leido = 1 WHERE remitente_id = ? AND destinatario_id = ?',
      [otroId, req.user.id]
    );

    const limite = Math.min(parseInt(req.query.limit) || 50, 100);

    const [mensajes] = await pool.query(`
      SELECT m.id, m.remitente_id, m.destinatario_id,
             m.contenido, m.leido, m.enviado_en,
             u.nombre AS remitente_nombre,
             GROUP_CONCAT(
               JSON_OBJECT(
                 'id', a.id,
                 'nombre', a.nombre_original,
                 'archivo', a.nombre_archivo,
                 'mime', a.tipo_mime,
                 'tamanio', a.tamanio
               )
             ) AS archivos_json
      FROM mensajes m
      JOIN users u ON m.remitente_id = u.id
      LEFT JOIN archivos_chat a ON a.mensaje_id = m.id
      WHERE ((m.remitente_id = ? AND m.destinatario_id = ? AND m.oculto_remitente = 0)
         OR (m.remitente_id = ? AND m.destinatario_id = ? AND m.oculto_destinatario = 0))
      GROUP BY m.id
      ORDER BY m.enviado_en DESC
      LIMIT ?
    `, [req.user.id, otroId, otroId, req.user.id, limite]);

    // Parsear archivos_json (GROUP_CONCAT devuelve string)
    const resultado = mensajes.reverse().map(m => ({
      ...m,
      archivos: m.archivos_json
        ? JSON.parse(`[${m.archivos_json}]`).filter(a => a.id !== null)
        : []
    }));

    res.json(resultado);
  } catch (err) {
    console.error('Error en obtenerConversacion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── ENVIAR MENSAJE (texto) ────────────────────────────────────────────────────
// Los archivos se suben primero con /chat/archivo y luego se referencian
exports.enviarMensaje = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  const destinatarioId = parseInt(req.params.userId);
  const contenido = String(req.body.contenido || '').trim();

  if (!contenido) return res.status(400).json({ error: 'El mensaje está vacío' });
  if (contenido.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máx. 2000 caracteres)' });

  try {
    if (!(await _validarDestinatario(req, res, destinatarioId))) return;

    // Si el mensaje se mandó sin conexión y se reintenta, no se duplica.
    const clientId = /^[A-Za-z0-9_-]{8,40}$/.test(String(req.body.client_id || '')) ? String(req.body.client_id) : null;
    if (clientId) {
      const [ya] = await pool.query('SELECT id FROM mensajes WHERE remitente_id = ? AND client_id = ?', [req.user.id, clientId]);
      if (ya.length) return res.status(200).json({ message: 'Mensaje ya enviado', id: ya[0].id, duplicado: true });
    }

    const [result] = await pool.query(
      'INSERT INTO mensajes (remitente_id, destinatario_id, contenido, client_id) VALUES (?, ?, ?, ?)',
      [req.user.id, destinatarioId, contenido || null, clientId]
    );

    // Notificar vía WebSocket al destinatario si está conectado
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${destinatarioId}`).emit('nuevo_mensaje', {
        id:              result.insertId,
        remitente_id:    req.user.id,
        remitente_nombre: req.user.nombre,
        destinatario_id: destinatarioId,
        contenido:       contenido || null,
        enviado_en:      new Date().toISOString(),
        archivos:        [],
        leido:           false,
      });
    }

    res.status(201).json({ message: 'Mensaje enviado', id: result.insertId });
  } catch (err) {
    console.error('Error en enviarMensaje:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── BORRAR MENSAJES (como WhatsApp: "para mí" o "para todos") ──────────────────
//  · para mí:    el mensaje se oculta solo en la cuenta de quien lo pide (puede ser uno recibido).
//                Si los dos lo ocultaron, se elimina de verdad.
//  · para todos: solo el autor; se borra para los dos y se avisa en vivo.
const _quitarArchivos = async (ids) => {
  if (!ids.length) return;
  const [archs] = await pool.query('SELECT nombre_archivo FROM archivos_chat WHERE mensaje_id IN (?)', [ids]);
  await pool.query('DELETE FROM mensajes WHERE id IN (?)', [ids]); // archivos_chat se borra en cascada
  archs.forEach((a) => fs.promises.unlink(path.join(UPLOADS_DIR, path.basename(a.nombre_archivo))).catch(() => {}));
};

const _borrarParaTodos = async (req, ids) => {
  if (!ids.length) return 0;
  const [rows] = await pool.query(
    'SELECT id, destinatario_id FROM mensajes WHERE remitente_id = ? AND id IN (?)', [req.user.id, ids]);
  if (!rows.length) return 0;
  await _quitarArchivos(rows.map((r) => r.id));
  const io = req.app.get('io');
  if (io) rows.forEach((r) => io.to(`user_${r.destinatario_id}`).emit('mensaje_borrado', { id: r.id, remitente_id: req.user.id }));
  return rows.length;
};

const _borrarParaMi = async (req, ids) => {
  if (!ids.length) return 0;
  const me = req.user.id;
  const [rows] = await pool.query(
    'SELECT id FROM mensajes WHERE id IN (?) AND (remitente_id = ? OR destinatario_id = ?)', [ids, me, me]);
  if (!rows.length) return 0;
  const propios = rows.map((r) => r.id);
  await pool.query('UPDATE mensajes SET oculto_remitente = 1 WHERE remitente_id = ? AND id IN (?)', [me, propios]);
  await pool.query('UPDATE mensajes SET oculto_destinatario = 1 WHERE destinatario_id = ? AND id IN (?)', [me, propios]);
  const [listos] = await pool.query('SELECT id FROM mensajes WHERE id IN (?) AND oculto_remitente = 1 AND oculto_destinatario = 1', [propios]);
  await _quitarArchivos(listos.map((r) => r.id));
  return rows.length;
};

const _modo = (req) => (String(req.query.modo || req.body.modo || 'todos') === 'mi' ? 'mi' : 'todos');
const _ejecutar = (req, ids) => (_modo(req) === 'mi' ? _borrarParaMi(req, ids) : _borrarParaTodos(req, ids));

// DELETE /mensaje/:id?modo=mi|todos
exports.eliminarMensaje = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const [rows] = await pool.query('SELECT remitente_id, destinatario_id FROM mensajes WHERE id = ?', [id]);
    if (!rows.length || (rows[0].remitente_id !== req.user.id && rows[0].destinatario_id !== req.user.id)) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }
    if (_modo(req) === 'todos' && rows[0].remitente_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo podés borrar para todos tus propios mensajes' });
    }
    await _ejecutar(req, [id]);
    res.json({ message: _modo(req) === 'mi' ? 'Mensaje borrado para vos' : 'Mensaje eliminado para todos' });
  } catch (err) {
    console.error('Error en eliminarMensaje:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// POST /borrar-varios { ids, modo }
exports.eliminarVarios = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return res.status(400).json({ error: 'Elegí al menos un mensaje' });
  if (ids.length > 500) return res.status(400).json({ error: 'Demasiados mensajes a la vez (máx. 500)' });
  try {
    if (_modo(req) === 'todos') {
      const [ajenos] = await pool.query('SELECT id FROM mensajes WHERE id IN (?) AND remitente_id <> ?', [ids, req.user.id]);
      if (ajenos.length) return res.status(403).json({ error: 'Para borrar "para todos" solo podés elegir tus propios mensajes' });
    }
    const borrados = await _ejecutar(req, ids);
    res.json({ message: `${borrados} mensaje/s eliminado/s`, borrados });
  } catch (err) {
    console.error('Error en eliminarVarios:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// DELETE /conversacion/:userId?modo=mi|todos
//  mi → oculta TODA la conversación para mí · todos → borra para todos lo que yo envié
exports.vaciarConversacion = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;
  const otroId = parseInt(req.params.userId);
  if (isNaN(otroId)) return res.status(400).json({ error: 'userId inválido' });
  try {
    const me = req.user.id;
    const [rows] = _modo(req) === 'mi'
      ? await pool.query('SELECT id FROM mensajes WHERE (remitente_id = ? AND destinatario_id = ?) OR (remitente_id = ? AND destinatario_id = ?)', [me, otroId, otroId, me])
      : await pool.query('SELECT id FROM mensajes WHERE remitente_id = ? AND destinatario_id = ?', [me, otroId]);
    const borrados = await _ejecutar(req, rows.map((r) => r.id));
    res.json({ message: `${borrados} mensaje/s eliminado/s`, borrados });
  } catch (err) {
    console.error('Error en vaciarConversacion:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── SUBIR ARCHIVO Y ENVIARLO COMO MENSAJE ─────────────────────────────────────
// El archivo viene en base64: { nombre, mime, datos_base64, destinatario_id }
exports.subirArchivo = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  const destinatarioId = parseInt(req.params.userId);
  const { nombre_original, mime, datos_base64 } = req.body;
  const contenido = String(req.body.contenido || '').trim().slice(0, 2000);

  if (!nombre_original || !datos_base64) {
    return res.status(400).json({ error: 'nombre_original y datos_base64 son requeridos' });
  }

  // Validar extensión
  const ext = path.extname(nombre_original).toLowerCase();
  if (!EXTENSIONES_PERMITIDAS.includes(ext)) {
    return res.status(400).json({ error: `Extensión no permitida: ${ext}` });
  }

  // Validar tamaño (~10MB en base64)
  if (datos_base64.length > 14_000_000) {
    return res.status(400).json({ error: 'El archivo supera los 10MB permitidos' });
  }

  try {
    if (!(await _validarDestinatario(req, res, destinatarioId))) return;

    // Decodificar base64 y guardar en disco
    const nombreArchivo = `${crypto.randomUUID()}${ext}`;
    const rutaCompleta  = path.join(UPLOADS_DIR, nombreArchivo);
    const buffer = Buffer.from(datos_base64, 'base64');
    fs.writeFileSync(rutaCompleta, buffer);

    // Crear mensaje
    const [msgResult] = await pool.query(
      'INSERT INTO mensajes (remitente_id, destinatario_id, contenido) VALUES (?, ?, ?)',
      [req.user.id, destinatarioId, contenido || null]
    );
    const mensajeId = msgResult.insertId;

    // Registrar archivo
    const [archResult] = await pool.query(
      'INSERT INTO archivos_chat (mensaje_id, nombre_original, nombre_archivo, tipo_mime, tamanio) VALUES (?, ?, ?, ?, ?)',
      [mensajeId, nombre_original, nombreArchivo, mime || 'application/octet-stream', buffer.length]
    );

    const archivoData = {
      id:             archResult.insertId,
      nombre:         nombre_original,
      archivo:        nombreArchivo,
      mime:           mime,
      tamanio:        buffer.length,
    };

    // Notificar por WebSocket
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${destinatarioId}`).emit('nuevo_mensaje', {
        id:               mensajeId,
        remitente_id:     req.user.id,
        remitente_nombre: req.user.nombre,
        destinatario_id:  destinatarioId,
        contenido:        contenido || null,
        enviado_en:       new Date().toISOString(),
        archivos:         [archivoData],
        leido:            false,
      });
    }

    res.status(201).json({ message: 'Archivo enviado', id: mensajeId, archivo: archivoData });
  } catch (err) {
    console.error('Error en subirArchivo:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── DESCARGAR ARCHIVO ─────────────────────────────────────────────────────────
exports.descargarArchivo = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  const { nombreArchivo } = req.params;

  try {
    // Verificar que el archivo le pertenece al usuario (remitente o destinatario)
    const [rows] = await pool.query(`
      SELECT a.nombre_original, a.nombre_archivo, a.tipo_mime,
             m.remitente_id, m.destinatario_id
      FROM archivos_chat a
      JOIN mensajes m ON a.mensaje_id = m.id
      WHERE a.nombre_archivo = ?
    `, [nombreArchivo]);

    if (!rows.length) return res.status(404).json({ error: 'Archivo no encontrado' });

    const archivo = rows[0];
    const tieneAcceso = archivo.remitente_id === req.user.id ||
                        archivo.destinatario_id === req.user.id ||
                        req.user.rol === 'director';

    if (!tieneAcceso) return res.status(403).json({ error: 'Sin acceso a este archivo' });

    const rutaCompleta = path.join(UPLOADS_DIR, archivo.nombre_archivo);
    if (!fs.existsSync(rutaCompleta)) {
      return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
    }

    const respaldo = archivo.nombre_original.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Disposition',
      `attachment; filename="${respaldo}"; filename*=UTF-8''${encodeURIComponent(archivo.nombre_original)}`);
    res.setHeader('Content-Type', archivo.tipo_mime || 'application/octet-stream');
    res.sendFile(rutaCompleta);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── MENSAJES NO LEÍDOS (para el badge en el nav) ──────────────────────────────
exports.noLeidos = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM mensajes WHERE destinatario_id = ? AND leido = 0 AND oculto_destinatario = 0',
      [req.user.id]
    );
    const grupos = await require('./grupoChatController').totalNoLeidos(req.user.id);
    res.json({ total: rows[0].total + grupos });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ── MARCAR COMO LEÍDOS los mensajes de una conversación (cuando llegan en vivo) ─
exports.marcarLeido = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;
  const otroId = parseInt(req.params.userId);
  if (isNaN(otroId)) return res.status(400).json({ error: 'userId inválido' });
  try {
    await pool.query(
      'UPDATE mensajes SET leido = 1 WHERE remitente_id = ? AND destinatario_id = ? AND leido = 0',
      [otroId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
