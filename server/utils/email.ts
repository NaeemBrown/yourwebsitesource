import { Resend } from "resend";

/**
 * Thin transactional-email wrapper around Resend (plan §1, Phase 1).
 *
 * Reads configuration from the environment:
 *  - RESEND_API_KEY — your Resend API key (required to actually send).
 *  - MAIL_FROM       — the verified From address, e.g.
 *                      "TheWebsiteForge <hello@pixelatedindustries.com>".
 *  - MAIL_ADMIN      — where internal alerts (new leads) are delivered.
 *
 * Design choices:
 *  - Sending must NEVER break the request that triggered it. Every send is
 *    wrapped so a mail failure is logged and swallowed — a lead is still saved
 *    even if the notification email fails.
 *  - In local dev without RESEND_API_KEY, we log the email to the console
 *    instead of throwing, so the contact form still works offline.
 */

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export function getMailFrom(): string {
  // Fallback to Resend's sandbox sender so dev sends still work pre-domain-verify.
  return process.env.MAIL_FROM || "TheWebsiteForge <onboarding@resend.dev>";
}

export function getMailAdmin(): string | null {
  return process.env.MAIL_ADMIN || null;
}

/** Public-facing support address used as Reply-To on customer emails. */
export function getSupportEmail(): string | undefined {
  return process.env.MAIL_SUPPORT || process.env.MAIL_ADMIN || undefined;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback (improves deliverability). */
  text?: string;
  /** Override the default From address if needed. */
  from?: string;
  /** Set a Reply-To (e.g. the lead's address on an admin alert). */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Send a transactional email. Resolves to a result object rather than throwing,
 * so callers can fire-and-forget without risking the parent request.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const resend = getResend();

  if (!resend) {
    // No API key configured — log and skip rather than crash (dev-friendly).
    console.info(
      `[email] RESEND_API_KEY not set; skipping send to ${String(input.to)} — "${input.subject}"`,
    );
    return { ok: false, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: input.from || getMailFrom(),
      to: input.to,
      // Subjects interpolate user-supplied names/titles; strip CR/LF so a
      // crafted value can never smuggle extra headers past the provider.
      subject: input.subject.replace(/[\r\n]+/g, " ").trim(),
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });

    if (error) {
      console.error("[email] Resend returned an error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] send failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
