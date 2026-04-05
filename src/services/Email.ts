import { BrevoClient } from "@getbrevo/brevo";
import path from "path";
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
    this.client = new BrevoClient({
      apiKey: apiKey || "",
    });
  }

  /**
   * Core Wrapper: High-contrast hero layout inspired by modern SaaS templates.
   * Provides a "Free" look by using a clean white background and bold headers.
   */
  private emailWrapper(content: string, heroTitle?: string) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #ffffff; }
          .main-container { width: 100%; max-width: 700px; margin: 0 auto; }
          .stack-column { display: block; width: 100%; vertical-align: middle; }
          @media screen and (max-width: 600px) {
            .column-mobile { width: 100% !important; display: block !important; padding: 15px 0 !important; }
            .content-area { padding: 40px 20px !important; }
            .hero-text { font-size: 32px !important; }
          }
        </style>
      </head>
      <body>
        <div class="main-container">
          <div style="padding: 24px 40px;">
            <img src="${this.LOGO_URL}" alt="Victhon" width="32" style="display: block;" />
          </div>

          ${heroTitle ? `
          <div style="background-color: ${this.BRAND_GREEN}; padding: 70px 40px; color: #ffffff;">
            <h1 class="hero-text" style="margin: 0; font-size: 46px; font-weight: 800; line-height: 1.1; letter-spacing: -1.5px;">
              ${heroTitle}
            </h1>
          </div>
          ` : ''}

          <div class="content-area" style="padding: 60px 40px;">
            ${content}
          </div>

          <div style="padding: 50px 40px; border-top: 1px solid #f1f5f9; text-align: center;">
             <div style="margin-bottom: 24px;">
                <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="18" style="opacity: 0.4;"></a>
                <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/3256/3256013.png" width="18" style="opacity: 0.4;"></a>
                <a href="#" style="margin: 0 10px; text-decoration: none;"><img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="18" style="opacity: 0.4;"></a>
             </div>
             <p style="font-size: 12px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0;">Follow Us On</p>
             <p style="font-size: 11px; color: #cbd5e1; margin-top: 15px;">&copy; ${this.YEAR} Victhon Ecosystems. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  public async sendEmail(to: string, subject: string, html: string, heroTitle?: string) {
    try {
      const result = await this.client.transactionalEmails.sendTransacEmail({
        sender: this.SENDER,
        to: [{ email: to }],
        subject: subject,
        htmlContent: this.emailWrapper(html, heroTitle),
      });
      logger.info(`✅ Email sent to: ${to}`);
      return result;
    } catch (error) {
      logger.error(`❌ Email send failed to ${to}:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  public async sendWelcomeEmail(email: string, name: string) {
    const images = [
      "https://i.pinimg.com/1200x/c3/c7/35/c3c735c3d76c5ab378c5d4f80b8ca632.jpg",
      "https://i.pinimg.com/1200x/c2/02/3a/c2023a189dc06d49885d7e314bffd751.jpg",
      "https://i.pinimg.com/1200x/97/31/02/973102b2429ee16287e6775a1497c22e.jpg"
    ];

    const welcomeContent = `
      <p style="font-size: 19px; color: #475569; line-height: 1.6; margin-bottom: 60px;">
        Hello ${name}, welcome to the ecosystem. Victhon is more than a platform—it’s a commitment to professional excellence. We understand the friction of modern service delivery, and we’ve built the solution.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 70px;">
        <tr>
          <td class="column-mobile" width="55%" style="vertical-align: middle;">
            <h2 style="margin: 0 0 15px; font-size: 26px; color: #0f172a; font-weight: 800; letter-spacing: -0.5px;">Precision Matching</h2>
            <p style="margin: 0; font-size: 16px; color: #64748b; line-height: 1.8; padding-right: 30px;">
              Our vetting process is relentless. We curate a network of professionals who aren't just "available," but are the absolute top-tier in their respective fields.
            </p>
          </td>
          <td class="column-mobile" width="45%">
            <img src="${images[0]}" width="100%" style="border-radius: 4px; display: block;" alt="Talent" />
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 70px;">
        <tr>
          <td class="column-mobile" width="45%">
            <img src="${images[1]}" width="100%" style="border-radius: 4px; display: block;" alt="Work" />
          </td>
          <td class="column-mobile" width="55%" style="vertical-align: middle;">
            <div style="padding-left: 30px;" class="column-mobile">
              <h2 style="margin: 0 0 15px; font-size: 26px; color: #0f172a; font-weight: 800; letter-spacing: -0.5px;">Centralized Clarity</h2>
              <p style="margin: 0; font-size: 16px; color: #64748b; line-height: 1.8;">
                From high-fidelity file transfers to real-time milestone tracking, our dashboard ensures you spend less time managing and more time building.
              </p>
            </div>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 80px;">
        <tr>
          <td class="column-mobile" width="55%" style="vertical-align: middle;">
            <h2 style="margin: 0 0 15px; font-size: 26px; color: #0f172a; font-weight: 800; letter-spacing: -0.5px;">Escrow Protection</h2>
            <p style="margin: 0; font-size: 16px; color: #64748b; line-height: 1.8; padding-right: 30px;">
              Trust is built into the code. Our automated escrow system holds capital securely, releasing it only when you’ve verified that the work meets your standard.
            </p>
          </td>
          <td class="column-mobile" width="45%">
            <img src="${images[2]}" width="100%" style="border-radius: 4px; display: block;" alt="Security" />
          </td>
        </tr>
      </table>

      <div style="background-color: #fcfcfc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 45px; text-align: left;">
        <h3 style="margin: 0 0 15px; color: #0f172a; font-size: 22px; font-weight: 800;">Getting Started</h3>
        <p style="margin: 0 0 20px; font-size: 16px; color: #475569; line-height: 1.8;">
          Your workspace is ready for you. We recommend completing your profile to unlock our advanced matching features. By detailing your specific requirements, you allow our system to pinpoint the perfect collaborators for your next big project.
        </p>
        <p style="margin: 0 0 20px; font-size: 16px; color: #475569; line-height: 1.8;">
          We are here to support your growth. If you have any questions or need a personal walkthrough of our enterprise features, simply reply to this email.
        </p>
        <p style="margin: 40px 0 0; font-size: 16px; font-weight: 800; color: #0f172a;">Respectfully,</p>
        <p style="margin: 5px 0 0; font-size: 16px; color: ${this.BRAND_GREEN}; font-weight: 700;">The Victhon Team</p>
      </div>
    `;

    return this.sendEmail(email, "Welcome to Victhon", welcomeContent, "The future of service starts here.");
  }

  public async sendOTP(email: string, otp: string) {
    const html = `
      <div style="text-align: left;">
        <h2 style="margin: 0 0 15px; font-size: 24px; color: #0f172a; font-weight: 800;">Verify your account</h2>
        <p style="font-size: 16px; color: #475569; line-height: 1.7; margin-bottom: 30px;">
          To ensure the security of your Victhon ecosystem account, we require a quick verification. 
          Please enter the unique six-digit synchronization code provided below into the verification 
          prompt on our platform. 
        </p>
        
        <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; padding: 40px; border-radius: 16px; display: inline-block; width: 100%; box-sizing: border-box; text-align: left;">
          <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 2px;">Your Verification Code</p>
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 52px; font-weight: 800; letter-spacing: 12px; color: ${this.BRAND_GREEN}; line-height: 1;">${otp}</span>
        </div>

        <div style="margin-top: 30px;">
          <p style="font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 10px;">
            <strong>Note:</strong> This code is strictly time-sensitive and will expire in 10 minutes. 
            For your protection, never share this code with anyone, including members of the Victhon support team.
          </p>
          <p style="font-size: 14px; color: #94a3b8;">
            If you did not initiate this request, you can safely ignore this email or contact our security 
            ops team if you suspect unauthorized access.
          </p>
        </div>
      </div>
    `;
    return this.sendEmail(email, "Verify your email — Victhon", html, "Security Synchronization");
  }

  public async sendPasswordOTP(email: string, otp: string) {
    const html = `
      <div style="text-align: center;">
        <p style="font-size: 18px; color: #475569; margin-bottom: 40px;">We received a request to reset your password. If this was you, use the code below:</p>
        <div style="background-color: #f8fafc; border: 2px dashed #e2e8f0; padding: 50px 20px; border-radius: 16px; display: inline-block; width: 100%; box-sizing: border-box;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 52px; font-weight: 800; letter-spacing: 15px; color: #0f172a;">${otp}</span>
        </div>
        <p style="margin-top: 40px; font-size: 14px; color: #94a3b8;">If you didn't request this, please ignore this email.</p>
      </div>
    `;
    return this.sendEmail(email, "Reset your password — Victhon", html, "Password Reset");
  }

  public async sendPinResetOTP(email: string, otp: string) {
    const html = `
      <div style="text-align: center;">
        <p style="font-size: 18px; color: #475569; margin-bottom: 40px;">Your security is our priority. Enter this code to reset your transaction PIN:</p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 50px 20px; border-radius: 16px; display: inline-block; width: 100%; box-sizing: border-box;">
          <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 2px;">Verification Code</p>
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 52px; font-weight: 800; letter-spacing: 15px; color: ${this.BRAND_GREEN};">${otp}</span>
        </div>
      </div>
    `;
    return this.sendEmail(email, "Transaction PIN Reset — Victhon", html, "Secure PIN Reset");
  }

  public async sendAdminCredentials(email: string, name: string, password: string) {
    const html = `
      <h2 style="margin: 0 0 20px; font-size: 24px; color: #0f172a;">Administrative Access Granted</h2>
      <p style="margin: 0 0 30px; font-size: 16px; color: #475569;">Hello ${name}, your Super Admin account for Victhon is ready. Please secure these credentials immediately.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; margin-bottom: 40px;">
        <p style="margin: 0 0 15px; font-size: 15px; color: #64748b;"><strong>Access Email:</strong> ${email}</p>
        <p style="margin: 0; font-size: 15px; color: #64748b;"><strong>Temporary Key:</strong> <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; color: #0f172a;">${password}</code></p>
      </div>
      <a href="https://admin.victhon.co/login" style="display: block; text-align: center; padding: 20px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800; font-size: 16px;">Access Admin Dashboard</a>
    `;
    return this.sendEmail(email, "Your Super Admin Account — Victhon", html, "Welcome, Administrator");
  }

  public async sendChatNotification(email: string, receiverName: string, senderName: string, content: string | null) {
    const html = `
      <p style="margin: 0 0 30px; font-size: 17px; color: #475569;">Hi ${receiverName}, <strong>${senderName}</strong> just reached out to you:</p>
      <div style="background-color: #f8fafc; border-left: 6px solid ${this.BRAND_GREEN}; padding: 30px; border-radius: 4px 16px 16px 4px; margin-bottom: 40px;">
        <p style="margin: 0; font-size: 16px; color: #334155; line-height: 1.6; font-style: italic;">"${content || 'Sent an attachment...'}"</p>
      </div>
      <a href="https://victhon.co/chat" style="display: inline-block; padding: 18px 40px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 800;">View Message</a>
    `;
    return this.sendEmail(email, `New message from ${senderName}`, html, "New Notification");
  }
}