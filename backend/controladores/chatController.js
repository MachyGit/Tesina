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
      WHERE (m.remitente_id = ? AND m.destinatario_id = ?)
         OR (m.remitente_id = ? AND m.destinatario_id = ?)
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
  const { contenido } = req.body;

  if (isNaN(destinatarioId)) {
    return res.status(400).json({ error: 'userId inválido' });
  }

  try {
    // Verificar que el destinatario sea staff
    const [dest] = await pool.query(
      "SELECT id, rol FROM users WHERE id = ? AND activo = 1",
      [destinatarioId]
    );
    if (!dest.length) {
      return res.status(404).json({ error: 'Destinatario no encontrado' });
    }
    if (!ROLES_CHAT.includes(dest[0].rol)) {
      return res.status(403).json({ error: 'Solo podés enviar mensajes a personal de la escuela' });
    }

    const [result] = await pool.query(
      'INSERT INTO mensajes (remitente_id, destinatario_id, contenido) VALUES (?, ?, ?)',
      [req.user.id, destinatarioId, contenido || null]
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

// ── SUBIR ARCHIVO Y ENVIARLO COMO MENSAJE ─────────────────────────────────────
// El archivo viene en base64: { nombre, mime, datos_base64, destinatario_id }
exports.subirArchivo = async (req, res) => {
  if (!_checkChatAccess(req.user, res)) return;

  const destinatarioId = parseInt(req.params.userId);
  const { nombre_original, mime, datos_base64, contenido } = req.body;

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
    await pool.query(
      'INSERT INTO archivos_chat (mensaje_id, nombre_original, nombre_archivo, tipo_mime, tamanio) VALUES (?, ?, ?, ?, ?)',
      [mensajeId, nombre_original, nombreArchivo, mime || 'application/octet-stream', buffer.length]
    );

    const archivoData = {
      id:             mensajeId,
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

    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre_original}"`);
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
      'SELECT COUNT(*) AS total FROM mensajes WHERE destinatario_id = ? AND leido = 0',
      [req.user.id]
    );
    res.json({ total: rows[0].total });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
