function validatePasswordFormat(password) {
  const pattern = new RegExp(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/);
  return pattern.test(password);
}

function validateEmailFormat(email) {
  const pattern = new RegExp(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
  return pattern.test(email);
}

const validateRegister = (req, res, next) => {
  const user = req.body;

  if (!user.userName?.trim()) {
    return res.status(400).json({ error: 'userName es obligatorio' });
  }
  if (!user.password) {
    return res.status(400).json({ error: 'password es obligatorio' });
  }
  if (!validatePasswordFormat(user.password)) {
    return res.status(400).json({
      error: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número',
    });
  }
  if (!user.email) {
    return res.status(400).json({ error: 'email es obligatorio' });
  }
  if (!validateEmailFormat(user.email)) {
    return res.status(400).json({ error: 'El formato del email no es correcto' });
  }

  next();
};

const adminMiddleware = (req, res, next) => {
  if (!req.jwtPayload?.admin) {
    return res.status(403).json({ error: 'Permiso denegado. Sólo los administradores pueden realizar esta acción.' });
  }
  next();
};

module.exports = {
  validatePasswordFormat,
  validateEmailFormat,
  validateRegister,
  adminMiddleware,
};
