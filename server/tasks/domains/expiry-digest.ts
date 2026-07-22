import { asc } from "drizzle-orm";
import { useDb, schema } from "../../utils/db";
import { buildDomainDigest } from "../../utils/domain-digest";
import { sendEmail, getMailAdmin } from "../../utils/email";
import { domainExpiryDigestEmail } from "../../utils/email-templates";

/**
 * Scheduled task: weekly domain-expiry digest to the admin inbox
 * (audit §3.7). Domains are registered/renewed manually at the registrar, so
 * this is the safety net that keeps renewals from slipping — it lists every
 * managed domain that is expired or expires within 30 days.
 *
 * Configured in nuxt.config.ts to run Mondays at 07:00. Sends nothing when no
 * domain needs attention.
 */
export default defineTask({
  meta: {
    name: "domains:expiry-digest",
    description: "Email the admin a weekly digest of expiring domains.",
  },
  async run() {
    const admin = getMailAdmin();
    if (!admin) {
      console.warn("[domains:expiry-digest] MAIL_ADMIN not set; skipping.");
      return { result: "skipped: MAIL_ADMIN not set" };
    }

    const db = useDb();
    const [domainRows, customerRows] = await Promise.all([
      db.select().from(schema.domains).orderBy(asc(schema.domains.expiresAt)),
      db
        .select({ id: schema.customers.id, name: schema.customers.name })
        .from(schema.customers),
    ]);
    const nameById = new Map(customerRows.map((c) => [c.id, c.name]));

    const digest = buildDomainDigest(
      domainRows.map((d) => ({
        fqdn: d.fqdn,
        customerName: nameById.get(d.customerId) ?? "—",
        expiresAt: d.expiresAt,
        autoRenew: d.autoRenew,
      })),
    );

    if (digest.total === 0) {
      console.info("[domains:expiry-digest] nothing expiring within 30 days.");
      return { result: "nothing expiring" };
    }

    const mail = domainExpiryDigestEmail({ digest });
    const sent = await sendEmail({ to: admin, ...mail });
    const summary = `expired=${digest.expired.length} urgent=${digest.urgent.length} upcoming=${digest.upcoming.length} sent=${sent.ok}`;
    console.info(`[domains:expiry-digest] ${summary}`);
    return { result: summary };
  },
});
