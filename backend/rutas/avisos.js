// backend/rutas/avisos.js
const router = require('express').Router();
const { crearAviso, listarAvisos, eliminarAviso, crearAvisoPorBot } = require('../controladores/avisoController');
const { verifyToken, verifyBotSecret } = require('../middleware/authMiddleware');

// Rutas para usuarios web (JWT)
router.get('/',       verifyToken, listarAvisos);
router.post('/',      verifyToken, crearAviso);
router.delete('/:id', verifyToken, eliminarAviso);

// Ruta exclusiva para el bot (autenticada con BOT_SECRET)
router.post('/bot',   verifyBotSecret, crearAvisoPorBot);

module.exports = router;
