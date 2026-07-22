import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const DAY_MS = 24 * 60 * 60 * 1000;

const demoCustomers = [
  {
    name: "Avery Stone",
    email: "avery.stone@demo.thewebsiteforge.test",
    company: "Nova Dental Studio",
    country: "United States",
    notes: "Business build plus managed dynamic hosting.",
    site: {
      name: "Nova Dental Studio",
      type: "dynamic",
      origin: "built",
      status: "live",
      dbHosting: "none",
      repoUrl: "https://github.com/thewebsiteforge/demo-nova-dental",
      deployUrl: "https://nova-dental.example.com",
      domain: "nova-dental.example.com",
    },
    subscriptions: [
      { plan: "hosting_dynamic", amountCents: 5500, status: "active" },
      { plan: "care_basic", amountCents: 2000, status: "active" },
    ],
    buildCents: 185000,
    domainCostCents: 1299,
  },
  {
    name: "Maya Reddy",
    email: "maya.reddy@demo.thewebsiteforge.test",
    company: "Verdant Market",
    country: "South Africa",
    notes: "App hosting with a self-hosted medium database add-on.",
    site: {
      name: "Verdant Market",
      type: "app",
      origin: "built",
      status: "live",
      dbHosting: "self_hosted",
      repoUrl: "https://github.com/thewebsiteforge/demo-verdant-market",
      deployUrl: "https://verdant-market.example.com",
      domain: "verdant-market.example.com",
    },
    subscriptions: [
      { plan: "hosting_app", amountCents: 12000, status: "active" },
      { plan: "db_medium", amountCents: 2500, status: "active" },
      { plan: "care_plus", amountCents: 6000, status: "active" },
    ],
    buildCents: 420000,
    domainCostCents: 1599,
  },
  {
    name: "Theo Bennett",
    email: "theo.bennett@demo.thewebsiteforge.test",
    company: "Harbor Legal",
    country: "United Kingdom",
    notes: "Static marketing site with annual hosting prepay.",
    site: {
      name: "Harbor Legal",
      type: "static",
      origin: "built",
      status: "live",
      dbHosting: "none",
      repoUrl: "https://github.com/thewebsiteforge/demo-harbor-legal",
      deployUrl: "https://harbor-legal.example.com",
      domain: "harbor-legal.example.com",
    },
    subscriptions: [
      {
        plan: "hosting_static",
        amountCents: 22000,
        status: "active",
        interval: "year",
      },
    ],
    buildCents: 65000,
    domainCostCents: 1199,
  },
  {
    name: "Lina Koh",
    email: "lina.koh@demo.thewebsiteforge.test",
    company: "Pulse Fit",
    country: "Singapore",
    notes: "Brought-in project currently past due on dynamic hosting.",
    site: {
      name: "Pulse Fit Portal",
      type: "dynamic",
      origin: "brought",
      status: "live",
      dbHosting: "none",
      repoUrl: "https://github.com/thewebsiteforge/demo-pulse-fit",
      deployUrl: "https://pulse-fit.example.com",
      domain: "pulse-fit.example.com",
    },
    subscriptions: [
      { plan: "hosting_dynamic", amountCents: 6500, status: "past_due" },
    ],
    buildCents: 0,
    domainCostCents: 1299,
  },
  {
    name: "Noah Williams",
    email: "noah.williams@demo.thewebsiteforge.test",
    company: "Cobalt CRM",
    country: "Canada",
    notes: "App customer using a managed cloud database line item.",
    site: {
      name: "Cobalt CRM",
      type: "app",
      origin: "built",
      status: "live",
      dbHosting: "managed",
      repoUrl: "https://github.com/thewebsiteforge/demo-cobalt-crm",
      deployUrl: "https://cobalt-crm.example.com",
      domain: "cobalt-crm.example.com",
    },
    subscriptions: [
      { plan: "hosting_app", amountCents: 14500, status: "active" },
      { plan: "managed_db_markup", amountCents: 8900, status: "active" },
    ],
    buildCents: 520000,
    domainCostCents: 1899,
  },
  {
    name: "Amara Okafor",
    email: "amara.okafor@demo.thewebsiteforge.test",
    company: "Saffron Table",
    country: "Nigeria",
    notes: "Restaurant ordering build with care plus.",
    site: {
      name: "Saffron Table Orders",
      type: "app",
      origin: "built",
      status: "live",
      dbHosting: "self_hosted",
      repoUrl: "https://github.com/thewebsiteforge/demo-saffron-table",
      deployUrl: "https://saffron-table.example.com",
      domain: "saffron-table.example.com",
    },
    subscriptions: [
      { plan: "hosting_app", amountCents: 12000, status: "active" },
      { plan: "db_small", amountCents: 1000, status: "active" },
      { plan: "care_plus", amountCents: 6000, status: "active" },
    ],
    buildCents: 380000,
    domainCostCents: 1499,
  },
  {
    name: "Elliot Park",
    email: "elliot.park@demo.thewebsiteforge.test",
    company: "Atlas Folio",
    country: "Australia",
    notes: "Portfolio site, currently suspended after non-payment.",
    site: {
      name: "Atlas Folio",
      type: "static",
      origin: "built",
      status: "suspended",
      dbHosting: "none",
      repoUrl: "https://github.com/thewebsiteforge/demo-atlas-folio",
      deployUrl: "https://atlas-folio.example.com",
      domain: "atlas-folio.example.com",
    },
    subscriptions: [
      { plan: "hosting_static", amountCents: 2000, status: "past_due" },
    ],
    buildCents: 65000,
    domainCostCents: 1199,
  },
  {
    name: "Priya Naidoo",
    email: "priya.naidoo@demo.thewebsiteforge.test",
    company: "Lumen Launch",
    country: "South Africa",
    notes: "Recent starter build awaiting first hosting renewal.",
    site: {
      name: "Lumen Launch",
      type: "static",
      origin: "built",
      status: "draft",
      dbHosting: "none",
      repoUrl: "https://github.com/thewebsiteforge/demo-lumen-launch",
      deployUrl: "https://lumen-launch.example.com",
      domain: "lumen-launch.example.com",
    },
    subscriptions: [
      { plan: "hosting_static", amountCents: 2500, status: "active" },
    ],
    buildCents: 65000,
    domainCostCents: 1299,
  },
  {
    name: "Jonas Meyer",
    email: "jonas.meyer@demo.thewebsiteforge.test",
    company: "Northwind Freight",
    country: "Germany",
    notes: "Brought-in logistics app with canceled care add-on.",
    site: {
      name: "Northwind Freight Tracking",
      type: "app",
      origin: "brought",
      status: "live",
      dbHosting: "managed",
      repoUrl: "https://github.com/thewebsiteforge/demo-northwind-freight",
      deployUrl: "https://northwind-freight.example.com",
      domain: "northwind-freight.example.com",
    },
    subscriptions: [
      { plan: "hosting_app", amountCents: 13500, status: "active" },
      { plan: "care_basic", amountCents: 2000, status: "canceled" },
    ],
    buildCents: 0,
    domainCostCents: 1899,
  },
  {
    name: "Grace Kim",
    email: "grace.kim@demo.thewebsiteforge.test",
    company: "Evergreen Stay",
    country: "New Zealand",
    notes: "Booking site with dynamic hosting and upcoming domain expiry.",
    site: {
      name: "Evergreen Stay",
      type: "dynamic",
      origin: "built",
      status: "live",
      dbHosting: "self_hosted",
      repoUrl: "https://github.com/thewebsiteforge/demo-evergreen-stay",
      deployUrl: "https://evergreen-stay.example.com",
      domain: "evergreen-stay.example.com",
    },
    subscriptions: [
      { plan: "hosting_dynamic", amountCents: 7500, status: "active" },
      { plan: "db_small", amountCents: 1000, status: "active" },
    ],
    buildCents: 185000,
    domainCostCents: 1299,
    expiresSoon: true,
  },
];

const demoLeads = [
  {
    name: "Rafael Costa",
    email: "rafael.costa@demo.thewebsiteforge.test",
    company: "Orbit Docs",
    budget: "$1,850 - $5,000",
    message:
      "Need a documentation site and managed hosting for a developer tool launch.",
    status: "new",
  },
  {
    name: "Hannah Brooks",
    email: "hannah.brooks@demo.thewebsiteforge.test",
    company: "Meridian Neo",
    budget: "$5,000+",
    message:
      "Looking for an app landing page, onboarding flow, and recurring hosting.",
    status: "contacted",
  },
  {
    name: "Samir Patel",
    email: "samir.patel@demo.thewebsiteforge.test",
    company: "Ember Coffee",
    budget: "$650 - $1,850",
    message:
      "Small brochure site with domain management and monthly text updates.",
    status: "new",
  },
];

function daysFromNow(days) {
  return new Date(Date.now() + days * DAY_MS);
}

function daysAgo(days) {
  return daysFromNow(-days);
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function paidAtFor(status, date) {
  return status === "paid" ? date : null;
}

function invoiceNumber(index, type) {
  return `demo_${String(index + 1).padStart(2, "0")}_${type}`;
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env first.",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const stats = {
    customers: 0,
    sites: 0,
    domains: 0,
    recurring: 0,
    invoices: 0,
    leads: 0,
  };

  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM leads WHERE source = $1", ["demo_seed"]);
    await client.query("DELETE FROM customers WHERE email = ANY($1::text[])", [
      demoCustomers.map((customer) => customer.email),
    ]);

    for (const [index, customer] of demoCustomers.entries()) {
      const createdAt = daysAgo(110 - index * 8);
      const customerResult = await client.query(
        `INSERT INTO customers (name, email, company, country, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          customer.name,
          customer.email,
          customer.company,
          customer.country,
          customer.notes,
          createdAt,
        ],
      );
      const customerId = customerResult.rows[0].id;
      stats.customers += 1;

      const siteResult = await client.query(
        `INSERT INTO sites
          (customer_id, name, type, origin, status, db_hosting, repo_url, deploy_url, vps_host, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          customerId,
          customer.site.name,
          customer.site.type,
          customer.site.origin,
          customer.site.status,
          customer.site.dbHosting,
          customer.site.repoUrl,
          customer.site.deployUrl,
          index % 2 === 0 ? "eu-vps-01" : "eu-vps-02",
          daysAgo(98 - index * 7),
        ],
      );
      const siteId = siteResult.rows[0].id;
      stats.sites += 1;

      await client.query(
        `INSERT INTO domains
          (customer_id, site_id, fqdn, registrar, registered_at, expires_at, auto_renew, annual_cost_cents, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          customerId,
          siteId,
          customer.site.domain,
          "cloudflare",
          dateOnly(daysAgo(95 - index * 6)),
          dateOnly(
            customer.expiresSoon
              ? daysFromNow(18)
              : daysFromNow(120 + index * 23),
          ),
          true,
          customer.domainCostCents,
          daysAgo(95 - index * 6),
        ],
      );
      stats.domains += 1;

      // Wallet model: seed each service as a recurring wallet charge. Care
      // plans are retired and skipped; "past_due" seeds an in-grace charge.
      for (const subscription of customer.subscriptions) {
        if (subscription.plan.startsWith("care_")) continue;
        const kind = subscription.plan.startsWith("hosting_")
          ? "hosting"
          : "database";
        const status =
          subscription.status === "canceled" ? "canceled" : "active";
        const inGrace = subscription.status === "past_due";
        await client.query(
          `INSERT INTO recurring_charges
            (customer_id, site_id, kind, plan_key, label, amount_cents, interval, status, low_balance_notified_at, next_charge_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            customerId,
            siteId,
            kind,
            subscription.plan,
            subscription.plan.replace(/_/g, " "),
            subscription.amountCents,
            subscription.interval ?? "month",
            status,
            inGrace ? daysAgo(3) : null,
            inGrace
              ? daysAgo(3)
              : daysFromNow(
                  subscription.interval === "year" ? 315 : 24 + index,
                ),
            daysAgo(88 - index * 7),
          ],
        );
        stats.recurring += 1;
      }

      const invoices = [
        ...(customer.buildCents > 0
          ? [
              {
                type: "build",
                amountCents: customer.buildCents,
                status: index === 7 ? "open" : "paid",
                issuedAt: daysAgo(82 - index * 6),
              },
            ]
          : []),
        {
          type: "hosting",
          amountCents: customer.subscriptions
            .filter((subscription) => subscription.plan.startsWith("hosting_"))
            .reduce((sum, subscription) => sum + subscription.amountCents, 0),
          status: index === 3 ? "failed" : "paid",
          issuedAt: daysAgo(12 - Math.min(index, 9)),
        },
        {
          type: "domain",
          amountCents: customer.domainCostCents + 1200,
          status: index === 9 ? "open" : "paid",
          issuedAt: daysAgo(55 - index * 4),
        },
      ];

      for (const invoice of invoices) {
        await client.query(
          `INSERT INTO invoices
            (customer_id, site_id, type, amount_cents, vat_cents, currency, status, provider, provider_invoice_id, issued_at, paid_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            customerId,
            siteId,
            invoice.type,
            invoice.amountCents,
            0,
            "USD",
            invoice.status,
            invoice.type === "hosting" ? "stripe" : "manual",
            `inv_${invoiceNumber(index, invoice.type)}`,
            invoice.issuedAt,
            paidAtFor(invoice.status, daysFromNow(-Math.max(1, 11 - index))),
            invoice.issuedAt,
          ],
        );
        stats.invoices += 1;
      }

      await client.query(
        `INSERT INTO leads
          (name, email, company, budget, message, status, source, customer_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          customer.name,
          customer.email,
          customer.company,
          customer.buildCents > 0 ? "$1,850+" : "Hosting only",
          `${customer.company} converted from demo lead into a customer record.`,
          index % 4 === 0 ? "won" : "contacted",
          "demo_seed",
          customerId,
          daysAgo(120 - index * 8),
        ],
      );
      stats.leads += 1;
    }

    for (const [index, lead] of demoLeads.entries()) {
      await client.query(
        `INSERT INTO leads
          (name, email, company, budget, message, status, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          lead.name,
          lead.email,
          lead.company,
          lead.budget,
          lead.message,
          lead.status,
          "demo_seed",
          daysAgo(index + 1),
        ],
      );
      stats.leads += 1;
    }

    await client.query("COMMIT");
    console.log(
      `Seeded ${stats.customers} customers, ${stats.sites} sites, ${stats.domains} domains, ` +
        `${stats.recurring} recurring charges, ${stats.invoices} invoices, and ${stats.leads} leads.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "42P01") {
      console.error(
        "Missing database tables. Run `pnpm db:migrate` before `pnpm db:seed`.",
      );
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
