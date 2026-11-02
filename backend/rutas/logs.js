// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/rutas/logs.js
const router = require('express').Router();
const { listarLogs } = require('../controladores/telegramController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.get('/', verifyToken, checkRol('director','secretaria'), listarLogs);

module.exports = router;
