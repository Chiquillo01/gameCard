// The password rule, kept identical to the frontend's register form
// (frontend/src/components/AuthPage/RegisterForm): at least 8 characters with one lowercase, one
// uppercase, one digit and one special character, using only letters, digits and those specials.
// Enforced wherever a password is set (register, admin user creation), never at login, so accounts
// with passwords from before this rule can still sign in.
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}$/;
const PASSWORD_RULE_MESSAGE =
  'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial';

function validatePasswordFormat(password) {
  return typeof password === 'string' && PASSWORD_PATTERN.test(password);
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
    return res.status(400).json({ error: PASSWORD_RULE_MESSAGE });
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
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
  validatePasswordFormat,
  validateEmailFormat,
  validateRegister,
  adminMiddleware,
};
