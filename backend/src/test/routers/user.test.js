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

  describe('POST /user/update', () => {
    it('ignores server-owned fields (admin, currency, level, password) sent by the user', async () => {
      const before = await User.findOne({ email: 'regular.user@gmail.com' }).lean();
      const response = await fakeRequest
        .post('/user/update')
        .set('Authorization', `Bearer ${regularToken}`)
        .field('userName', 'Regular Renamed')
        .field('admin', 'true')
        .field('pixelcoins', '999999')
        .field('pixelgems', '999999')
        .field('level', '99')
        .field('password', 'hacked');

      expect(response.status).toBe(200);
      expect(response.body.password).toBeUndefined();
      const after = await User.findOne({ email: 'regular.user@gmail.com' }).lean();
      expect(after.userName).toBe('Regular Renamed');
      expect(after.admin).toBe(false);
      expect(after.pixelcoins).toBe(before.pixelcoins);
      expect(after.pixelgems).toBe(before.pixelgems);
      expect(after.level).toBe(before.level);
      expect(after.password).toBe(before.password);

      // The account still logs in with its real password.
      const login = await fakeRequest.post('/auth/login').send({ email: 'regular.user@gmail.com', password: '123456Ab' });
      expect(login.status).toBe(200);
    });

    it('updates the profile without a picture, leaving blank fields unchanged', async () => {
      const response = await fakeRequest
        .post('/user/update')
        .set('Authorization', `Bearer ${regularToken}`)
        .field('userName', '')
        .field('birthDate', '2000-05-10');
      expect(response.status).toBe(200);
      expect(response.body.userName).toBe('Regular Renamed');
      expect(new Date(response.body.birthDate).toISOString().slice(0, 10)).toBe('2000-05-10');
    });

    it('rejects an invalid email', async () => {
      const response = await fakeRequest
        .post('/user/update')
        .set('Authorization', `Bearer ${regularToken}`)
        .field('email', 'no-es-un-email');
      expect(response.status).toBe(400);
    });

    it('rejects a userName already taken by someone else', async () => {
      const response = await fakeRequest
        .post('/user/update')
        .set('Authorization', `Bearer ${regularToken}`)
        .field('userName', 'Soon Admin');
      expect(response.status).toBe(409);
    });
  });
});
