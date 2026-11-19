jest.mock('../../services/sendgrid', () => jest.fn().mockResolvedValue());

const supertest = require('supertest');
const { bootstrapApp } = require('../../bootstrap');
const app = bootstrapApp();
const fakeRequest = supertest(app);
const { disconnectDB, connectDB } = require('../../mongo/connection');
const { areFriends } = require('../../services/friends');
const { User } = require('../../data/Schema/user');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

let seq = 0;
async function player(name) {
  const userName = `${name}${seq++}`;
  const res = await fakeRequest.post('/auth/register').send({ userName, email: `friends.${userName.toLowerCase()}@gmail.com`, password: '123456Ab!' });
  const user = await User.findOne({ userName });
  return { token: res.body.token, id: String(user._id), userName };
}

const api = (p) => ({
  get: (path = '') => fakeRequest.get(`/friendship${path}`).set('Authorization', `Bearer ${p.token}`),
  post: (path, body = {}) => fakeRequest.post(`/friendship${path}`).set('Authorization', `Bearer ${p.token}`).send(body),
  del: (path) => fakeRequest.delete(`/friendship${path}`).set('Authorization', `Bearer ${p.token}`),
});

describe('Friends', () => {
  it('needs a token', async () => {
    const res = await fakeRequest.get('/friendship');
    expect(res.status).toBe(401);
  });

  it('a request shows up for both players, and accepting it makes them friends', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');

    const sent = await api(ana).post('/invitation', { friendName: beto.userName });
    expect(sent.status).toBe(201);

    const anaView = await api(ana).get();
    expect(anaView.body.outgoing.map((i) => i.user.userName)).toEqual([beto.userName]);
    const betoView = await api(beto).get();
    expect(betoView.body.incoming.map((i) => i.user.userName)).toEqual([ana.userName]);
    expect(betoView.body.incoming[0].user.password).toBeUndefined();

    const accepted = await api(beto).post(`/invitation/${betoView.body.incoming[0]._id}/accept`);
    expect(accepted.status).toBe(200);

    const after = await api(ana).get();
    expect(after.body.friends.map((f) => f.userName)).toEqual([beto.userName]);
    expect(after.body.outgoing).toEqual([]);
    expect((await api(beto).get()).body.friends.map((f) => f.userName)).toEqual([ana.userName]);
    expect(await areFriends(ana.id, beto.id)).toBe(true);
  });

  it('only the receiver can accept or reject a request', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');
    await api(ana).post('/invitation', { friendName: beto.userName });
    const id = (await api(beto).get()).body.incoming[0]._id;

    expect((await api(ana).post(`/invitation/${id}/accept`)).status).toBe(404);
    expect((await api(beto).post(`/invitation/${id}/reject`)).status).toBe(200);
    expect((await api(beto).get()).body.incoming).toEqual([]);
    expect((await api(beto).post(`/invitation/${id}/accept`)).status).toBe(404);
    expect(await areFriends(ana.id, beto.id)).toBe(false);
  });

  it('refuses requests to yourself, to unknown players, repeated ones and to friends', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');

    expect((await api(ana).post('/invitation', { friendName: ana.userName })).status).toBe(400);
    expect((await api(ana).post('/invitation', { friendName: 'nadie-se-llama-asi' })).status).toBe(404);
    expect((await api(ana).post('/invitation', { friendName: '' })).status).toBe(400);
    expect((await api(ana).post('/invitation', { friendName: beto.userName })).status).toBe(201);
    expect((await api(ana).post('/invitation', { friendName: beto.userName })).status).toBe(409);

    const id = (await api(beto).get()).body.incoming[0]._id;
    await api(beto).post(`/invitation/${id}/accept`);
    expect((await api(ana).post('/invitation', { friendName: beto.userName })).status).toBe(409);
  });

  it('if the other player had already asked you, sending a request accepts theirs', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');
    await api(ana).post('/invitation', { friendName: beto.userName });
    const res = await api(beto).post('/invitation', { friendName: ana.userName });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);
    expect(await areFriends(ana.id, beto.id)).toBe(true);
    expect((await api(ana).get()).body.outgoing).toEqual([]);
  });

  it('the sender can cancel a request nobody has answered', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');
    await api(ana).post('/invitation', { friendName: beto.userName });
    const id = (await api(ana).get()).body.outgoing[0]._id;
    expect((await api(beto).del(`/invitation/${id}`)).status).toBe(404);
    expect((await api(ana).del(`/invitation/${id}`)).status).toBe(200);
    expect((await api(beto).get()).body.incoming).toEqual([]);
  });

  it('removing a friend ends the friendship for both', async () => {
    const ana = await player('Ana');
    const beto = await player('Beto');
    await api(ana).post('/invitation', { friendName: beto.userName });
    await api(beto).post('/invitation', { friendName: ana.userName });

    expect((await api(beto).del(`/${ana.id}`)).status).toBe(200);
    expect((await api(ana).get()).body.friends).toEqual([]);
    expect(await areFriends(ana.id, beto.id)).toBe(false);
    expect((await api(beto).del(`/${ana.id}`)).status).toBe(404);
    expect((await api(beto).del('/not-an-id')).status).toBe(404);
  });
});
