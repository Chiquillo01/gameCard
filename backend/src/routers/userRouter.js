require('dotenv').config();
const { Router } = require('express');
const { getUsers, getCurrentUser, updateUser } = require('../controllers/userController');
const { jwtMiddleware } = require('../security/jwt.js');
const { adminMiddleware } = require('../middlewares');
const multer = require('multer');
// A profile picture only: one image, up to 2 MB (kept in memory until it's sent to Cloudinary).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const userRouter = Router();

userRouter.get('/', jwtMiddleware, adminMiddleware, getUsers);
userRouter.get('/me', jwtMiddleware, getCurrentUser);
userRouter.post('/update', jwtMiddleware, upload.single('profilePicture'), updateUser);

module.exports = { userRouter };
