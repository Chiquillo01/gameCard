const sendgrid = require('@sendgrid/mail');

// Welcome email through SendGrid. It needs, in the backend .env:
//   SENDGRID_API_KEY — an API key with "Mail Send" permission (starts with "SG.");
//   EMAIL            — the sender address, verified in SendGrid (Single Sender or domain);
//   SENDGRID_WELCOME_TEMPLATE_ID (optional) — the dynamic template, "d-..." (defaults to the one
//                      the project was built with, which must exist in that SendGrid account).
// Without the key/sender it doesn't try to send at all: it says so once in the server log, and
// registration carries on normally.
const DEFAULT_TEMPLATE_ID = 'd-88253b5135d245879f9cd3d23ead5191';

let warned = false;
let keySet = false;

function isConfigured() {
  const key = process.env.SENDGRID_API_KEY;
  return !!(key && key.startsWith('SG.') && process.env.EMAIL);
}

const sendWelcomeEmail = async (to, userName) => {
  if (!isConfigured()) {
    if (!warned) {
      console.warn('Email de bienvenida desactivado: faltan SENDGRID_API_KEY (SG....) y/o EMAIL en el .env del backend.');
      warned = true;
    }
    return { skipped: true };
  }
  if (!keySet) {
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    keySet = true;
  }
  const msg = {
    from: process.env.EMAIL,
    personalizations: [
      {
        to: [{ email: to }],
        dynamic_template_data: { userName },
      },
    ],
    template_id: process.env.SENDGRID_WELCOME_TEMPLATE_ID || DEFAULT_TEMPLATE_ID,
  };
  return sendgrid.send(msg);
};

module.exports = sendWelcomeEmail;
module.exports.isConfigured = isConfigured;
