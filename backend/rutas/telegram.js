// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/telegram.js
const router = require('express').Router();
const { vincularCuenta, verificarTelegramId, contextoBot, aniosBot } = require('../controladores/telegramController');
const { verifyBotSecret } = require('../middleware/authMiddleware');

// Llamadas solo desde el bot
router.post('/vincular',  verifyBotSecret, vincularCuenta);
router.get('/verificar',  verifyBotSecret, verificarTelegramId);
router.get('/contexto',   verifyBotSecret, contextoBot);
router.get('/anios',      verifyBotSecret, aniosBot);

module.exports = router;
