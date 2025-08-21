
const { Resend } = require('resend');

const resend = new Resend('re_FAqhVTxR_94XsJbHmSrXuA1e2bRNqoSA5');

/**
 * Send an email using Resend
 * @param {string|string[]} to - recipient email(s)
 * @param {string} subject - email subject
 * @param {string} html - html body
 * @param {string} [from='onboarding@resend.dev'] - sender (use your verified domain in prod)
 */
async function sendEmail(to, subject, html, from = 'onboarding@resend.dev') {
  try {
    const data = await resend.emails.send({ from, to, subject, html });
    console.log('✅ Email sent:', data?.id || data);
    return data;
  } catch (err) {
    console.error('❌ Failed to send email:', err);
    throw err;
  }
}

module.exports = { sendEmail };
