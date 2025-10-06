const nodemailer = require('nodemailer');

/*
 * Mailer helper
 *
 * Provides a transport configured from environment variables and
 * convenience functions for sending order confirmation emails to
 * customers and alert emails internally. The transport uses SMTP
 * authentication against Gmail by default but could be adapted to
 * other providers by changing the SMTP_* environment variables. If
 * email sending fails the calling code should not block the
 * response to the client; instead, log the error and record the
 * failure in the order emailStatus field.
 */

// Create a reusable transporter object using SMTP transport. The
// configuration is drawn from environment variables. TLS/SSL is
// automatically negotiated based on the `secure` flag and port.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: String(process.env.SMTP_SECURE || 'true') === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper to send an email using the transporter. Returns a promise
// which resolves on success or rejects on failure.
async function sendMail(to, subject, text, html) {
  const from = process.env.MAIL_FROM || 'Sørgulen Industriservice <no-reply@sorgulen.no>';
  return transporter.sendMail({ from, to, subject, text, html });
}

/**
 * Send a confirmation email to the customer. The email contains
 * basic details about the order and instructs the customer not to
 * reply directly. HTML fallback to plain text ensures clients
 * without HTML support can still read the content.
 * @param {Object} order The order document returned from MongoDB
 */
async function sendCustomerConfirmation(order) {
  const { customer, service, _id } = order;
  const subject = 'Ordrebekreftelse – Sørgulen Industriservice';
  const text = `Hei ${customer.name},\n\nTakk for din bestilling hos Sørgulen Industriservice.\n\n` +
    `Ordrenummer: ${_id}\nTjeneste: ${service}\n` +
    `Vi tar kontakt med deg så snart som mulig for å avtale videre.\n\n` +
    'Dette er en automatisert melding, vennligst ikke svar direkte på denne e-posten.';
  const html = `<p>Hei ${customer.name},</p>` +
    `<p>Takk for din bestilling hos Sørgulen Industriservice.</p>` +
    `<p><strong>Ordrenummer:</strong> ${_id}<br/>` +
    `<strong>Tjeneste:</strong> ${service}</p>` +
    `<p>Vi tar kontakt med deg så snart som mulig for å avtale videre.</p>` +
    '<p>Dette er en automatisert melding, vennligst ikke svar direkte på denne e-posten.</p>';
  await sendMail(customer.email, subject, text, html);
}

/**
 * Send an internal alert email about a new order. This email is
 * directed to the company email configured in COMPANY_EMAIL and
 * includes all submitted details. It also includes a link to the
 * admin dashboard for quick access.
 * @param {Object} order The order document returned from MongoDB
 */
async function sendInternalAlert(order) {
  const to = process.env.COMPANY_EMAIL || process.env.SMTP_USER;
  const { customer, service, details, sourcePage, _id } = order;
  const subject = 'Ny bestilling – Sørgulen Industriservice';
  const adminUrl = `${process.env.BASE_URL || ''}${process.env.ADMIN_BASE_URL || '/admin'}`;
  const text = `Ny bestilling mottatt\n\n` +
    `Ordrenummer: ${_id}\n` +
    `Tjeneste: ${service}\n` +
    `Kunde: ${customer.name} <${customer.email}>\n` +
    `Telefon: ${customer.phone}\n` +
    `Adresse: ${customer.address}, ${customer.zip} ${customer.city}\n` +
    `Detaljer: ${details || ''}\n` +
    `Kildeside: ${sourcePage || ''}\n\n` +
    `Administrasjonsgrensesnitt: ${adminUrl}`;
  const html = `<p>Ny bestilling mottatt</p>` +
    `<p><strong>Ordrenummer:</strong> ${_id}<br/>` +
    `<strong>Tjeneste:</strong> ${service}</p>` +
    `<p><strong>Kunde:</strong> ${customer.name} &lt;${customer.email}&gt;<br/>` +
    `<strong>Telefon:</strong> ${customer.phone}<br/>` +
    `<strong>Adresse:</strong> ${customer.address}, ${customer.zip} ${customer.city}</p>` +
    `<p><strong>Detaljer:</strong> ${details || ''}<br/>` +
    `<strong>Kildeside:</strong> ${sourcePage || ''}</p>` +
    `<p>Administrasjonsgrensesnitt: <a href="${adminUrl}">${adminUrl}</a></p>`;
  await sendMail(to, subject, text, html);
}

module.exports = {
  sendCustomerConfirmation,
  sendInternalAlert,
};