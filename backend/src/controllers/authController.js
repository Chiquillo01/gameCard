const { User } = require('../data/Schema/user');
const { UserCollection } = require('../data/Schema/userCollection');
const sendWelcomeEmail = require('../services/sendgrid');
const bcrypt = require('bcrypt');
const loginLimiter = require('../security/loginLimiter');

const registerFunction = async (req, res) => {
  try {
    const { email, userName, password } = req.body;

    if (!email || !userName || !password) return res.status(400).send();

    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).send();
    }

    const newUser = new User({ userName, email: normalizedEmail, password, pixelcoins: 1000 });
    const createdUser = await newUser.save();

    const newUserCollection = new UserCollection({ userId: createdUser._id, cards: [] });
    await newUserCollection.save();
    sendWelcomeEmail(normalizedEmail, userName).catch((err) => {
      console.error('Error al enviar el email de bienvenida:', (err.response && err.response.body) || err.message);
    });

    const token = createdUser.generateJWT();

    return res.status(201).json({
      token,
    });
  } catch (e) {
    return res.status(500).send();
  }
};

// A bcrypt hash of nothing in particular: an unknown email still pays for one comparison, so the
// response time doesn't tell whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('pixelquest-no-such-user', 10);
const INVALID_CREDENTIALS = 'Email o contraseña incorrectos';

// One answer for "no such email" and "wrong password" (401, same message) so the login can't be
// used to find out which emails are registered, and a limit on failed attempts (loginLimiter).
const loginFunction = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return res.status(400).send();

    const normalizedEmail = email.toLowerCase().trim();
    const ip = req.ip;
    const retryAfter = loginLimiter.blockedFor(ip, normalizedEmail);
    if (retryAfter) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${Math.ceil(retryAfter / 60)} minuto(s).` });
    }

    const foundUser = await User.findOne({ email: normalizedEmail });
    let isPasswordValid = false;
    if (foundUser) isPasswordValid = await foundUser.comparePassword(password);
    else await bcrypt.compare(password, DUMMY_HASH);
    if (!isPasswordValid) {
      loginLimiter.recordFailure(ip, normalizedEmail);
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    loginLimiter.recordSuccess(ip, normalizedEmail);
    return res.status(200).json({
      token: foundUser.generateJWT(),
    });
  } catch (e) {
    return res.status(500).send();
  }
};

module.exports = {
  registerFunction,
  loginFunction,
};
