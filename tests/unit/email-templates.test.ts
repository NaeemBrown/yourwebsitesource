import { describe, it, expect } from "vitest";
import {
  leadAlertEmail,
  leadConfirmationEmail,
  briefAlertEmail,
  receiptEmail,
  walletTopupEmail,
  lowBalanceEmail,
  suspensionEmail,
  serviceRestoredEmail,
  serviceCanceledEmail,
  changeQuoteEmail,
  changeApprovedEmail,
  adminOverdueAlertEmail,
  formatMoney,
  esc,
} from "../../server/utils/email-templates";

describe("esc", () => {
  it("escapes all HTML-significant characters (used by ad-hoc admin alerts)", () => {
    expect(esc(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
    );
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc("plain text")).toBe("plain text");
  });
});

describe("email templates", () => {
  it("escape user-supplied HTML in the lead alert", () => {
    const mail = leadAlertEmail({
      name: "<script>alert(1)</script>",
      email: "evil@example.com",
      company: "<img src=x onerror=alert(1)>",
      budget: null,
      message: "Hello <b>world</b> & friends",
    });
    expect(mail.html).not.toContain("<script>alert(1)</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&amp; friends");
  });

  it("every builder returns subject, html, and a plain-text fallback", () => {
    const mails = [
      leadConfirmationEmail({ name: "Jane Doe" }),
      leadAlertEmail({
        name: "Jane",
        email: "j@x.com",
        message: "hi there friend",
      }),
      briefAlertEmail({
        email: "j@x.com",
        planLabel: "Starter",
        message: "Build me a site please.",
      }),
      receiptEmail({
        name: "Jane",
        description: "Website build",
        amountCents: 24_900,
        currency: "USD",
        reference: "twf_1",
      }),
      walletTopupEmail({
        name: "Jane",
        amountCents: 5_000,
        balanceAfterCents: 6_000,
        reference: "twf_2",
      }),
      lowBalanceEmail({
        name: "Jane",
        balanceCents: 100,
        serviceLabel: "Dynamic Hosting",
        chargeCents: 4_500,
        graceDays: 10,
        topupUrl: "https://x/account",
      }),
      suspensionEmail({
        name: "Jane",
        siteName: "My Site",
        topupUrl: "https://x/account",
      }),
      serviceRestoredEmail({ name: "Jane", siteName: "My Site" }),
      serviceCanceledEmail({
        name: "Jane",
        serviceLabel: "Dynamic Hosting",
        paidThrough: new Date(),
      }),
      changeQuoteEmail({
        name: "Jane",
        title: "Blog section",
        quotedCents: 9_500,
        accountUrl: "https://x/account",
      }),
      changeApprovedEmail({
        name: "Jane",
        title: "Blog section",
        amountCents: 9_500,
        balanceAfterCents: 500,
      }),
      adminOverdueAlertEmail({
        customerName: "Jane",
        customerEmail: "j@x.com",
        serviceLabel: "Dynamic Hosting",
        balanceCents: 100,
        chargeCents: 4_500,
        stage: "grace",
        graceDays: 10,
      }),
      adminOverdueAlertEmail({
        customerName: "Jane",
        customerEmail: "j@x.com",
        serviceLabel: "Dynamic Hosting",
        balanceCents: 0,
        chargeCents: 4_500,
        stage: "suspended",
        siteName: "My Site",
      }),
    ];
    for (const mail of mails) {
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.html).toContain("<!doctype html>");
      expect(mail.text.length).toBeGreaterThan(10);
    }
  });

  it("low-balance email states the grace window and amounts", () => {
    const mail = lowBalanceEmail({
      name: "Jane",
      balanceCents: 1_00,
      serviceLabel: "Dynamic Hosting",
      chargeCents: 4_500,
      graceDays: 10,
      topupUrl: "https://example.com/account",
    });
    expect(mail.html).toContain("10 days");
    expect(mail.html).toContain("$45.00");
    expect(mail.html).toContain("Dynamic Hosting");
    expect(mail.html).toContain("https://example.com/account");
  });

  it("low-balance email warns about suspension after the grace window", () => {
    const mail = lowBalanceEmail({
      name: "Jane",
      balanceCents: 0,
      serviceLabel: "Dynamic Hosting",
      chargeCents: 4_500,
      graceDays: 10,
      topupUrl: null,
    });
    expect(mail.text).toMatch(/suspended/i);
    expect(mail.text).toContain("10 days");
  });

  it("quote email states the amount and that nothing is charged until approval", () => {
    const mail = changeQuoteEmail({
      name: "Jane",
      title: "Dark mode toggle",
      quotedCents: 9_500,
      accountUrl: "https://example.com/account",
    });
    expect(mail.html).toContain("$95.00");
    expect(mail.html).toContain("Dark mode toggle");
    expect(mail.text).toMatch(/Nothing is charged until you approve/i);
    expect(mail.html).toContain("https://example.com/account");
  });

  it("admin overdue alerts distinguish grace from suspension", () => {
    const grace = adminOverdueAlertEmail({
      customerName: "Jane",
      customerEmail: "j@x.com",
      serviceLabel: "Hosting",
      balanceCents: 100,
      chargeCents: 4_500,
      stage: "grace",
      graceDays: 10,
    });
    expect(grace.subject).toMatch(/^Overdue:/);
    expect(grace.text).toContain("10-day grace");

    const suspended = adminOverdueAlertEmail({
      customerName: "Jane",
      customerEmail: "j@x.com",
      serviceLabel: "Hosting",
      balanceCents: 0,
      chargeCents: 4_500,
      stage: "suspended",
      siteName: "My Site",
    });
    expect(suspended.subject).toMatch(/^Suspended:/);
    expect(suspended.text).toContain("My Site");
  });

  it("greets by first name and falls back to 'there'", () => {
    expect(leadConfirmationEmail({ name: "Jane Doe" }).text).toContain("Jane");
    expect(
      receiptEmail({
        name: null,
        description: "x",
        amountCents: 100,
        currency: "USD",
        reference: "r",
      }).text,
    ).toContain("there");
  });
});

describe("formatMoney", () => {
  it("formats known currencies", () => {
    expect(formatMoney(24_900, "USD")).toBe("$249.00");
    expect(formatMoney(85_100, "ZAR")).toContain("851");
  });

  it("handles unknown currency codes without throwing", () => {
    // Well-formed 3-letter codes are formatted by Intl ("WAT 12.34");
    // malformed codes hit the plain-number fallback.
    expect(formatMoney(1_234, "WAT")).toContain("12.34");
    expect(formatMoney(1_234, "??")).toBe("12.34 ??");
  });
});
