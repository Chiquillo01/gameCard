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
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    error.message = 'La foto de perfil debe ser una imagen';
    cb(error);
  },
});

// Multer errors (too big, not an image, wrong field) become a 400 with a readable message instead of a bare 500.
const uploadProfilePicture = (req, res, next) =>
  upload.single('profilePicture')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'La foto de perfil no puede pesar más de 2 MB' : error.message;
      return res.status(400).json({ error: message });
    }
    return next(error);
  });

const userRouter = Router();

userRouter.get('/', jwtMiddleware, adminMiddleware, getUsers);
userRouter.get('/me', jwtMiddleware, getCurrentUser);
userRouter.post('/update', jwtMiddleware, uploadProfilePicture, updateUser);

module.exports = { userRouter };
