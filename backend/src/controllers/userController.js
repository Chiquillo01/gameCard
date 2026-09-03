const { default: mongoose } = require('mongoose');
const { User } = require('../data/Schema/user');
const cloudinary = require('cloudinary').v2;

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

const updateUser = async (req, res) => {
  const userId = req.jwtPayload.id;
  const updateInfo = req.body;
  const { buffer, mimetype } = req.file;

  try {
    const requestingUser = await User.findById(userId);
    if (!requestingUser) {
      return res.status(401).send();
    }
    const encodedImage = buffer.toString('base64');
    const imageUrl = `data:${mimetype};base64,${encodedImage}`;
    const imageUploaded = await cloudinary.uploader.upload(imageUrl);
    const secureUrl = imageUploaded.secure_url;
    const userUpdated = {
      ...updateInfo,
      profilePicture: secureUrl,
    };
    const updatedUser = await User.findByIdAndUpdate(userId, userUpdated, {
      new: true,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
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
