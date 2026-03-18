import { BrevoClient } from "@getbrevo/brevo";
import { SendTransacEmailResponse } from "../../node_modules/@getbrevo/brevo/dist/cjs/api";

if (!process.env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY environment variable is not set");
}

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const SENDER = { name: "Victhon", email: "noreply@victhon.co" };
// Update this URL with your actual hosted logo URL
const LOGO_URL = "https://res.cloudinary.com/dquiwougr/image/upload/v1773849444/logo_ogpivr.png";

/**
 * Shared Email Wrapper (The Shell)
 */
const emailWrapper = (content: string) => `
  <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <div style="padding: 30px 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #f0f0f0;">
        <img src="${LOGO_URL}" alt="Victhon" style="width: 140px; height: auto; display: block; margin: 0 auto;" />
      </div>
      
      <div style="padding: 40px 50px;">
        ${content}
      </div>
      
      <div style="padding: 20px; text-align: center; background-color: #fcfcfc; border-top: 1px solid #f0f0f0;">
        <p style="margin: 0; font-size: 13px; color: #999999;">
          © ${new Date().getFullYear()} Victhon. All rights reserved.
        </p>
        <p style="margin: 5px 0 0; font-size: 11px; color: #bbbbbb;">
          If you didn't request this email, please ignore it.
        </p>
      </div>
    </div>
  </div>
`;

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
    htmlContent: emailWrapper(htmlContent), // Wraps all templates in the shared UI
  };

  try {
    const data = await brevo.transactionalEmails.sendTransacEmail(sendSmtpEmail);
    console.log("✅ Email sent to:", to);
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Email send failed:", errorMessage);
    throw error;
  }
};

/**
 * TEMPLATES
 */

export const sendOTP = (email: string, otp: string): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Verify your email — Victhon",
    htmlContent: `
      <h2 style="margin-top: 0; color: #1a1a1a;">Verify your email</h2>
      <p style="font-size: 16px; color: #555;">Please use the following One-Time Password (OTP) to complete your verification. This code is valid for 10 minutes.</p>
      <div style="margin: 30px 0; padding: 20px; background-color: #f4fbf6; border: 1px dashed #1a5c2d; border-radius: 8px; text-align: center;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a5c2d;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #777;">Enter this code on the verification screen to continue.</p>
    `,
  });

export const sendPasswordOTP = (email: string, otp: string): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email, subject: "Reset your password — Victhon",
    htmlContent: `
      <h2 style="margin-top: 0; color: #1a1a1a;">Password Reset</h2>
      <p style="font-size: 16px; color: #555;">You requested to reset your password. Use the code below to proceed:</p>
      <div style="margin: 30px 0; padding: 20px; background-color: #fff9f4; border: 1px dashed #d97706; border-radius: 8px; text-align: center;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d97706;">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #777;">If you did not request this reset, your account is safe and you can ignore this email.</p>
    `,
  });

export const sendAdminCredentials = (email: string, name: string, password: string): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Your Super Admin Account — Victhon",
    htmlContent: `
      <h2 style="margin-top: 0; color: #1a1a1a;">Welcome, ${name}!</h2>
      <p style="font-size: 16px; color: #555;">A Super Admin account has been successfully created for you. Below are your temporary login credentials:</p>
      <div style="margin: 25px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 10px 0 0; font-size: 14px;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
      </div>
      <a href="https://admin.victhon.co/login" style="display: inline-block; padding: 14px 28px; background-color: #1a5c2d; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Login to Dashboard</a>
      <p style="font-size: 13px; color: #ef4444; margin-top: 20px;">* Please change your password immediately after your first login.</p>
    `,
  });

export const sendChatNotification = (email: string, receiverName: string, senderName: string, content: string | null): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: `New message from ${senderName}`,
    htmlContent: `
      <h2 style="margin-top: 0; color: #1a1a1a;">New Message</h2>
      <p style="font-size: 16px; color: #555;">Hi ${receiverName}, you have received a new message from <strong>${senderName}</strong>:</p>
      <div style="margin: 20px 0; padding: 20px; background-color: #f9f9f9; border-left: 4px solid #1a5c2d; border-radius: 4px; font-style: italic; color: #444;">
        "${content || 'Sent an attachment...'}"
      </div>
      <a href="https://victhon.co/chat" style="display: inline-block; padding: 14px 28px; background-color: #1a5c2d; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">View Message</a>
    `,
  });
