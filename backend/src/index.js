require('dotenv').config();
const { bootstrapApp } = require('./bootstrap');
const { connectDB } = require('./mongo/connection');
const { CreateSocketServer } = require('./socket/socketServer');

const app = bootstrapApp();

connectDB().then(() => console.log('Connected to database!'));

const port = process.env.PORT || 3001;

const server = app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});

CreateSocketServer(server);

module.exports = { app, server };
