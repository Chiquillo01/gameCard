const cors = require('cors');
const express = require('express');
const router = require('./routers');
require('dotenv').config();

// The Express app, shared by the real server (index.js) and the tests, so both run the same setup.
exports.bootstrapApp = () => {
  const app = express();
  // Behind a proxy (the deployed server), TRUST_PROXY=1 makes req.ip the real client address —
  // the login attempt limit counts per IP. Left off by default: without a proxy in front, trusting
  // X-Forwarded-For would let anyone fake their IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(cors());
  app.use(express.json());

  app.use('/', router);

  return app;
};
