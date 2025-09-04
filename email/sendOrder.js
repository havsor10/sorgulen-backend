const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

module.exports = async function({ service, name, phone, email, message }) {
  const mailOptions = {
    from: `Sørgulen Industriservice <${process.env.SMTP_USER}>`,
    to: email,
    subject: `Ordrebekreftelse – ${service}`,
    html: `<p>Hei ${name},</p>
           <p>Takk for din bestilling av <strong>${service}</strong>.</p>
           <p><strong>Navn:</strong> ${name}<br/>
           <strong>Telefon:</strong> ${phone}<br/>
           <strong>Melding:</strong> ${message}</p>
           <p>Vi tar kontakt snart.</p>`
  };
  return transporter.sendMail(mailOptions);
};
