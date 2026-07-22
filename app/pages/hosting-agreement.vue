<script setup lang="ts">
// NOTE: Starter legal template — review with a qualified attorney before relying on it.
useSeoMeta({
  title: "Hosting Agreement — TheWebsiteForge",
  description:
    "How TheWebsiteForge hosts, maintains, suspends, and offboards websites, plus domain management and included changes.",
});

defineOgImage("Forge", {
  title: "Hosting Agreement",
  description:
    "How we host, maintain, and offboard websites, plus domain management.",
});

const effectiveDate = "6 June 2026";
const contactEmail = "support@pixelatedindustries.com";

const sections = [
  {
    heading: "1. Scope",
    body: [
      "This Hosting Agreement applies whenever we host a website for you, whether we built it or you brought us an existing project. It works together with our Terms of Service and Refund Policy.",
      "Your specific hosting plan, price, and any add-ons (such as a database or managed domain) are set out in your order confirmation.",
      "For new websites we build and host, the first month of hosting is free unless your quote states otherwise. Wallet deductions begin when that free period ends.",
    ],
  },
  {
    heading: "2. Hosting plans and resources",
    body: [
      "Hosting is offered in tiers (for example Static, Dynamic, and App) sized to what your site needs to run. Each tier has defined resource limits, which may include storage, bandwidth, database size, and compute share.",
      "Sites are hosted on infrastructure we operate (currently a VPS located in Europe) and may be moved between servers as we scale. If your usage consistently exceeds your tier's limits, we will discuss upgrading you to a higher tier or add-on.",
    ],
  },
  {
    heading: "3. Included changes vs chargeable work",
    body: [
      "For sites we built and host, your hosting plan includes a small allowance of minor changes, such as editing text, swapping an existing image, or small tweaks, subject to the limit stated in your plan.",
      "Work beyond that allowance — including new pages, new features, integrations, or layout/redesign changes — is chargeable. We will scope and quote it, get your approval, then carry out and bill the work. Change requests are quoted individually from your account and paid from your prepaid wallet.",
      "For sites you brought to us, change work is quoted per request, since we may be working within an unfamiliar codebase.",
    ],
  },
  {
    heading: "4. Domains",
    body: [
      "Where you ask us to register or manage a domain on your behalf, we do so through a registrar (such as Cloudflare). You are the legal owner/registrant of the domain from the outset; we act as administrative manager.",
      "We bill you the registrar cost plus a flat management fee, and we track renewals so the domain does not lapse while you are with us. Newly registered or transferred domains may be subject to a registrar transfer lock (commonly 60 days) imposed by ICANN.",
      "On request, we will hand over full control of the domain to you, either by moving it to your own registrar account or by initiating a transfer out, subject to any applicable transfer lock.",
    ],
  },
  {
    heading: "5. Backups and restoration",
    body: [
      "We take backups at a frequency that depends on your hosting tier (for example monthly, weekly, or daily). Backups are intended for disaster recovery, not as a substitute for your own records.",
      "You may request a restore; we will use reasonable efforts to restore from the most recent available backup. We do not guarantee that every backup is complete or recoverable in all circumstances.",
    ],
  },
  {
    heading: "6. Availability and support",
    body: [
      "We aim to keep your site online and performant. Unless a specific service level is stated in writing, hosting is provided on a commercially reasonable best-effort basis.",
      "Support is provided through the channel and within the response targets stated for your plan. Priority support may be included with higher tiers.",
    ],
  },
  {
    heading: "7. Acceptable use",
    body: [
      "You must not use our hosting for unlawful content or activity, malware, phishing, spam, infringement of others' rights, or anything that endangers the security or stability of our infrastructure or other customers.",
      "We may suspend or remove content that breaches this section, and we may suspend or terminate hosting for serious or repeated breaches.",
    ],
  },
  {
    heading: "8. Non-payment, suspension, and offboarding",
    body: [
      "Recurring hosting is deducted from your prepaid wallet in advance. If the wallet cannot cover a due charge, a 7-day grace period begins and we will send a low-balance warning. If the balance is not restored during that period, we may suspend your site until sufficient credit is added.",
      "On cancellation or termination, we will, on request and where you are not in breach, provide a reasonable export of your site files and database, and assist with handing off your domain. We may retain backups for a limited period and then delete them.",
      "We are not obliged to retain or restore data after offboarding is complete.",
    ],
  },
  {
    heading: "9. Changes to this Agreement",
    body: [
      "We may update this Hosting Agreement from time to time. The current version is always available on our website with its effective date, and material changes affecting your plan will be notified to you in advance.",
    ],
  },
  {
    heading: "10. Contact",
    body: [`Questions about hosting can be sent to ${contactEmail}.`],
  },
];
</script>

<template>
  <LegalDocument
    title="Hosting Agreement"
    subtitle="How we host, maintain, suspend, and offboard sites, plus domains and included changes."
    :effective-date="effectiveDate"
    document-code="TWF / HOST / 02"
    :sections="sections"
  />
</template>
