require('dotenv').config();
const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET_KEY;

const jwtMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) return res.status(401).json({ error: 'Sin autorización: falta header' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Sin autorización: falta token' });

  try {
    const tokenPayload = jwt.verify(token, jwtSecret);
    req.jwtPayload = tokenPayload;
    next();
  } catch (e) {
    return res.status(401).json({ e: 'Sin autorización: token invalido' });
  }
};

const signToken = (payload, expiresIn = '1d') => {
  const token = jwt.sign(payload, jwtSecret, { expiresIn });

  return {
    token,
    id: payload.id,
  };
};

const verifyToken = (token) => {
  return jwt.verify(token, jwtSecret);
};

module.exports = {
  jwtMiddleware,
  signToken,
  verifyToken,
};
