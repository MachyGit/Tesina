// backend/rutas/calendar.js
const router = require('express').Router();
const { getAuthUrl, callback, crearEvento } = require('../controladores/calendarController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/auth-url', verifyToken, getAuthUrl);
router.get('/callback', callback);
router.post('/evento', verifyToken, crearEvento);

module.exports = router;
