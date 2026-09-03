const { Router } = require('express');
const { loginFunction, registerFunction } = require('../controllers/authController');
const { validateRegister } = require('../middlewares');

const authRouter = Router();

authRouter.post('/login', loginFunction);
authRouter.post('/register', validateRegister, registerFunction);

module.exports = {
  authRouter,
};
