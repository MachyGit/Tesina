// backend/rutas/auth.js
const router = require('express').Router();
const {
  login, logout,
  loginConCodigo, solicitarRecuperacion, resetearPassword
} = require('../controladores/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/login',  login);
router.post('/logout', verifyToken, logout);

// Primer ingreso (o cuenta reseteada por un admin): email + código de 6 dígitos
router.post('/login-codigo', loginConCodigo);

// "Olvidé mi contraseña": pide un enlace al mail registrado, y lo consume
router.post('/recuperar',      solicitarRecuperacion);
router.post('/reset-password', resetearPassword);

module.exports = router;
