import nodemailer from 'nodemailer';

const configured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
let transporter;
const mailer = () => {
  if (!configured()) return null;
  if (!transporter) transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
  return transporter;
};
const message = (title, copy, url, button) => ({ subject: title, text: `${copy}\n\n${button}: ${url}\n\nSi no solicitaste esto, puedes ignorar este correo.`, html: `<main style="font-family:Arial,sans-serif;color:#143d34;max-width:560px;margin:auto"><h1 style="font-size:28px">FormaIA</h1><p>${copy}</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#c7ef62;color:#143d34;font-weight:bold;text-decoration:none">${button}</a></p><p style="color:#66766f;font-size:13px">Si no solicitaste esto, puedes ignorar este correo.</p></main>` });

export const emailEnabled = () => configured();
export const sendVerificationEmail = async ({ email, name, url }) => {
  const transport = mailer();
  if (!transport) return false;
  await transport.sendMail({ from: process.env.SMTP_FROM, to: email, ...message('Verifica tu correo de FormaIA', `Hola ${name}, confirma tu correo para proteger tu cuenta.`, url, 'Verificar mi correo') });
  return true;
};
export const sendPasswordResetEmail = async ({ email, name, url }) => {
  const transport = mailer();
  if (!transport) return false;
  await transport.sendMail({ from: process.env.SMTP_FROM, to: email, ...message('Restablece tu contraseña de FormaIA', `Hola ${name}, recibimos una solicitud para cambiar tu contraseña. Este enlace vence en 30 minutos.`, url, 'Crear nueva contraseña') });
  return true;
};
