// Welcome email, sent through SendGrid when a player registers.
//
// Needs, in the backend .env:
//   SENDGRID_API_KEY — an API key with "Mail Send" permission (starts with "SG.");
//   EMAIL            — the sender address, verified in SendGrid (Single Sender or domain).
// Optional:
//   SENDGRID_WELCOME_TEMPLATE_ID — a dynamic template "d-..." (gets {{userName}}); without it the
//                                  email below (HTML + plain text, built here) is sent.
//
// It never gets in the way of registering: the caller doesn't wait for it, and every failure is
// caught here and logged (without the key or any other secret). Not configured: one log line, and
// nothing is sent.
const sendgrid = require('@sendgrid/mail');

const SUBJECT = '¡Bienvenido a PixelQuest!';

let warned = false;
let keySet = false;

function isConfigured() {
  const key = process.env.SENDGRID_API_KEY;
  return !!(key && key.startsWith('SG.') && process.env.EMAIL);
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function welcomeText(userName) {
  return [
    `¡Hola, ${userName}!`,
    '',
    'Tu cuenta de PixelQuest ya está lista. Para empezar tienes 1000 monedas en tu bolsa.',
    '',
    'Qué puedes hacer ahora:',
    '- Abrir cofres en la Tienda y empezar tu colección.',
    '- Montar tu primer mazo y retar al bot de la taberna.',
    '- Añadir amigos, desafiarles a duelos e intercambiar cartas repetidas.',
    '- Vender tus copias repetidas en el Mercado.',
    '',
    '¡Nos vemos en la taberna!',
    'El equipo de PixelQuest',
  ].join('\n');
}

function welcomeHtml(userName) {
  const name = escapeHtml(userName);
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#1b1420;font-family:Georgia,'Times New Roman',serif;color:#f3e7c9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#1b1420;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#2a1f30;border:3px solid #c9a24a;">
        <tr><td style="padding:24px 28px 8px;text-align:center;">
          <h1 style="margin:0;font-size:26px;color:#ffd977;">¡Bienvenido a PixelQuest!</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 24px;font-size:16px;line-height:1.5;">
          <p>¡Hola, <strong>${name}</strong>!</p>
          <p>Tu cuenta ya está lista. Para empezar tienes <strong>1000 monedas</strong> en tu bolsa.</p>
          <p>Qué puedes hacer ahora:</p>
          <ul style="padding-left:20px;margin:0 0 16px;">
            <li>Abrir cofres en la Tienda y empezar tu colección.</li>
            <li>Montar tu primer mazo y retar al bot de la taberna.</li>
            <li>Añadir amigos, desafiarles a duelos e intercambiar cartas repetidas.</li>
            <li>Vender tus copias repetidas en el Mercado.</li>
          </ul>
          <p style="margin-bottom:0;">¡Nos vemos en la taberna!<br/>El equipo de PixelQuest</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeMessage(to, userName) {
  const templateId = process.env.SENDGRID_WELCOME_TEMPLATE_ID;
  if (templateId) {
    return { to, from: process.env.EMAIL, templateId, dynamicTemplateData: { userName } };
  }
  return { to, from: process.env.EMAIL, subject: SUBJECT, text: welcomeText(userName), html: welcomeHtml(userName) };
}

// Resolves to { sent: true } / { skipped: true } / { error: true }; never rejects.
const sendWelcomeEmail = async (to, userName) => {
  if (!isConfigured()) {
    if (!warned) {
      console.warn('Email de bienvenida desactivado: faltan SENDGRID_API_KEY (SG....) y/o EMAIL en el .env del backend.');
      warned = true;
    }
    return { skipped: true };
  }
  try {
    if (!keySet) {
      sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
      keySet = true;
    }
    await sendgrid.send(buildWelcomeMessage(to, userName || 'aventurero'));
    return { sent: true };
  } catch (err) {
    // SendGrid's error body lists what was wrong (sender not verified, bad template...) and holds
    // no secrets; the key itself is never logged.
    const details = err && err.response && err.response.body && err.response.body.errors;
    console.error('Error al enviar el email de bienvenida:', details ? details.map((e) => e.message).join('; ') : (err && err.message) || err);
    return { error: true };
  }
};

module.exports = sendWelcomeEmail;
module.exports.isConfigured = isConfigured;
module.exports.buildWelcomeMessage = buildWelcomeMessage;
