jest.mock('@sendgrid/mail', () => ({ setApiKey: jest.fn(), send: jest.fn() }));

const KEYS = ['SENDGRID_API_KEY', 'EMAIL', 'SENDGRID_WELCOME_TEMPLATE_ID'];
const FAKE_KEY = 'SG.test-key-not-real';

// A fresh copy of the service for each test (it remembers whether it already warned / set the key).
function load(env = {}) {
  KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  let service;
  let sendgrid;
  jest.isolateModules(() => {
    sendgrid = require('@sendgrid/mail');
    service = require('../../services/sendgrid');
  });
  sendgrid.send.mockReset();
  sendgrid.setApiKey.mockReset();
  return { sendWelcomeEmail: service, sendgrid };
}

describe('Welcome email', () => {
  const saved = {};
  beforeAll(() => KEYS.forEach((k) => { saved[k] = process.env[k]; }));
  afterAll(() => KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));
  let warn;
  let error;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('without the key or the sender it sends nothing and says so once', async () => {
    const { sendWelcomeEmail, sendgrid } = load({ EMAIL: 'hola@pixelquest.test' });
    expect(await sendWelcomeEmail('a@b.test', 'Ana')).toEqual({ skipped: true });
    expect(await sendWelcomeEmail('c@d.test', 'Carlos')).toEqual({ skipped: true });
    expect(sendgrid.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);

    const noSender = load({ SENDGRID_API_KEY: FAKE_KEY });
    expect(await noSender.sendWelcomeEmail('a@b.test', 'Ana')).toEqual({ skipped: true });
    expect(noSender.sendgrid.send).not.toHaveBeenCalled();
  });

  it('sends a Spanish HTML + text email built in code, with the name escaped', async () => {
    const { sendWelcomeEmail, sendgrid } = load({ SENDGRID_API_KEY: FAKE_KEY, EMAIL: 'hola@pixelquest.test' });
    sendgrid.send.mockResolvedValue([{ statusCode: 202 }]);
    expect(await sendWelcomeEmail('ana@b.test', 'Ana <b>')).toEqual({ sent: true });
    expect(sendgrid.setApiKey).toHaveBeenCalledWith(FAKE_KEY);
    const msg = sendgrid.send.mock.calls[0][0];
    expect(msg).toMatchObject({ to: 'ana@b.test', from: 'hola@pixelquest.test', subject: '¡Bienvenido a PixelQuest!' });
    expect(msg.text).toContain('¡Hola, Ana <b>!');
    expect(msg.html).toContain('Ana &lt;b&gt;');
    expect(msg.html).not.toContain('Ana <b>');
    expect(msg.templateId).toBeUndefined();
  });

  it('uses the dynamic template only when SENDGRID_WELCOME_TEMPLATE_ID is set', async () => {
    const { sendWelcomeEmail, sendgrid } = load({ SENDGRID_API_KEY: FAKE_KEY, EMAIL: 'hola@pixelquest.test', SENDGRID_WELCOME_TEMPLATE_ID: 'd-123' });
    sendgrid.send.mockResolvedValue([{ statusCode: 202 }]);
    await sendWelcomeEmail('ana@b.test', 'Ana');
    expect(sendgrid.send.mock.calls[0][0]).toEqual({ to: 'ana@b.test', from: 'hola@pixelquest.test', templateId: 'd-123', dynamicTemplateData: { userName: 'Ana' } });
  });

  it('a SendGrid failure is logged (without the key) and never thrown', async () => {
    const { sendWelcomeEmail, sendgrid } = load({ SENDGRID_API_KEY: FAKE_KEY, EMAIL: 'hola@pixelquest.test' });
    sendgrid.send.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { body: { errors: [{ message: 'The from address does not match a verified Sender Identity' }] } } }));
    expect(await sendWelcomeEmail('ana@b.test', 'Ana')).toEqual({ error: true });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = error.mock.calls[0].join(' ');
    expect(logged).toContain('verified Sender Identity');
    expect(logged).not.toContain(FAKE_KEY);
  });
});
