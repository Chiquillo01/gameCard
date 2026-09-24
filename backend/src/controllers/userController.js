const { default: mongoose } = require('mongoose');
const { User } = require('../data/Schema/user');
const cloudinary = require('cloudinary').v2;
const { validateEmailFormat } = require('../middlewares');

const getUsers = async (req, res) => {
  try {
    const { userName } = req.query;
    const filter = userName ? { userName } : {};
    const allUsers = await User.find(filter).select('-password');
    res.status(200).json(allUsers);
  } catch (e) {
    res.status(500).send();
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(200).json(currentUser);
  } catch (error) {
    res.status(500).json([{ Error: 'Error al obtener el usuario actual' }]);
  }
};

// The only fields a user may change on their own profile. Everything else on the document —
// admin, pixelcoins, pixelgems, level, password — is server-owned: copying the request body
// straight into the update would let anyone grant themselves admin or currency.
const SELF_EDITABLE_FIELDS = ['userName', 'email', 'birthDate'];

const updateUser = async (req, res) => {
  const userId = req.jwtPayload.id;

  try {
    const requestingUser = await User.findById(userId);
    if (!requestingUser) {
      return res.status(401).send();
    }

    const userUpdated = {};
    SELF_EDITABLE_FIELDS.forEach((field) => {
      const value = req.body[field];
      // A multipart form sends blank inputs as '' (or 'undefined'/'null' strings): treat those as "not changed".
      if (typeof value !== 'string' || !value.trim() || value === 'undefined' || value === 'null') return;
      userUpdated[field] = value.trim();
    });
    if (userUpdated.email) {
      userUpdated.email = userUpdated.email.toLowerCase();
      if (!validateEmailFormat(userUpdated.email)) {
        return res.status(400).json({ error: 'El formato del email no es correcto' });
      }
    }
    if (userUpdated.birthDate && Number.isNaN(new Date(userUpdated.birthDate).getTime())) {
      return res.status(400).json({ error: 'La fecha de nacimiento no es válida' });
    }

    // The profile picture is optional: only upload when a file actually came with the request.
    if (req.file) {
      const { buffer, mimetype } = req.file;
      const imageUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
      const imageUploaded = await cloudinary.uploader.upload(imageUrl);
      userUpdated.profilePicture = imageUploaded.secure_url;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, userUpdated, {
      new: true,
      runValidators: true,
    }).select('-password');

    res.status(200).json(updatedUser);
  } catch (error) {
    // Duplicate userName/email (unique index).
    if (error && error.code === 11000) return res.status(409).json({ error: 'Ese nombre de usuario o email ya está en uso' });
    res.status(500).send();
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  try {
    const requestingUser = await User.findById(req.jwtPayload.id);
    if (!requestingUser) {
      return res.status(404).json({ error: 'Usuario que realiza la solicitud no encontrado' });
    }

    if (!requestingUser.admin) {
      return res.status(403).json({ error: 'Permiso denegado. Sólo los administradores pueden eliminar usuarios.' });
    }

    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(200).json({ message: 'Usuario eliminado' });
  } catch (e) {
    res.status(400).json([{ Error: 'Error en la eliminación del usuario' }]);
  }
};

const createUser = async (req, res) => {
  const body = req.body;

  try {
    const requestingUser = await User.findById(req.jwtPayload.id);
    if (!requestingUser) {
      return res.status(404).json({ error: 'Usuario que realiza la solicitud no encontrado' });
    }

    if (!requestingUser.admin) {
      return res.status(403).json({ error: 'Permiso denegado. Sólo los administradores pueden eliminar usuarios.' });
    }

    const data = {
      userName: body.newUser.userName,
      email: body.newUser.email,
      password: body.newUser.password,
      level: body.newUser.level,
      admin: body.newUser.admin,
    };

    const newUser = new User(data);

    await newUser.save();
    res.status(200).json(newUser);
  } catch (error) {
    res.status(500).json([{ Error: 'Error en la creación del usuario' }]);
  }
};

module.exports = {
  getUsers,
  getCurrentUser,
  updateUser,
  createUser,
  deleteUser,
};
