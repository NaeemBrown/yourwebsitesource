/**
 * Admin request DTOs + domain status enums (business domain).
 *
 * Shapes for request bodies the admin dashboard sends to `/api/admin/*`, plus
 * the lifecycle status unions those endpoints validate against.
 */
import type { RecurringKind } from "../../shared/billing";

/** Body of POST /api/admin/customers — create a customer or convert a won lead. */
export interface CustomerPayload {
  name?: string;
  email?: string;
  company?: string;
  /** When converting a won lead, link + mark it. */
  leadId?: string;
}

/** Body of POST /api/admin/wallet — manual credit/debit of a customer's wallet. */
export interface WalletAdjustPayload {
  customerId?: string;
  direction?: "credit" | "debit";
  /** USD cents (positive). */
  amountUsdCents?: number;
  type?: string;
  description?: string;
  /** Allow a debit to push the balance negative (admin override). */
  force?: boolean;
  /** Raise a paid invoice for this debit (e.g. ad-hoc feature work). */
  createInvoice?: boolean;
}

/** Body of POST /api/admin/recurring — attach a monthly charge to a customer. */
export interface RecurringPayload {
  customerId?: string;
  siteId?: string;
  /** A recurring catalogue key (e.g. "hosting_dynamic") — fills kind/label/amount. */
  planKey?: string;
  /** Or specify manually: */
  kind?: RecurringKind;
  label?: string;
  amountUsdCents?: number;
  /** ISO date for the first charge; overrides the firstMonthFree logic. */
  nextChargeAt?: string;
  /** When no explicit nextChargeAt: true = first interval free (billing starts
   * one interval out); false/omitted = debit the wallet immediately. */
  firstMonthFree?: boolean;
}

/** Recurring-charge lifecycle states (single source of truth for runtime + types). */
export const RECURRING_STATUSES = ["active", "paused", "canceled"] as const;
export type RecurringChargeStatus = (typeof RECURRING_STATUSES)[number];

/** Body of PATCH /api/admin/recurring — pause / resume / cancel a charge. */
export interface RecurringPatchPayload {
  id?: string;
  status?: RecurringChargeStatus;
}

/** Site lifecycle states (single source of truth for runtime + types). */
export const SITE_STATUSES = [
  "draft",
  "live",
  "suspended",
  "offboarded",
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SITE_TYPES = ["static", "dynamic", "app"] as const;
export type SiteTypeOption = (typeof SITE_TYPES)[number];
export const SITE_ORIGINS = ["built", "brought"] as const;
export type SiteOriginOption = (typeof SITE_ORIGINS)[number];
export const DB_HOSTING_OPTIONS = ["none", "self_hosted", "managed"] as const;
export type DbHostingOption = (typeof DB_HOSTING_OPTIONS)[number];
export const SITE_BILLING_STATUSES = ["current", "grace", "suspended"] as const;
export type SiteBillingStatusOption = (typeof SITE_BILLING_STATUSES)[number];

/** Body of POST /api/admin/sites — create a site (built or brought). */
export interface SiteCreatePayload {
  customerId?: string;
  name?: string;
  type?: SiteTypeOption;
  origin?: SiteOriginOption;
  status?: SiteStatus;
  dbHosting?: DbHostingOption;
  repoUrl?: string;
  deployUrl?: string;
  vpsHost?: string;
}

/** Body of PATCH /api/admin/sites — change a site's status and/or details. */
export interface SitePatchPayload {
  id?: string;
  status?: SiteStatus;
  billingStatus?: SiteBillingStatusOption;
  name?: string;
  type?: SiteTypeOption;
  dbHosting?: DbHostingOption;
  repoUrl?: string | null;
  deployUrl?: string | null;
  vpsHost?: string | null;
}

/** Admin invoice actions. */
export const INVOICE_ACTIONS = ["mark_paid", "void", "refund"] as const;
export type InvoiceAction = (typeof INVOICE_ACTIONS)[number];

/** Body of PATCH /api/admin/invoice — mark paid / void / refund an invoice. */
export interface InvoiceActionPayload {
  id?: string;
  action?: InvoiceAction;
}

/** Change-request lifecycle states the admin can set. */
export const CHANGE_REQUEST_ADMIN_STATUSES = [
  "quoted",
  "declined",
  "done",
] as const;
export type ChangeRequestAdminStatus =
  (typeof CHANGE_REQUEST_ADMIN_STATUSES)[number];

/** Body of PATCH /api/admin/change-requests — quote / decline / mark done. */
export interface ChangeRequestPatchPayload {
  id?: string;
  status?: ChangeRequestAdminStatus;
  /** Quote amount in USD cents (required when status = "quoted"). */
  quotedUsdCents?: number;
}

/** Body of POST /api/admin/domains — register/track a domain for a customer. */
export interface DomainCreatePayload {
  customerId?: string;
  siteId?: string;
  fqdn?: string;
  registrar?: string;
  registeredAt?: string;
  expiresAt?: string;
  autoRenew?: boolean;
  /** Annual cost charged to the wallet, in USD cents. */
  annualCostUsdCents?: number;
}

/** Body of PATCH /api/admin/domains — edit a domain / its renewal. */
export interface DomainPatchPayload {
  id?: string;
  siteId?: string | null;
  registrar?: string;
  expiresAt?: string;
  autoRenew?: boolean;
  annualCostUsdCents?: number | null;
}
