import { and, eq } from "drizzle-orm";
import { isUuid } from "~~/shared/validation";

/** Human description for an invoice type, used on the detail view + PDF. */
export function invoiceDescription(type: string): string {
  switch (type) {
    case "build":
      return "Website build";
    case "hosting":
      return "Hosting service";
    case "database":
      return "Database hosting";
    case "domain":
      return "Domain renewal";
    case "feature":
      return "Feature / change request";
    case "care":
      return "Care plan";
    default:
      return type;
  }
}

/**
 * GET /api/account/invoice?id=... — a single invoice owned by the signed-in
 * customer, with derived line items for the detail view.
 */
export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  if (!customer) {
    throw createError({ statusCode: 404, statusMessage: "Account not found." });
  }

  const id = getQuery(event).id as string | undefined;
  if (!id) {
    throw createError({
      statusCode: 422,
      statusMessage: "An `id` is required.",
    });
  }
  if (!isUuid(id)) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found." });
  }

  const db = useDb();
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.id, id),
        eq(schema.invoices.customerId, customer.id),
      ),
    )
    .limit(1);

  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found." });
  }

  return {
    invoice,
    customer: {
      name: customer.name,
      email: customer.email,
      company: customer.company,
    },
    lineItems: [
      {
        description: invoiceDescription(invoice.type),
        amountCents: invoice.amountCents,
      },
    ],
  };
});
