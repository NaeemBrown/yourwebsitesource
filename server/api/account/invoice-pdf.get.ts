import { and, eq } from "drizzle-orm";
import { isUuid } from "~~/shared/validation";
import { renderInvoicePdf } from "../../utils/pdf";
import { invoiceDescription } from "./invoice.get";

/**
 * GET /api/account/invoice-pdf?id=... — downloadable PDF for an invoice owned
 * by the signed-in customer.
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

  const pdf = await renderInvoicePdf({
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
  });

  setHeader(event, "content-type", "application/pdf");
  setHeader(
    event,
    "content-disposition",
    `attachment; filename="invoice-${String(invoice.number).padStart(5, "0")}.pdf"`,
  );
  return pdf;
});
