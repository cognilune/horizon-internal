import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] || character,
  );
}

function smtpPort() {
  const value = Number(process.env.SMTP_PORT);
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : 0;
}

export function smtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      smtpPort() &&
      ["true", "false"].includes(process.env.SMTP_SECURE || "") &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD &&
      process.env.AUTH_FROM_EMAIL?.trim(),
  );
}

export async function sendInternalLoginOtp(input: {
  email: string;
  name: string;
  otp: string;
}) {
  if (!smtpConfigured()) throw new Error("SMTP is not configured");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port: smtpPort(),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASSWORD!,
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 12_000,
  });
  try {
    await transport.sendMail({
      from: process.env.AUTH_FROM_EMAIL!.trim(),
      to: input.email,
      subject: "Your Horizon Internal sign-in code",
      text: `Hello ${input.name},\n\nYour Horizon Internal sign-in code is ${input.otp}. It expires in 5 minutes.\n\nDo not share this code. If you did not request it, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#17131b"><h1 style="font-size:26px;color:#17131b">Sign in to Horizon Internal</h1><p>Hello ${escapeHtml(input.name)},</p><p>Enter this one-time code to continue:</p><p style="font-size:34px;letter-spacing:8px;font-weight:700;color:#d43f6c">${input.otp}</p><p>This code expires in 5 minutes. Do not share it. If you did not request it, you can ignore this email.</p></div>`,
    });
  } catch (error) {
    console.error("[horizon-internal-email] SMTP delivery failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    throw new Error("OTP delivery failed");
  } finally {
    transport.close();
  }
}
