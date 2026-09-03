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
      expect(response.status).toBe(400);
      expect(response.body.token).toBeUndefined();
    });

    it('should reject login for a non-existent email', async () => {
      const response = await fakeRequest.post('/auth/login').send({
        email: 'doesnotexist@gmail.com',
        password: '123456Ab',
      });
      expect(response.status).toBe(410);
    });

    it('should reject login with missing fields', async () => {
      const response = await fakeRequest.post('/auth/login').send({ email: userData.email });
      expect(response.status).toBe(400);
    });
  });
});
