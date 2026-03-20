import { BrevoClient } from "@getbrevo/brevo";
import { SendTransacEmailResponse } from "../../node_modules/@getbrevo/brevo/dist/cjs/api";

if (!process.env.BREVO_API_KEY) {
  throw new Error("BREVO_API_KEY environment variable is not set");
}

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const SENDER = { name: "Victhon", email: "noreply@victhon.co" };
const LOGO_URL = "https://res.cloudinary.com/dquiwougr/image/upload/v1773849444/logo_ogpivr.png";
const BRAND_GREEN = "#003b14"; // Your Dark Green

/**
 * Shared Email Wrapper (The Shell)
 */
const emailWrapper = (content: string) => `
  <div style="background-color: #f4f4f4; padding: 30px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
      <div style="padding: 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;">
        <img src="${LOGO_URL}" alt="Victhon" style="width: 75px; height: auto; display: block; margin: 0 auto;" />
      </div>
      
      <div style="padding: 35px 30px;">
        ${content}
      </div>
      
      <div style="padding: 20px; text-align: center; background-color: #fafafa; border-top: 1px solid #eeeeee;">
        <p style="margin: 0; font-size: 12px; color: #999999;">
          © ${new Date().getFullYear()} Victhon. All rights reserved.
        </p>
        <p style="margin: 5px 0 0; font-size: 10px; color: #cccccc;">
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
    htmlContent: emailWrapper(htmlContent),
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
      <h2 style="margin-top: 0; color: ${BRAND_GREEN}; font-size: 22px;">Verify your email</h2>
      <p style="font-size: 16px; color: #555;">Please use the following One-Time Password (OTP) to complete your verification. This code is valid for 10 minutes.</p>
      <div style="margin: 30px 0; padding: 25px; background-color: #f0f5f1; border: 1px solid ${BRAND_GREEN}; border-radius: 8px; text-align: center;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: ${BRAND_GREEN};">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #777;">Enter this code on the verification screen to continue.</p>
    `,
  });

export const sendPasswordOTP = (email: string, otp: string): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Reset your password — Victhon",
    htmlContent: `
      <h2 style="margin-top: 0; color: ${BRAND_GREEN}; font-size: 22px;">Password Reset</h2>
      <p style="font-size: 16px; color: #555;">You requested to reset your password. Use the code below to proceed:</p>
      <div style="margin: 30px 0; padding: 25px; background-color: #f0f5f1; border: 1px dashed ${BRAND_GREEN}; border-radius: 8px; text-align: center;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: ${BRAND_GREEN};">${otp}</span>
      </div>
      <p style="font-size: 14px; color: #777;">If you did not request this reset, your account is safe and you can ignore this email.</p>
    `,
  });

export const sendAdminCredentials = (email: string, name: string, password: string): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: "Your Super Admin Account — Victhon",
    htmlContent: `
      <h2 style="margin-top: 0; color: ${BRAND_GREEN};">Welcome, ${name}!</h2>
      <p style="font-size: 16px; color: #555;">A Super Admin account has been successfully created for you. Below are your temporary login credentials:</p>
      <div style="margin: 25px 0; padding: 20px; background-color: #f9f9f9; border-radius: 8px; border: 1px solid #dddddd;">
        <p style="margin: 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 10px 0 0; font-size: 14px;"><strong>Password:</strong> <code style="background: #eeeeee; padding: 4px 8px; border-radius: 4px; border: 1px solid #cccccc;">${password}</code></p>
      </div>
      <a href="https://admin.victhon.co/login" style="display: inline-block; padding: 14px 35px; background-color: ${BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Login to Dashboard</a>
      <p style="font-size: 12px; color: #cc0000; margin-top: 25px;">* Please change your password immediately after your first login.</p>
    `,
  });

export const sendChatNotification = (email: string, receiverName: string, senderName: string, content: string | null): Promise<SendTransacEmailResponse> =>
  sendEmail({
    to: email,
    subject: `New message from ${senderName}`,
    htmlContent: `
      <h2 style="margin-top: 0; color: ${BRAND_GREEN};">New Message</h2>
      <p style="font-size: 16px; color: #555;">Hi ${receiverName}, you have received a new message from <strong>${senderName}</strong>:</p>
      <div style="margin: 20px 0; padding: 20px; background-color: #f9f9f9; border-left: 5px solid ${BRAND_GREEN}; border-radius: 4px; font-style: italic; color: #444;">
        "${content || 'Sent an attachment...'}"
      </div>
      <a href="https://victhon.co/chat" style="display: inline-block; padding: 14px 35px; background-color: ${BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">View Message</a>
    `,
  });