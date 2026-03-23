/**
 * Shared send implementation used by `scripts/sendEmail.ts` and `scripts/orchestrate.ts`
 * so successful sends can record provider + message id in send history.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import type { DigestEmailProvider } from "../../types/schedule";
import type { SendMode } from "../../types/send";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");

export interface SendDigestResult {
  provider: DigestEmailProvider;
  messageId?: string;
  mode: SendMode;
  delivered: boolean;
  recipients: string[];
}

export async function sendDigest(root: string = ROOT): Promise<SendDigestResult> {
  const htmlPath = process.env.DIGEST_HTML_PATH ?? path.join(root, "output", "digest.html");
  const textPath = process.env.DIGEST_TEXT_PATH ?? path.join(root, "output", "digest.txt");

  if (!existsSync(htmlPath)) {
    throw new Error(`Missing HTML digest at ${htmlPath}. Run: npm run pipeline`);
  }

  const html = readFileSync(htmlPath, "utf-8");
  const text = existsSync(textPath) ? readFileSync(textPath, "utf-8") : "";

  const subject = process.env.EMAIL_SUBJECT ?? "Globo News 24";
  const modeRaw = (process.env.SEND_MODE ?? "live").trim().toLowerCase();
  const mode: SendMode =
    modeRaw === "test" || modeRaw === "dry-run" || modeRaw === "live" ? modeRaw : "live";

  const liveRecipients = process.env.EMAIL_TO?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const testRecipientsExplicit =
    process.env.SEND_TEST_TO?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  // Test mode: SEND_TEST_TO if set, else same inbox(es) as EMAIL_TO so `npm run send:test` works with a normal .env
  const testRecipients =
    testRecipientsExplicit.length > 0 ? testRecipientsExplicit : liveRecipients;
  const to = mode === "test" ? testRecipients : liveRecipients;
  const from = process.env.EMAIL_FROM?.trim();

  if (to.length === 0 || !from) {
    if (mode === "test") {
      throw new Error(
        "Set EMAIL_FROM and either SEND_TEST_TO or EMAIL_TO for SEND_MODE=test (recipients were empty)"
      );
    }
    throw new Error("Set EMAIL_TO and EMAIL_FROM in environment or .env");
  }

  const allow = process.env.SEND_ALLOWLIST?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (allow.length > 0) {
    const matchesAllow = (email: string): boolean => {
      const lower = email.toLowerCase();
      return allow.some((a) => {
        const rule = a.toLowerCase();
        if (rule.includes("@")) return lower === rule;
        return lower.endsWith(`@${rule}`);
      });
    };
    const blocked = to.filter((r) => !matchesAllow(r));
    if (blocked.length > 0) {
      throw new Error(`Recipient(s) blocked by SEND_ALLOWLIST: ${blocked.join(", ")}`);
    }
  }

  if (mode === "live") {
    const requireConfirm = (process.env.SEND_REQUIRE_CONFIRM ?? "false").trim().toLowerCase();
    const needsConfirm = requireConfirm === "1" || requireConfirm === "true" || requireConfirm === "yes";
    if (needsConfirm && process.env.SEND_CONFIRM !== "SEND") {
      throw new Error("SEND_REQUIRE_CONFIRM is enabled. Set SEND_CONFIRM=SEND to proceed.");
    }
  }

  if (mode === "dry-run") {
    console.log("[sendEmail] DRY-RUN — validated digest + recipients; no email sent");
    return { provider: "smtp", mode, delivered: false, recipients: to };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();

  if (resendKey) {
    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text: text || undefined,
    });
    if (error) {
      throw new Error(`Resend error: ${JSON.stringify(error)}`);
    }
    const toList = to.join(", ");
    console.log(
      `[sendEmail] Sent via Resend id=${data?.id ?? "?"} mode=${mode} from=${from} to=${toList} subject="${subject.slice(0, 72)}${subject.length > 72 ? "…" : ""}"`
    );
    console.log(
      "[sendEmail] Not in inbox? 1) Resend → Emails (search by id) 2) Gmail: Promotions/Spam 3) With onboarding@resend.dev, set EMAIL_TO to the same address you used to sign up at resend.com — see docs/RESEND.md"
    );
    return { provider: "resend", messageId: data?.id, mode, delivered: true, recipients: to };
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  if (!smtpHost) {
    throw new Error(
      "No email provider configured. Add RESEND_API_KEY to .env (recommended — see docs/RESEND.md), " +
        "or configure SMTP: SMTP_HOST, SMTP_PORT, and usually SMTP_USER + SMTP_PASSWORD. " +
        "The previous default (localhost:587) is not used anymore to avoid confusing connection errors."
    );
  }

  const host = smtpHost;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASSWORD ?? "").trim();
  if (!user || !pass) {
    throw new Error(
      "SMTP_HOST is set but SMTP_USER or SMTP_PASSWORD is empty (e.g. Gmail needs an app password). " +
        "Add RESEND_API_KEY to use Resend instead, or comment out SMTP_HOST in .env until SMTP is configured. " +
        "See docs/RESEND.md."
    );
  }
  const secure = process.env.SMTP_SECURE === "true";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    requireTLS: process.env.SMTP_REQUIRE_TLS === "true",
  });

  const info = await transporter.sendMail({
    from,
    to: to.join(", "),
    subject,
    text: text || undefined,
    html,
  });

  console.log("[sendEmail] Sent via SMTP", host, port, info.messageId ?? "", `mode=${mode}`);
  return { provider: "smtp", messageId: info.messageId, mode, delivered: true, recipients: to };
}
