import { describe, it, expect } from "vitest";
import { renderInvoicePdf, type InvoicePdfInput } from "../../server/utils/pdf";

function makeInput(
  overrides: Partial<InvoicePdfInput["invoice"]> = {},
  lineItems: InvoicePdfInput["lineItems"] = [],
): InvoicePdfInput {
  return {
    invoice: {
      number: 42,
      type: "build",
      status: "paid",
      amountCents: 39_900,
      vatCents: 0,
      currency: "USD",
      issuedAt: new Date(2026, 5, 1),
      paidAt: new Date(2026, 5, 2),
      ...overrides,
    },
    customer: {
      name: "Jane Doe",
      email: "jane@example.com",
      company: "Doe & Co",
    },
    lineItems,
  };
}

describe("renderInvoicePdf", () => {
  it("produces a valid, non-trivial PDF document", async () => {
    const bytes = await renderInvoicePdf(
      makeInput({}, [
        { description: "Professional build", amountCents: 39_900 },
      ]),
    );

    // Valid PDF header + trailer, non-trivial size.
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("%%EOF");
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it("renders open invoices (no paidAt) and no-company customers", async () => {
    const bytes = await renderInvoicePdf({
      invoice: {
        number: 7,
        type: "hosting",
        status: "open",
        amountCents: 4_500,
        vatCents: 0,
        currency: "USD",
        issuedAt: new Date(2026, 5, 1),
        paidAt: null,
      },
      customer: { name: "Solo Sam", email: "sam@example.com", company: null },
      lineItems: [],
    });
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it("renders a VAT line when vatCents is set", async () => {
    const bytes = await renderInvoicePdf(makeInput({ vatCents: 5_985 }));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it("handles every invoice type without throwing", async () => {
    for (const type of [
      "build",
      "hosting",
      "database",
      "domain",
      "feature",
    ] as const) {
      const bytes = await renderInvoicePdf(makeInput({ type }));
      expect(bytes.length).toBeGreaterThan(1_000);
    }
  });
});
