/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Victhon — Email Broadcast Script
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * USAGE:
 *   npx ts-node src/scripts/send_email.ts --type <emailType> [options]
 *
 * EMAIL TYPES:
 *   otp         → Send an OTP code to an email
 *   welcome     → Send a welcome email to an email
 *   broadcast   → Send a custom message to ALL users & professionals
 *   single      → Send a custom message to a SPECIFIC email address
 *
 * OPTIONS:
 *   --email    <email>        Target email address (required for otp, welcome, single)
 *   --name     <name>        Recipient's name (used in welcome, single emails)
 *   --otp      <code>        4-6 digit OTP code (required for otp type)
 *   --subject  <subject>     Email subject (required for broadcast, single)
 *   --message  <message>     Plain-text body (required for broadcast, single)
 *   --target   all|users|professionals  Who to email in a broadcast (default: all)
 *
 * EXAMPLES:
 *   # Send OTP to test account:
 *   npx ts-node src/scripts/send_email.ts --type otp --email echinecherem729@gmail.com --otp 4829
 *
 *   # Send a welcome email:
 *   npx ts-node src/scripts/send_email.ts --type welcome --email echinecherem729@gmail.com --name Chinecherem
 *
 *   # Broadcast to all users & providers:
 *   npx ts-node src/scripts/send_email.ts --type broadcast --subject "Big News!" --message "We just launched a new feature." --target all
 *
 *   # Broadcast to only providers:
 *   npx ts-node src/scripts/send_email.ts --type broadcast --subject "Payout Update" --message "Your wallet limits have changed." --target professionals
 *
 *   # Send to one specific address:
 *   npx ts-node src/scripts/send_email.ts --type single --email echinecherem729@gmail.com --name Chinecherem --subject "Hello" --message "This is a test."
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as dotenv from "dotenv";
dotenv.config();

import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Professional } from "../entities/Professional";
import Email from "../services/Email";

// ─── Minimal arg parser ───────────────────────────────────────────────────────
function getArg(name: string): string | undefined {
    const argv = process.argv;
    const idx = argv.indexOf(`--${name}`);
    return idx !== -1 ? argv[idx + 1] : undefined;
}

function requireArg(name: string, context: string): string {
    const val = getArg(name);
    if (!val) {
        console.error(`❌ Missing required argument --${name} for type "${context}"`);
        process.exit(1);
    }
    return val;
}

// ─── HTML builder for custom messages ────────────────────────────────────────
function buildCustomHtml(name: string | undefined, message: string): string {
    const greeting = name ? `<p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>` : "";
    return `
        <h2 style="margin-top: 0; color: #003b14; font-size: 22px;">Message from Victhon</h2>
        ${greeting}
        <div style="margin: 20px 0; padding: 20px; background-color: #f9fafb; border-left: 4px solid #003b14; border-radius: 4px; font-size: 15px; color: #374151; line-height: 1.7;">
            ${message.replace(/\n/g, "<br />")}
        </div>
        <p style="margin-top: 24px; font-size: 13px; color: #9CA3AF;">
            This message was sent by the Victhon team.
        </p>
    `;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const type = requireArg("type", "script");
    const emailSvc = new Email();

    // ── 1. OTP email ──────────────────────────────────────────────────────────
    if (type === "otp") {
        const email = requireArg("email", "otp");
        const otp = requireArg("otp", "otp");

        console.log(`\n📨 Sending OTP to ${email}...`);
        await emailSvc.sendOTP(email, otp);
        console.log("✅ Done.");
        return;
    }

    // ── 2. Welcome email ──────────────────────────────────────────────────────
    if (type === "welcome") {
        const email = requireArg("email", "welcome");
        const name = getArg("name") ?? "there";

        console.log(`\n📨 Sending welcome email to ${email}...`);
        await emailSvc.sendWelcomeEmail(email, name);
        console.log("✅ Done.");
        return;
    }

    // ── 3. Single custom email ────────────────────────────────────────────────
    if (type === "single") {
        const email = requireArg("email", "single");
        const subject = requireArg("subject", "single");
        const message = requireArg("message", "single");
        const name = getArg("name");

        console.log(`\n📨 Sending custom email to ${email}...`);
        await (emailSvc as any).sendEmail(email, subject, buildCustomHtml(name, message));
        console.log("✅ Done.");
        return;
    }

    // ── 4. Broadcast ──────────────────────────────────────────────────────────
    if (type === "broadcast") {
        const subject = requireArg("subject", "broadcast");
        const message = requireArg("message", "broadcast");
        const target = getArg("target") ?? "all"; // all | users | professionals

        console.log("\n🔌 Connecting to database...");
        await AppDataSource.initialize();
        console.log("✅ Database connected.\n");

        const recipients: { email: string; name: string }[] = [];

        // Collect customers
        if (target === "all" || target === "users") {
            const users = await AppDataSource.getRepository(User).find({
                where: { isActive: true },
                select: ["id", "email", "firstName", "lastName"],
            });
            for (const u of users) {
                recipients.push({
                    email: u.email,
                    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "Valued Customer",
                });
            }
            console.log(`👤 Found ${users.length} customer(s).`);
        }

        // Collect professionals
        if (target === "all" || target === "professionals") {
            const pros = await AppDataSource.getRepository(Professional).find({
                where: { isActive: true },
                select: ["id", "email", "firstName", "lastName"],
            });
            for (const p of pros) {
                recipients.push({
                    email: p.email,
                    name: [p.firstName, p.lastName].filter(Boolean).join(" ") || "Valued Provider",
                });
            }
            console.log(`🔧 Found ${pros.length} professional(s).`);
        }

        // Deduplicate by email
        const unique = Array.from(
            new Map(recipients.map((r) => [r.email, r])).values()
        );
        console.log(`\n📋 Total recipients: ${unique.length}\n`);

        let sent = 0;
        let failed = 0;

        for (const recipient of unique) {
            try {
                const html = buildCustomHtml(recipient.name, message);
                const result = await (emailSvc as any).sendEmail(recipient.email, subject, html);
                if (result !== false) {
                    console.log(`  ✅ Sent → ${recipient.email}`);
                    sent++;
                } else {
                    console.log(`  ⚠️  Failed → ${recipient.email}`);
                    failed++;
                }
            } catch (err) {
                console.error(`  ❌ Error → ${recipient.email}:`, err);
                failed++;
            }

            // Small delay to avoid Brevo rate limits (3 req/sec on free tier)
            await new Promise((r) => setTimeout(r, 350));
        }

        console.log(`\n─────────────────────────────────`);
        console.log(`📊 Broadcast complete.`);
        console.log(`   ✅ Sent:   ${sent}`);
        console.log(`   ❌ Failed: ${failed}`);
        console.log(`   📬 Total:  ${unique.length}`);

        await AppDataSource.destroy();
        return;
    }

    console.error(`❌ Unknown --type "${type}". Valid types: otp | welcome | single | broadcast`);
    process.exit(1);
}

main().catch((err) => {
    console.error("💥 Script crashed:", err);
    process.exit(1);
});
