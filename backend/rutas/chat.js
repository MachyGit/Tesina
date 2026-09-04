// backend/rutas/chat.js
const router = require('express').Router();
const {
  listarContactos, obtenerConversacion,
  enviarMensaje, subirArchivo,
  descargarArchivo, noLeidos
} = require('../controladores/chatController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/contactos',               verifyToken, listarContactos);
router.get('/no-leidos',               verifyToken, noLeidos);
router.get('/conversacion/:userId',    verifyToken, obtenerConversacion);
router.post('/mensaje/:userId',        verifyToken, enviarMensaje);
router.post('/archivo/:userId',        verifyToken, subirArchivo);
router.get('/archivo/:nombreArchivo',  verifyToken, descargarArchivo);

module.exports = router;
