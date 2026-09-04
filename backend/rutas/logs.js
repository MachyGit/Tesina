// backend/rutas/logs.js
const router = require('express').Router();
const { listarLogs } = require('../controladores/telegramController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.get('/', verifyToken, checkRol('director','secretaria'), listarLogs);

module.exports = router;
