require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const { connectDB } = require('./mongo/connection');
const { CreateSocketServer } = require('./socket/socketServer');
const router = require('./routers');

app.use(cors());
app.use(express.json());

app.use('/', router);

connectDB().then(() => console.log('Connected to database!'));

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});

CreateSocketServer(server);

module.exports = { app, server };
