jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { User } = require('../../data/Schema/user');
const { News } = require('../../data/Schema/news');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

let seq = 0;
async function player(name, admin = false) {
  const userName = `${name}${seq++}`;
  const email = `news.${userName.toLowerCase()}@gmail.com`;
  await fakeRequest.post('/auth/register').send({ userName, email, password: '123456Ab!' });
  if (admin) await User.updateOne({ email }, { admin: true });
  // Logging in again so the token carries the admin flag.
  const login = await fakeRequest.post('/auth/login').send({ email, password: '123456Ab!' });
  return { token: login.body.token };
}

const as = (p) => ({
  get: (path = '') => fakeRequest.get(`/news${path}`).set('Authorization', `Bearer ${p.token}`),
  post: (path, body = {}) => fakeRequest.post(`/news${path}`).set('Authorization', `Bearer ${p.token}`).send(body),
  put: (path, body = {}) => fakeRequest.put(`/news${path}`).set('Authorization', `Bearer ${p.token}`).send(body),
  del: (path) => fakeRequest.delete(`/news${path}`).set('Authorization', `Bearer ${p.token}`),
});

describe('News', () => {
  beforeEach(async () => {
    await News.deleteMany({});
  });

  it('needs a token', async () => {
    expect((await fakeRequest.get('/news')).status).toBe(401);
  });

  it('only admins publish and delete', async () => {
    const admin = await player('Admin', true);
    const reader = await player('Lector');
    expect((await as(reader).post('', { title: 'Hola', body: 'Texto' })).status).toBe(403);

    const created = await as(admin).post('', { title: 'Cambios de balance', body: 'Kraken pasa a 1500 de ATK.', kind: 'balance' });
    expect(created.status).toBe(201);
    expect((await as(reader).del(`/${created.body._id}`)).status).toBe(403);
    expect((await as(admin).del(`/${created.body._id}`)).status).toBe(200);
    expect((await as(admin).del(`/${created.body._id}`)).status).toBe(404);
  });

  it('validates title, text and kind', async () => {
    const admin = await player('Admin', true);
    expect((await as(admin).post('', { title: '', body: 'x' })).status).toBe(400);
    expect((await as(admin).post('', { title: 'x', body: '' })).status).toBe(400);
    expect((await as(admin).post('', { title: 'x', body: 'y', kind: 'spam' })).status).toBe(400);
    expect((await as(admin).post('', { title: 'x'.repeat(121), body: 'y' })).status).toBe(400);
  });

  it('news shows newest first and counts as unread until the player opens it', async () => {
    const admin = await player('Admin', true);
    const reader = await player('Lector');
    await as(admin).post('', { title: 'Primera', body: 'Uno' });
    await new Promise((r) => setTimeout(r, 20));
    await as(admin).post('', { title: 'Segunda', body: 'Dos', kind: 'event' });

    const list = await as(reader).get();
    expect(list.status).toBe(200);
    expect(list.body.news.map((n) => n.title)).toEqual(['Segunda', 'Primera']);
    expect(list.body.news.every((n) => n.unread)).toBe(true);
    expect(list.body.unread).toBe(2);

    expect((await as(reader).post('/seen')).status).toBe(200);
    expect((await as(reader).get('/unread')).body.unread).toBe(0);

    await new Promise((r) => setTimeout(r, 20));
    await as(admin).post('', { title: 'Tercera', body: 'Tres' });
    const after = await as(reader).get();
    expect(after.body.unread).toBe(1);
    expect(after.body.news.filter((n) => n.unread).map((n) => n.title)).toEqual(['Tercera']);
  });

  it('admins edit a published notice: same checks, publish date kept, edit date recorded', async () => {
    const admin = await player('Admin', true);
    const reader = await player('Lector');
    const created = (await as(admin).post('', { title: 'Mantenimiento', body: 'Mañana a las 10.', kind: 'maintenance' })).body;
    await as(reader).post('/seen');

    expect((await as(reader).put(`/${created._id}`, { title: 'Hackeada', body: 'x' })).status).toBe(403);
    expect((await as(admin).put(`/${created._id}`, { title: '', body: 'x' })).status).toBe(400);
    expect((await as(admin).put(`/${created._id}`, { title: 'x', body: 'y', kind: 'spam' })).status).toBe(400);
    expect((await as(admin).put('/000000000000000000000000', { title: 'x', body: 'y' })).status).toBe(404);
    expect((await as(admin).put('/no-es-un-id', { title: 'x', body: 'y' })).status).toBe(404);

    const edited = await as(admin).put(`/${created._id}`, { title: 'Mantenimiento aplazado', body: 'Pasa al jueves a las 10.', kind: 'event' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ title: 'Mantenimiento aplazado', body: 'Pasa al jueves a las 10.', kind: 'event' });
    expect(edited.body.createdAt).toBe(created.createdAt);
    expect(edited.body.editedAt).toBeTruthy();

    // Editing doesn't bring it back as unread.
    const list = await as(reader).get();
    expect(list.body.unread).toBe(0);
    expect(list.body.news[0]).toMatchObject({ title: 'Mantenimiento aplazado', unread: false });
    expect(list.body.news[0].editedAt).toBeTruthy();
  });
});
