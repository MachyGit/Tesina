const router = require('express').Router();
const { login, logout } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/login', login);
router.post('/logout', verifyToken, logout);

module.exports = router;
