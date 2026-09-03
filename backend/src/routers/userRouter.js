require('dotenv').config();
const { Router } = require('express');
const { getUsers, getCurrentUser, updateUser } = require('../controllers/userController');
const { jwtMiddleware } = require('../security/jwt.js');
const { adminMiddleware } = require('../middlewares');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const userRouter = Router();

userRouter.get('/', jwtMiddleware, adminMiddleware, getUsers);
userRouter.get('/me', jwtMiddleware, getCurrentUser);
userRouter.post('/update', jwtMiddleware, upload.single('profilePicture'), updateUser);

module.exports = { userRouter };
