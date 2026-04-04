import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import env, { EnvKey } from "../config/env";
import logger from "../config/logger";


export default class Email {

    private readonly transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo, SMTPTransport.Options>;
    private readonly LOGO_URL = "https://res.cloudinary.com/dquiwougr/image/upload/v1773849444/logo_ogpivr.png";
    private readonly BRAND_GREEN = "#003b14";

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: "smtp-relay.brevo.com",
            port: 587,
            secure: false, // TLS
            auth: {
                user: env(EnvKey.SMTP_USER) || 'mirordev@gmail.com',
                pass: env(EnvKey.BREVO_API_KEY) || env(EnvKey.SMTP_PASSWORD),
            },
        });
    }

    private emailWrapper(content: string) {
        return `
          <div style="background-color: #f4f4f4; padding: 30px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
              <div style="padding: 20px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;">
                <img src="${this.LOGO_URL}" alt="Victhon" style="width: 75px; height: auto; display: block; margin: 0 auto;" />
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
    }

    public async getEmailTemplate(data: any, templatePath: string = path.join(__dirname, './../views', "email.ejs")) {
        const htmlContent = await ejs.renderFile(templatePath, data);
        return htmlContent;
    }

    public async sendEmail(to: string, subject: string, html: string) {
        const from = `"Victhon" <${env(EnvKey.SMTP_USER) || 'mirordev@gmail.com'}>`;
        const mailOptions = {
            from: from,
            to: to,
            subject: subject,
            html: this.emailWrapper(html)
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            return info;
        } catch (error) {
            logger.error('Error sending email: ', error);
            return false;
        }
    }

    public async sendOTP(email: string, otp: string) {
        return this.sendEmail(
            email,
            "Verify your email — Victhon",
            `
              <h2 style="margin-top: 0; color: ${this.BRAND_GREEN}; font-size: 22px;">Verify your email</h2>
              <p style="font-size: 16px; color: #555;">Please use the following One-Time Password (OTP) to complete your verification. This code is valid for 10 minutes.</p>
              <div style="margin: 30px 0; padding: 25px; background-color: #f0f5f1; border: 1px solid ${this.BRAND_GREEN}; border-radius: 8px; text-align: center;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: ${this.BRAND_GREEN};">${otp}</span>
              </div>
              <p style="font-size: 14px; color: #777;">Enter this code on the verification screen to continue.</p>
            `
        );
    }

    public async sendPasswordOTP(email: string, otp: string) {
        return this.sendEmail(
            email,
            "Reset your password — Victhon",
            `
              <h2 style="margin-top: 0; color: ${this.BRAND_GREEN}; font-size: 22px;">Password Reset</h2>
              <p style="font-size: 16px; color: #555;">You requested to reset your password. Use the code below to proceed:</p>
              <div style="margin: 30px 0; padding: 25px; background-color: #f0f5f1; border: 1px dashed ${this.BRAND_GREEN}; border-radius: 8px; text-align: center;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: ${this.BRAND_GREEN};">${otp}</span>
              </div>
              <p style="font-size: 14px; color: #777;">If you did not request this reset, your account is safe and you can ignore this email.</p>
            `
        );
    }

    public async sendAdminCredentials(email: string, name: string, password: string) {
        return this.sendEmail(
            email,
            "Your Super Admin Account — Victhon",
            `
              <h2 style="margin-top: 0; color: ${this.BRAND_GREEN};">Welcome, ${name}!</h2>
              <p style="font-size: 16px; color: #555;">A Super Admin account has been successfully created for you. Below are your temporary login credentials:</p>
              <div style="margin: 25px 0; padding: 20px; background-color: #f9f9f9; border-radius: 8px; border: 1px solid #dddddd;">
                <p style="margin: 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 10px 0 0; font-size: 14px;"><strong>Password:</strong> <code style="background: #eeeeee; padding: 4px 8px; border-radius: 4px; border: 1px solid #cccccc;">${password}</code></p>
              </div>
              <a href="https://admin.victhon.co/login" style="display: inline-block; padding: 14px 35px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Login to Dashboard</a>
              <p style="font-size: 12px; color: #cc0000; margin-top: 25px;">* Please change your password immediately after your first login.</p>
            `
        );
    }

    public async sendChatNotification(email: string, receiverName: string, senderName: string, content: string | null) {
        return this.sendEmail(
            email,
            `New message from ${senderName}`,
            `
              <h2 style="margin-top: 0; color: ${this.BRAND_GREEN};">New Message</h2>
              <p style="font-size: 16px; color: #555;">Hi ${receiverName}, you have received a new message from <strong>${senderName}</strong>:</p>
              <div style="margin: 20px 0; padding: 20px; background-color: #f9f9f9; border-left: 5px solid ${this.BRAND_GREEN}; border-radius: 4px; font-style: italic; color: #444;">
                "${content || 'Sent an attachment...'}"
              </div>
              <a href="https://victhon.co/chat" style="display: inline-block; padding: 14px 35px; background-color: ${this.BRAND_GREEN}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">View Message</a>
            `
        );
    }

    public async sendWelcomeEmail(email: string, name: string) {
        const welcomePath = path.join(__dirname, './../views', "welcome.ejs");
        const html = await ejs.renderFile(welcomePath, { name, slogan: "Connecting you to the best service providers." });
        return this.sendEmail(email, "Welcome to Victhon!", html);
    }
}