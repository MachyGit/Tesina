const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
};

const checkRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.rol))
    return res.status(403).json({ error: 'Sin permisos' });
  next();
};

module.exports = { verifyToken, checkRol };
