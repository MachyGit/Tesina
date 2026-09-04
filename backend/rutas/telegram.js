// backend/rutas/telegram.js
const router = require('express').Router();
const { vincularCuenta, verificarTelegramId } = require('../controladores/telegramController');
const { verifyBotSecret } = require('../middleware/authMiddleware');

// Llamadas solo desde el bot
router.post('/vincular',  verifyBotSecret, vincularCuenta);
router.get('/verificar',  verifyBotSecret, verificarTelegramId);

module.exports = router;
