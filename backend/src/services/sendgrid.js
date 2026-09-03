const sendgrid = require('@sendgrid/mail');
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

const sendWelcomeEmail = (to, userName) => {
  const msg = {
    from: process.env.EMAIL,
    personalizations: [
      {
        to: [
          {
            email: to,
          },
        ],
        dynamic_template_data: {
          userName,
        },
      },
    ],
    template_id: 'd-88253b5135d245879f9cd3d23ead5191',
  };
  return sendgrid.send(msg);
};

module.exports = sendWelcomeEmail;
