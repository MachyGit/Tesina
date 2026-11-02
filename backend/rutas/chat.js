// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/chat.js
const router = require('express').Router();
const {
  listarContactos, obtenerConversacion,
  enviarMensaje, subirArchivo,
  descargarArchivo, noLeidos, marcarLeido, eliminarMensaje, eliminarVarios, vaciarConversacion
} = require('../controladores/chatController');
const g = require('../controladores/grupoChatController');
const { verifyToken } = require('../middleware/authMiddleware');

// Grupos (van antes de las rutas con :userId)
router.get('/grupos',                          verifyToken, g.listar);
router.post('/grupos',                         verifyToken, g.crear);
router.get('/grupos/:id',                      verifyToken, g.detalle);
router.put('/grupos/:id',                      verifyToken, g.renombrar);
router.delete('/grupos/:id',                   verifyToken, g.eliminarGrupo);
router.post('/grupos/:id/miembros',            verifyToken, g.agregarMiembros);
router.delete('/grupos/:id/miembros/:userId',  verifyToken, g.quitarMiembro);
router.get('/grupos/:id/mensajes',             verifyToken, g.mensajes);
router.delete('/grupos/:id/mensajes',          verifyToken, g.vaciar);
router.put('/grupos/:id/leido',                verifyToken, g.marcarLeido);
router.post('/grupos/:id/mensaje',             verifyToken, g.enviar);
router.post('/grupos/:id/borrar-varios',       verifyToken, g.borrarVarios);
router.delete('/grupos/:id/mensaje/:mid',      verifyToken, g.borrarMensaje);

router.get('/contactos',               verifyToken, listarContactos);
router.get('/no-leidos',               verifyToken, noLeidos);
router.get('/conversacion/:userId',    verifyToken, obtenerConversacion);
router.post('/mensaje/:userId',        verifyToken, enviarMensaje);
router.post('/borrar-varios',          verifyToken, eliminarVarios);
router.delete('/conversacion/:userId', verifyToken, vaciarConversacion);
router.delete('/mensaje/:id',          verifyToken, eliminarMensaje);
router.post('/archivo/:userId',        verifyToken, subirArchivo);
router.put('/leido/:userId',           verifyToken, marcarLeido);
router.get('/archivo/:nombreArchivo',  verifyToken, descargarArchivo);

module.exports = router;
