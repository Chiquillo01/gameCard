jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

describe('Auth Controller TEST', () => {
  const userData = {
    userName: 'Jose Manuel',
    email: 'jose.cano@gmail.com',
    password: '123456Ab',
  };

  describe('POST /auth/register', () => {
    it('should let the user register with valid data', async () => {
      const response = await fakeRequest.post('/auth/register').send(userData);
      expect(response.status).toBe(201);
      expect(response.body.token).toBeDefined();
    });

    it('should reject registration with a missing field', async () => {
      const response = await fakeRequest.post('/auth/register').send({
        email: 'incomplete@gmail.com',
        password: '123456Ab',
      });
      expect(response.status).toBe(400);
    });

    it('should reject registration with a weak password', async () => {
      const response = await fakeRequest.post('/auth/register').send({
        userName: 'Weak Password User',
        email: 'weak@gmail.com',
        password: 'weak',
      });
      expect(response.status).toBe(400);
    });

    it('should reject registration with an invalid email format', async () => {
      const response = await fakeRequest.post('/auth/register').send({
        userName: 'Bad Email User',
        email: 'not-an-email',
        password: '123456Ab',
      });
      expect(response.status).toBe(400);
    });

    it('should reject registration with a duplicate email', async () => {
      const response = await fakeRequest.post('/auth/register').send(userData);
      expect(response.status).toBe(400);
    });

    it('should reject registration with a duplicate email in a different case', async () => {
      const response = await fakeRequest.post('/auth/register').send({
        ...userData,
        userName: 'Another Jose',
        email: userData.email.toUpperCase(),
      });
      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should let the user log in with the correct credentials', async () => {
      const response = await fakeRequest.post('/auth/login').send({
        email: userData.email,
        password: userData.password,
      });
      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
    });

    it('should reject login with an incorrect password', async () => {
      const response = await fakeRequest.post('/auth/login').send({
        email: userData.email,
        password: 'WrongPassword1',
      });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Email o contraseña incorrectos' });
      expect(response.body.token).toBeUndefined();
    });

    it('should let the user log in when the email casing differs from registration', async () => {
      const response = await fakeRequest.post('/auth/login').send({
        email: userData.email.toUpperCase(),
        password: userData.password,
      });
      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
    });

    it('answers a non-existent email exactly like a wrong password (no way to tell which emails exist)', async () => {
      const response = await fakeRequest.post('/auth/login').send({
        email: 'doesnotexist@gmail.com',
        password: '123456Ab',
      });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Email o contraseña incorrectos' });
    });

    it('should reject login with missing fields', async () => {
      const response = await fakeRequest.post('/auth/login').send({ email: userData.email });
      expect(response.status).toBe(400);
    });

    it('issues a token that expires in a week', async () => {
      const response = await fakeRequest.post('/auth/login').send({ email: userData.email, password: userData.password });
      const { exp, iat } = JSON.parse(Buffer.from(response.body.token.split('.')[1], 'base64url').toString());
      expect(exp - iat).toBe(7 * 24 * 60 * 60);
    });
  });

  describe('Login attempt limit', () => {
    const limiter = require('../../security/loginLimiter');
    beforeEach(() => limiter.resetAll());

    it('blocks an email after 5 failed attempts, even with the right password', async () => {
      for (let i = 0; i < limiter.MAX_FAILS_PER_ACCOUNT; i++) {
        const r = await fakeRequest.post('/auth/login').send({ email: userData.email, password: 'WrongPassword1' });
        expect(r.status).toBe(401);
      }
      const blocked = await fakeRequest.post('/auth/login').send({ email: userData.email, password: userData.password });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(blocked.body.token).toBeUndefined();
    });

    it('a successful login clears the count', async () => {
      for (let i = 0; i < limiter.MAX_FAILS_PER_ACCOUNT - 1; i++) {
        await fakeRequest.post('/auth/login').send({ email: userData.email, password: 'WrongPassword1' });
      }
      expect((await fakeRequest.post('/auth/login').send({ email: userData.email, password: userData.password })).status).toBe(200);
      expect((await fakeRequest.post('/auth/login').send({ email: userData.email, password: 'WrongPassword1' })).status).toBe(401);
    });

    it('also limits one IP trying many different emails', async () => {
      for (let i = 0; i < limiter.MAX_FAILS_PER_IP; i++) {
        await fakeRequest.post('/auth/login').send({ email: `probe${i}@gmail.com`, password: 'WrongPassword1' });
      }
      expect((await fakeRequest.post('/auth/login').send({ email: 'another@gmail.com', password: 'WrongPassword1' })).status).toBe(429);
    });
  });
});
