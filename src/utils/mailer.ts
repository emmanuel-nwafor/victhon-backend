import { BrevoClient } from "@getbrevo/brevo";
import { SendTransacEmailResponse } from "../../node_modules/@getbrevo/brevo/dist/cjs/api";

if (!process.env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY environment variable is not set");
}

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const SENDER = { name: "Victhon", email: "noreply@victhon.co" };

/**
 * Base email sender.
 * Fix: sendOTP and sendPasswordOTP were near-identical — consolidated into one helper.
 */
const sendEmail = async ({
  to,
  subject,
  htmlContent,
}: {
  to: string;
  subject: string;
  htmlContent: string;
}) => {
  const sendSmtpEmail = {
    sender: SENDER,
    to: [{ email: to }],
    subject,
    htmlContent,
  };

  try {
    const data =
      await brevo.transactionalEmails.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent to:", to);
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Email send failed:", errorMessage);
    throw error;
  }
};

const otpTemplate = (otp: string, title: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
    <h1 style="color: #333;">Victhon</h1>
    <p>${title}</p>
    <div style="background:#f4f4f4; padding:20px; border-radius:8px; margin-top:16px;">
      <p style="font-size:22px; font-weight:bold; letter-spacing:4px; color:#222;">${otp}</p>
      <p style="color:#666; font-size:13px;">This OTP expires in <strong>10 minutes</strong>.</p>
      <p style="color:#666; font-size:13px;">If you did not request this, please ignore this email.</p>
    </div>
    <p style="color:#aaa; font-size:12px; margin-top:24px;">© Victhon</p>
  </div>
`;

const adminCreatedTemplate = (
  name: string,
  email: string,
  password: string,
) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
    <h1 style="color: #333;">Victhon</h1>
    <p>Hi ${name},</p>
    <p>A Super Admin account has been created for you.</p>
    <ul>
      <li><strong>Email:</strong> ${email}</li>
      <li><strong>Password:</strong> ${password}</li>
    </ul>
    <p>Please log in and change your password immediately.</p>
    <p style="color:#aaa; font-size:12px; margin-top:24px;">© Victhon</p>
  </div>
`;

export const sendOTP = (
  email: string,
  otp: string,
): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Verify your email — Victhon",
    htmlContent: otpTemplate(
      otp,
      "Please verify your email address using the OTP below:",
    ),
  });

export const sendPasswordOTP = (
  email: string,
  otp: string,
): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Reset your password — Victhon",
    htmlContent: otpTemplate(
      otp,
      "You requested a password reset. Use the OTP below:",
    ),
  });

export const sendAdminCredentials = (
  email: string,
  name: string,
  password: string,
): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Your Super Admin Account — Victhon",
    htmlContent: adminCreatedTemplate(name, email, password),
  });
