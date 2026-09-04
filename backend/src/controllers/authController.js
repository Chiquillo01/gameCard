const { User } = require('../data/Schema/user');
const { UserCollection } = require('../data/Schema/userCollection');
const sendWelcomeEmail = require('../services/sendgrid');

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
    sendWelcomeEmail(email, userName).catch((err) => {
      console.error('Error al enviar el email de bienvenida:', err);
    });

    const token = createdUser.generateJWT();

    return res.status(201).json({
      token,
    });
  } catch (e) {
    return res.status(500).send();
  }
};

const loginFunction = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).send();

    const normalizedEmail = email.toLowerCase().trim();

    const foundUser = await User.findOne({ email: normalizedEmail });
    if (!foundUser) return res.status(410).send();

    const isPasswordValid = await foundUser.comparePassword(password);
    if (!isPasswordValid) return res.status(400).send();

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
