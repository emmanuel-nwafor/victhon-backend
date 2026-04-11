import { BrevoClient } from "@getbrevo/brevo";
import env, { EnvKey } from "../config/env";
import logger from "../config/logger";

export default class Email {
  private readonly client: BrevoClient;
  private readonly SENDER = { name: "Victhon", email: "noreply@victhon.co" };
  private readonly LOGO_URL = "https://res.cloudinary.com/dquiwougr/image/upload/v1773849444/logo_ogpivr.png";
  private readonly BRAND_GREEN = "#003b14";
  private readonly YEAR = new Date().getFullYear();

  constructor() {
    const apiKey = env(EnvKey.BREVO_API_KEY);
    if (!apiKey) {
      logger.warn("BREVO_API_KEY is not set. Email service will not function.");
    }
    this.client = new BrevoClient({ apiKey: apiKey || "" });
  }

  /**
   * Core email wrapper with optional green hero banner.
   */
  private emailWrapper(content: string, heroTitle?: string) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #ffffff; }
          .main-container { width: 100%; max-width: 680px; margin: 0 auto; }
          @media screen and (max-width: 600px) {
            .content-area { padding: 40px 20px !important; }
            .hero-text { font-size: 32px !important; }
          }
        </style>
      </head>
      <body>
        <div class="main-container">

          <!-- Logo -->
          <div style="padding: 24px 40px;">
            <img src="${this.LOGO_URL}" alt="Victhon" width="32" style="display: block;" />
          </div>

          <!-- Hero Banner (conditional) -->
          ${heroTitle ? `
          <div style="background-color: ${this.BRAND_GREEN}; padding: 64px 40px;">
            <h1 class="hero-text" style="margin: 0; font-size: 44px; font-weight: 800; color: #ffffff; line-height: 1.1; letter-spacing: -1.5px;">${heroTitle}</h1>
          </div>
          ` : ""}

          <!-- Body Content -->
          <div class="content-area" style="padding: 56px 40px;">
            ${content}
          </div>

          <!-- Footer -->
          <div style="padding: 40px; border-top: 1px solid #f1f5f9; text-align: center;">
            <div style="margin-bottom: 20px;">
              <a href="https://instagram.com/victhon" style="margin: 0 8px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="18" style="opacity: 0.4;" alt="IG"></a>
              <a href="https://twitter.com/victhon" style="margin: 0 8px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/3256/3256013.png" width="18" style="opacity: 0.4;" alt="X"></a>
              <a href="https://facebook.com/victhon" style="margin: 0 8px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="18" style="opacity: 0.4;" alt="FB"></a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">&copy; ${this.YEAR} Victhon.co. All rights reserved.</p>
            <p style="font-size: 11px; color: #cbd5e1; margin: 8px 0 0;">If you didn't expect this email, you can safely ignore it.</p>
          </div>

        </div>
      </body>
      </html>
    `;
  }

  public async sendEmail(to: string, subject: string, html: string, heroTitle?: string, attachments?: { content: string; name: string }[]) {
    try {
      const emailParams: any = {
        sender: this.SENDER,
        to: [{ email: to }],
        subject: subject,
        htmlContent: this.emailWrapper(html, heroTitle),
      };

      if (attachments && attachments.length > 0) {
        emailParams.attachment = attachments;
      }

      const result = await this.client.transactionalEmails.sendTransacEmail(emailParams);
      logger.info(`✅ Email sent to: ${to}`);
      return result;
    } catch (error) {
      logger.error(`❌ Email send failed to ${to}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // ─── Welcome Email ────────────────────────────────────────────────────────────

  public async sendWelcomeEmail(email: string, name: string) {
    const images = [
      "https://i.pinimg.com/1200x/c3/c7/35/c3c735c3d76c5ab378c5d4f80b8ca632.jpg",
      "https://i.pinimg.com/1200x/c2/02/3a/c2023a189dc06d49885d7e314bffd751.jpg",
      "https://i.pinimg.com/1200x/97/31/02/973102b2429ee16287e6775a1497c22e.jpg",
    ];

    // Images are capped at 200px height with cover to prevent tall distortion
    const imgCss = "display: block; border-radius: 12px; width: 100%; height: 200px; object-fit: cover; object-position: center;";

    const html = `
      <p style="font-size: 17px; color: #475569; line-height: 1.7; margin: 0 0 56px;">
        Hi <strong style="color: #0f172a;">${name}</strong>, welcome to Victhon — a platform built to connect everyday people with skilled, vetted professionals for any service they need, right in their city.
      </p>

      <!-- Feature 1: Browse & Book -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 56px;">
        <tr><td style="padding-bottom: 16px;">
          <img src="${images[0]}" alt="Browse professionals" style="${imgCss}" />
        </td></tr>
        <tr><td>
          <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: ${this.BRAND_GREEN}; text-transform: uppercase; letter-spacing: 2px;">Browse &amp; Book</p>
          <h2 style="margin: 0 0 10px; font-size: 20px; color: #0f172a; font-weight: 800; letter-spacing: -0.3px;">Find a Professional Near You</h2>
          <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.7;">
            Need a cleaner, electrician, plumber, tailor or any other skilled hand? Browse verified provider profiles, check their ratings and reviews, and book in minutes — all within the app.
          </p>
        </td></tr>
      </table>

      <!-- Feature 2: Real-Time Chat -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 56px;">
        <tr><td style="padding-bottom: 16px;">
          <img src="${images[1]}" alt="Chat with providers" style="${imgCss}" />
        </td></tr>
        <tr><td>
          <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: ${this.BRAND_GREEN}; text-transform: uppercase; letter-spacing: 2px;">Real-Time Chat</p>
          <h2 style="margin: 0 0 10px; font-size: 20px; color: #0f172a; font-weight: 800; letter-spacing: -0.3px;">Communicate Before You Commit</h2>
          <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.7;">
            Every booking starts with a conversation. Use our built-in messaging to discuss your job, share photos, agree on details, and align expectations — all before any money changes hands.
          </p>
        </td></tr>
      </table>

      <!-- Feature 3: Escrow Payments -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 56px;">
        <tr><td style="padding-bottom: 16px;">
          <img src="${images[2]}" alt="Secure payments" style="${imgCss}" />
        </td></tr>
        <tr><td>
          <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: ${this.BRAND_GREEN}; text-transform: uppercase; letter-spacing: 2px;">Safe Payments</p>
          <h2 style="margin: 0 0 10px; font-size: 20px; color: #0f172a; font-weight: 800; letter-spacing: -0.3px;">Pay with Full Confidence</h2>
          <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.7;">
            Your money is always protected. Victhon holds payments in secure escrow and only releases funds to the provider once you confirm the job is done to your satisfaction. No disputes, no stress.
          </p>
        </td></tr>
      </table>

      <!-- CTA -->
      <div style="text-align: center; margin-bottom: 56px;">
        <a href="https://victhon.co" style="display: inline-block; padding: 16px 44px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px;">
          Start Exploring Victhon
        </a>
      </div>

      <!-- Sign-off -->
      <div style="border-top: 1px solid #f1f5f9; padding-top: 32px;">
        <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
          Need help getting started? Reach us at <a href="mailto:support@victhon.co" style="color: ${this.BRAND_GREEN}; text-decoration: none;">support@victhon.co</a>
        </p>
        <p style="margin: 16px 0 0; font-size: 15px; font-weight: 700; color: #0f172a;">The Victhon Team</p>
      </div>
    `;

    return this.sendEmail(email, "Welcome to Victhon — Let's get you started", html, `Welcome, ${name}.`);
  }

  // ─── OTP: Account Verification ───────────────────────────────────────────────

  public async sendOTP(email: string, otp: string) {
    const html = `
      <h2 style="margin: 0 0 15px; font-size: 24px; color: #0f172a; font-weight: 800;">Verify your account</h2>
      <p style="font-size: 16px; color: #475569; line-height: 1.7; margin-bottom: 30px;">
        To ensure the security of your Victhon account, please enter the 6-digit code below on the verification screen. This code expires in <strong>10 minutes</strong>.
      </p>

      <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; padding: 36px; border-radius: 16px; margin-bottom: 28px;">
        <p style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 2px;">Your Verification Code</p>
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 48px; font-weight: 800; letter-spacing: 10px; color: ${this.BRAND_GREEN}; line-height: 1;">${otp}</span>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
        <strong>Security notice:</strong> Never share this code with anyone — including Victhon support. If you didn't request this, you can safely ignore this email.
      </p>
    `;
    return this.sendEmail(email, "Verify your email — Victhon", html, "Verify Your Account");
  }

  // ─── OTP: Password Reset ──────────────────────────────────────────────────────

  public async sendPasswordOTP(email: string, otp: string) {
    const html = `
      <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 30px;">
        We received a request to reset the password on your Victhon account. Use the code below to proceed. It expires in <strong>10 minutes</strong>.
      </p>

      <div style="background-color: #f8fafc; border: 2px dashed #e2e8f0; padding: 36px; border-radius: 16px; margin-bottom: 28px; text-align: center;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 48px; font-weight: 800; letter-spacing: 12px; color: #0f172a; line-height: 1;">${otp}</span>
      </div>

      <p style="font-size: 13px; color: #94a3b8;">If you didn't request this, your account is safe — you can ignore this email.</p>
    `;
    return this.sendEmail(email, "Reset your password — Victhon", html, "Password Reset");
  }

  // ─── OTP: Transaction PIN Reset ───────────────────────────────────────────────

  public async sendPinResetOTP(email: string, otp: string) {
    const html = `
      <p style="font-size: 16px; color: #475569; line-height: 1.7; margin: 0 0 30px;">
        We received a request to reset the Transaction PIN on your Victhon provider account. Enter the code below to confirm it was you. Expires in <strong>10 minutes</strong>.
      </p>

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 36px; border-radius: 16px; margin-bottom: 28px; text-align: center;">
        <p style="margin: 0 0 10px; font-size: 12px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 2px;">PIN Reset Code</p>
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 48px; font-weight: 800; letter-spacing: 12px; color: ${this.BRAND_GREEN}; line-height: 1;">${otp}</span>
      </div>

      <div style="padding: 16px 20px; background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px;">
        <p style="margin: 0; font-size: 13px; color: #92400e;">
          ⚠️ <strong>Never share this code with anyone</strong>, including Victhon support. If you did not initiate this request, contact us immediately at <a href="mailto:support@victhon.co" style="color: #92400e;">support@victhon.co</a>.
        </p>
      </div>
    `;
    return this.sendEmail(email, "Transaction PIN Reset — Victhon", html, "Secure PIN Reset");
  }

  // ─── Admin Credentials ────────────────────────────────────────────────────────

  public async sendAdminCredentials(email: string, name: string, password: string) {
    const html = `
      <h2 style="margin: 0 0 16px; font-size: 22px; color: #0f172a; font-weight: 800;">Administrative Access Granted</h2>
      <p style="margin: 0 0 28px; font-size: 16px; color: #475569; line-height: 1.6;">
        Hello ${name}, your Super Admin account for Victhon is ready. Please secure these credentials immediately and change your password on first login.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; margin-bottom: 36px;">
        <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 3px 8px; border-radius: 4px; color: #0f172a;">${password}</code></p>
      </div>
      <a href="https://admin.victhon.co/login" style="display: block; text-align: center; padding: 18px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px;">Access Admin Dashboard</a>
    `;
    return this.sendEmail(email, "Your Super Admin Account — Victhon", html, "Welcome, Administrator");
  }

  // ─── Chat Notification ────────────────────────────────────────────────────────

  public async sendChatNotification(email: string, receiverName: string, senderName: string, content: string | null) {
    const html = `
      <p style="margin: 0 0 28px; font-size: 16px; color: #475569; line-height: 1.6;">
        Hi ${receiverName}, <strong style="color: #0f172a;">${senderName}</strong> just sent you a message on Victhon:
      </p>
      <div style="background-color: #f8fafc; border-left: 5px solid ${this.BRAND_GREEN}; padding: 24px 28px; border-radius: 4px 12px 12px 4px; margin-bottom: 36px;">
        <p style="margin: 0; font-size: 15px; color: #334155; line-height: 1.6; font-style: italic;">"${content || "Sent an attachment..."}"</p>
      </div>
      <a href="https://victhon.co/chat" style="display: inline-block; padding: 16px 36px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 15px;">View Message</a>
    `;
    return this.sendEmail(email, `New message from ${senderName} — Victhon`, html, "New Message");
  }
}