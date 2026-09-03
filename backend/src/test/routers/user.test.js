jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { User } = require('../../data/Schema/user');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('User Controller TEST', () => {
  let regularToken;
  let adminToken;

  beforeAll(async () => {
    const regular = await fakeRequest.post('/auth/register').send({
      userName: 'Regular User',
      email: 'regular.user@gmail.com',
      password: '123456Ab',
    });
    regularToken = regular.body.token;

    await fakeRequest.post('/auth/register').send({
      userName: 'Soon Admin',
      email: 'admin.user@gmail.com',
      password: '123456Ab',
    });
    await User.updateOne({ email: 'admin.user@gmail.com' }, { admin: true });

    const adminLogin = await fakeRequest.post('/auth/login').send({
      email: 'admin.user@gmail.com',
      password: '123456Ab',
    });
    adminToken = adminLogin.body.token;
  });

  describe('GET /user', () => {
    it('should reject the request without a token', async () => {
      const response = await fakeRequest.get('/user');
      expect(response.status).toBe(401);
    });

    it('should reject the request from a non-admin user', async () => {
      const response = await fakeRequest.get('/user').set('Authorization', `Bearer ${regularToken}`);
      expect(response.status).toBe(403);
    });

    it('should let an admin list users without leaking password hashes', async () => {
      const response = await fakeRequest.get('/user').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      response.body.forEach((user) => {
        expect(user.password).toBeUndefined();
      });
    });
  });
});
