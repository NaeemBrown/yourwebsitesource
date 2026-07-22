/**
 * Database schema (Drizzle ORM) — see plan §5 "Proposed Data Model".
 * One PostgreSQL database powers leads, customers, sites, domains,
 * subscriptions, invoices, and admin auditing.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  serial,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ----------------------------- enums ----------------------------- */

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "won",
  "lost",
]);

export const siteType = pgEnum("site_type", ["static", "dynamic", "app"]);
export const siteOrigin = pgEnum("site_origin", ["built", "brought"]);
export const siteStatus = pgEnum("site_status", [
  "draft",
  "live",
  "suspended",
  "offboarded",
]);
/** Billing health of a site, distinct from its lifecycle `status`. Lets the
 * recurring-billing task flag non-payment ("grace"/"suspended") without
 * conflating it with a manual offboarding. */
export const siteBillingStatus = pgEnum("site_billing_status", [
  "current",
  "grace",
  "suspended",
]);

export const dbHosting = pgEnum("db_hosting", [
  "none",
  "self_hosted",
  "managed",
]);

export const billingInterval = pgEnum("billing_interval", ["month", "year"]);

export const invoiceType = pgEnum("invoice_type", [
  "build",
  "hosting",
  "database",
  "domain",
  "care",
  "feature",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "open",
  "paid",
  "failed",
  "refunded",
]);

export const adminRole = pgEnum("admin_role", ["owner", "admin", "support"]);

/** Wallet ledger entry kinds (WebForgePlan2 §4.2). Signed amount decides credit/debit. */
export const walletTxnType = pgEnum("wallet_txn_type", [
  "topup",
  "build",
  "hosting",
  "database",
  "domain",
  "feature",
  "change",
  "refund",
  "adjustment",
]);

/** What a recurring charge is for. Hosting/database bill monthly; domains yearly. */
export const recurringKind = pgEnum("recurring_kind", [
  "hosting",
  "database",
  "domain",
]);
export const recurringStatus = pgEnum("recurring_status", [
  "active",
  "paused",
  "canceled",
]);

export const changeRequestStatus = pgEnum("change_request_status", [
  "open",
  "quoted",
  "approved",
  "done",
  "declined",
  "canceled",
]);
export const projectStatus = pgEnum("project_status", [
  "awaiting_payment",
  "payment_received",
  "brief_received",
  "design",
  "build",
  "review",
  "launch",
  "live",
  "paused",
  "canceled",
]);
export const projectActionStatus = pgEnum("project_action_status", [
  "open",
  "completed",
]);
export const projectFileKind = pgEnum("project_file_kind", [
  "customer_upload",
  "deliverable",
]);

/* ----------------------------- tables ---------------------------- */

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  firebaseUid: text("firebase_uid").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  company: text("company"),
  country: text("country"),
  notes: text("notes"),
  /** Paystack customer code (CUS_...), set on first checkout (plan §5.2). */
  paystackCustomerCode: text("paystack_customer_code"),
  /** Cached prepaid wallet balance in USD cents. The ledger is the source of
   * truth; this is a fast read kept in sync by server/utils/wallet.ts. */
  walletBalanceCents: integer("wallet_balance_cents").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    budget: text("budget"),
    message: text("message").notNull(),
    status: leadStatus("status").default("new").notNull(),
    source: text("source").default("contact_form").notNull(),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("leads_customer_id_idx").on(t.customerId)],
);

/** Brief captured before authentication and claimed by checkout. */
export const checkoutBriefs = pgTable(
  "checkout_briefs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    planKey: text("plan_key").notNull(),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("checkout_briefs_email_idx").on(t.email)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: siteType("type").notNull(),
    origin: siteOrigin("origin").notNull(),
    status: siteStatus("status").default("draft").notNull(),
    /** Billing health, driven by the recurring-billing task (current/grace/suspended). */
    billingStatus: siteBillingStatus("billing_status")
      .default("current")
      .notNull(),
    /** Which database option the customer chose for this site (plan §3.2.1). */
    dbHosting: dbHosting("db_hosting").default("none").notNull(),
    repoUrl: text("repo_url"),
    deployUrl: text("deploy_url"),
    /** Which VPS this site lives on, for capacity tracking. */
    vpsHost: text("vps_host"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("sites_customer_id_idx").on(t.customerId)],
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    fqdn: text("fqdn").notNull().unique(),
    registrar: text("registrar").default("cloudflare").notNull(),
    registeredAt: date("registered_at"),
    expiresAt: date("expires_at"),
    autoRenew: boolean("auto_renew").default(true).notNull(),
    /** Annual registrar cost in cents (USD), excluding our management fee. */
    annualCostCents: integer("annual_cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("domains_customer_id_idx").on(t.customerId),
    index("domains_site_id_idx").on(t.siteId),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Human-friendly sequential invoice number. */
    number: serial("number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    type: invoiceType("type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** VAT in cents — 0 while not VAT-registered (plan §10.1). */
    vatCents: integer("vat_cents").default(0).notNull(),
    currency: text("currency").default("USD").notNull(),
    status: invoiceStatus("status").default("open").notNull(),
    provider: text("provider"),
    providerInvoiceId: text("provider_invoice_id"),
    /** Set when this invoice was emitted by a recurring (hosting/db/domain) charge. */
    recurringChargeId: uuid("recurring_charge_id").references(
      (): AnyPgColumn => recurringCharges.id,
      { onDelete: "set null" },
    ),
    /** Set for domain-renewal invoices. */
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),
    /** Set when this invoice settles an approved change request (ad-hoc feature). */
    changeRequestId: uuid("change_request_id").references(
      (): AnyPgColumn => changeRequests.id,
      { onDelete: "set null" },
    ),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("invoices_customer_id_idx").on(t.customerId),
    index("invoices_provider_invoice_id_idx").on(t.providerInvoiceId),
    index("invoices_recurring_charge_id_idx").on(t.recurringChargeId),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    briefId: uuid("brief_id").references(() => checkoutBriefs.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    planKey: text("plan_key").notNull(),
    status: projectStatus("status").default("awaiting_payment").notNull(),
    progress: integer("progress").default(5).notNull(),
    estimatedLaunchAt: date("estimated_launch_at"),
    brief: jsonb("brief").$type<Record<string, unknown>>().notNull(),
    customerNotes: text("customer_notes"),
    latestUpdate: text("latest_update"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("projects_customer_id_idx").on(t.customerId),
    uniqueIndex("projects_invoice_id_uq")
      .on(t.invoiceId)
      .where(sql`${t.invoiceId} is not null`),
  ],
);

export const projectActions = pgTable(
  "project_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details"),
    status: projectActionStatus("status").default("open").notNull(),
    dueAt: date("due_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("project_actions_project_id_idx").on(t.projectId)],
);

export const projectFiles = pgTable(
  "project_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: projectFileKind("kind").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("project_files_project_id_idx").on(t.projectId)],
);

export const projectActivity = pgTable(
  "project_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("project_activity_project_id_idx").on(t.projectId)],
);

/**
 * Admin roster. Authorization currently uses the ADMIN_EMAILS env allowlist
 * (plan §6); this table is kept so we can move to DB-managed admins later
 * without a schema change.
 */
export const adminUsers = pgTable("admin_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  firebaseUid: text("firebase_uid"),
  role: adminRole("role").default("admin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminEmail: text("admin_email").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Wallet ledger (append-only) — the source of truth for every prepaid balance
 * movement. All amounts are signed USD cents: positive = credit, negative =
 * debit. `balance_after_cents` snapshots the balance immediately after the row.
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: walletTxnType("type").notNull(),
    /** Signed USD cents: + credit, - debit. */
    amountCents: integer("amount_cents").notNull(),
    /** USD-cents balance immediately after this entry. */
    balanceAfterCents: integer("balance_after_cents").notNull(),
    currency: text("currency").default("USD").notNull(),
    /** For top-ups: the actual ZAR amount Paystack charged (audit trail). */
    chargedZarCents: integer("charged_zar_cents"),
    /** For top-ups: the USD→ZAR rate used. */
    fxRate: text("fx_rate"),
    description: text("description").notNull(),
    /** Paystack reference for top-ups; null for internal debits. */
    reference: text("reference"),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    /** Admin email, or "system" for the scheduled job. */
    createdBy: text("created_by").default("system").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One ledger row per Paystack reference (top-ups) — hard guard against
    // double-crediting when the webhook and the verify step race. Internal
    // debits have a null reference and are exempt (partial index).
    uniqueIndex("wallet_txn_reference_uq")
      .on(t.reference)
      .where(sql`${t.reference} is not null`),
    index("wallet_txn_customer_id_idx").on(t.customerId),
  ],
);

/**
 * Recurring monthly charges debited from the wallet (hosting / database).
 * The scheduled task (server/tasks/billing/charge-recurring.ts) reads these.
 */
export const recurringCharges = pgTable(
  "recurring_charges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    /** Set for domain-renewal charges so the task can advance the right domain. */
    domainId: uuid("domain_id").references(() => domains.id, {
      onDelete: "cascade",
    }),
    kind: recurringKind("kind").notNull(),
    /** Catalogue key from shared/billing.ts (e.g. "hosting_dynamic"), optional. */
    planKey: text("plan_key"),
    label: text("label").notNull(),
    /** Charge amount in USD cents, per `interval`. */
    amountCents: integer("amount_cents").notNull(),
    interval: billingInterval("interval").default("month").notNull(),
    status: recurringStatus("status").default("active").notNull(),
    /** When the low-balance grace window started (null = not in grace). */
    lowBalanceNotifiedAt: timestamp("low_balance_notified_at", {
      withTimezone: true,
    }),
    /** When this charge last successfully debited the wallet. */
    lastChargedAt: timestamp("last_charged_at", { withTimezone: true }),
    /** Consecutive failed debit attempts (reset to 0 on success). */
    failureCount: integer("failure_count").default(0).notNull(),
    nextChargeAt: timestamp("next_charge_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("recurring_charges_customer_id_idx").on(t.customerId),
    // Speeds up the daily "due charges" scan in the billing task.
    index("recurring_charges_next_charge_at_idx").on(t.nextChargeAt),
    // Backstop against duplicate ACTIVE charges for the same customer/site/kind
    // (the billing task would otherwise debit both). Application code also
    // checks this so the null-siteId case is covered.
    uniqueIndex("recurring_charges_active_uq")
      .on(t.customerId, t.siteId, t.kind)
      .where(sql`${t.status} = 'active'`),
  ],
);

/** Customer-submitted change requests (portal) — admin quotes + debits the wallet. */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    details: text("details").notNull(),
    status: changeRequestStatus("status").default("open").notNull(),
    /** Optional quoted amount in USD cents once an admin scopes it. */
    quotedCents: integer("quoted_cents"),
    /** Consent trail: when the customer approved the quote and from what email. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    /** The feature invoice raised when the customer approved + paid the quote. */
    invoiceId: uuid("invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("change_requests_customer_id_idx").on(t.customerId)],
);

/* --------------------------- inferred types ---------------------- */

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type CheckoutBrief = typeof checkoutBriefs.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectAction = typeof projectActions.$inferSelect;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type ProjectActivity = typeof projectActivity.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type AdminUser = typeof adminUsers.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type RecurringCharge = typeof recurringCharges.$inferSelect;
export type NewRecurringCharge = typeof recurringCharges.$inferInsert;
export type ChangeRequest = typeof changeRequests.$inferSelect;
export type NewChangeRequest = typeof changeRequests.$inferInsert;
