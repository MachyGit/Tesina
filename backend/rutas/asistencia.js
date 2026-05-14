const router = require('express').Router();
const { registrarAsistencia, verAsistencia } = require('../controllers/asistenciaController');
const { verifyToken, checkRol } = require('../middleware/authMiddleware');

router.post('/', verifyToken, checkRol('preceptor'), registrarAsistencia);
router.get('/:alumno_id', verifyToken, verAsistencia);

module.exports = router;
