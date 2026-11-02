// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/avisos.js
const router = require('express').Router();
const {
  crearAviso, listarAvisos, eliminarAviso, descargarICS, detalleAviso, comentarAviso, borrarComentario,
  crearAvisoPorBot, listarAvisosPorBot,
} = require('../controladores/avisoController');
const { verifyToken, verifyBotSecret } = require('../middleware/authMiddleware');

// Ruta exclusiva para el bot (autenticada con BOT_SECRET).
// Va antes que '/:id' para que "bot" no se interprete como un id.
router.post('/bot',   verifyBotSecret, crearAvisoPorBot);
router.get('/bot',    verifyBotSecret, listarAvisosPorBot);

// Rutas para usuarios web (JWT)
router.get('/',        verifyToken, listarAvisos);
router.post('/',       verifyToken, crearAviso);
router.get('/:id/ics', verifyToken, descargarICS);
router.delete('/comentarios/:cid', verifyToken, borrarComentario);
router.get('/:id',     verifyToken, detalleAviso);
router.post('/:id/comentarios', verifyToken, comentarAviso);
router.delete('/:id',  verifyToken, eliminarAviso);

module.exports = router;
