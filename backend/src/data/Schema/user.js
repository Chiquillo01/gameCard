require('dotenv').config();

const { Schema, model } = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const secret = process.env.JWT_SECRET_KEY;

const userSchema = new Schema(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'El email no es válido'],
    },
    password: {
      type: String,
      required: true,
    },
    profilePicture: {
      type: String,
      default: '/assets/UserImg/userimage3.svg',
    },
    level: {
      type: Number,
      default: 1,
    },
    birthDate: {
      type: Date,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    admin: {
      type: Boolean,
      default: false,
    },
    pixelcoins: {
      type: Number,
      default: 0,
    },
    pixelgems: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateJWT = function () {
  const today = new Date();
  const expirationDate = new Date();

  expirationDate.setDate(today.getDate());

  let payload = {
    id: this._id,
    admin: this.admin,
  };

  return jwt.sign(payload, secret, {
    expiresIn: parseInt(expirationDate.getTime() / 1000, 10),
  });
};

const User = model('User', userSchema);

module.exports = { User };
