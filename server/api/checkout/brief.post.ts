import { isValidEmail } from "../../../shared/validation";
import { getBuildPackage } from "../../../shared/billing";

interface BriefPayload {
  email?: string;
  planKey?: string;
  answers?: Record<string, unknown>;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<BriefPayload>(event);
    const email = body?.email?.trim().toLowerCase() ?? "";
    const planKey = body?.planKey?.trim() ?? "";
    const answers = body?.answers;

    if (!isValidEmail(email) || !getBuildPackage(planKey) || !answers) {
      throw createError({
        statusCode: 422,
        statusMessage: "A valid email, plan, and project brief are required.",
      });
    }

    // The middleware size guard only sees Content-Length, which chunked
    // requests omit — bound the stored payload here too.
    if (JSON.stringify(answers).length > 32_000) {
      throw createError({
        statusCode: 413,
        statusMessage: "Project brief is too large.",
      });
    }

    const [brief] = await useDb()
      .insert(schema.checkoutBriefs)
      .values({ email, planKey, answers })
      .returning({ id: schema.checkoutBriefs.id });

    if (!brief) {
      throw createError({
        statusCode: 500,
        statusMessage: "Could not save project brief.",
      });
    }

    // Alert the business so the team can start work immediately. Never block the
    // response on mail delivery — the brief is already safely stored above.
    const admin = getMailAdmin();
    if (admin) {
      const pkg = getBuildPackage(planKey);
      const summary =
        typeof answers.summary === "string" && answers.summary.trim()
          ? answers.summary
          : JSON.stringify(answers, null, 2);
      const alert = briefAlertEmail({
        email,
        planLabel: pkg?.label ?? planKey,
        message: summary,
      });
      void sendEmail({ to: admin, replyTo: email, ...alert });
    }

    return { id: brief.id };
  } catch (err) {
    toSafeError(err, "checkout/brief", "Could not save project brief.");
  }
});
