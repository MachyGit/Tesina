const router = require('express').Router();
const { verLogs } = require('../controllers/logController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.get('/', verifyToken, checkRol('director', 'secretaria'), verLogs);

module.exports = router;
