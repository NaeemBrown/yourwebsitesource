<script setup lang="ts">
// NOTE: Starter legal template — review with a qualified attorney before relying on it.
useSeoMeta({
  title: "Refund Policy — TheWebsiteForge",
  description:
    "How refunds work at TheWebsiteForge across one-time builds, recurring hosting, domains, and feature work.",
});

defineOgImage("Forge", {
  title: "Refund Policy",
  description:
    "How refunds work across builds, recurring hosting, domains, and feature work.",
});

const effectiveDate = "6 June 2026";
const contactEmail = "support@pixelatedindustries.com";

const sections = [
  {
    heading: "1. Overview",
    body: [
      "This Refund Policy explains when refunds are and are not available across our services. It forms part of our Terms of Service. All amounts are in United States Dollars (USD).",
      "Because much of our work is bespoke and time-based, some payments are non-refundable once work has started. The details below set out how this applies to each type of service.",
    ],
  },
  {
    heading: "2. One-time website builds",
    body: [
      "Deposits paid to begin a build are non-refundable once we have started work, as they reserve our time and cover initial design and setup.",
      "If you cancel a build partway through, the deposit is retained and you are billed for any work completed beyond it up to the cancellation point. Any remaining balance for work not yet done is not charged.",
      "Once a build is delivered and approved, the build fee is non-refundable.",
    ],
  },
  {
    heading: "3. Recurring hosting and services",
    body: [
      "Hosting and other recurring services are billed in advance for each billing period. You can cancel at any time to stop future renewals.",
      "Cancellation takes effect at the end of the current paid period; the current period is generally not refunded, and you keep access until it ends. We do not provide pro-rata refunds for partial periods unless required by law or stated otherwise in writing.",
      "If you prepaid annually, we may, at our discretion, refund unused full months after the current month, less any discount you received for prepaying.",
    ],
  },
  {
    heading: "4. Domains",
    body: [
      "Domain registrations, renewals, and transfers are non-refundable once purchased. This is because domain costs are paid to the registrar on your behalf and cannot be reversed.",
      "Domain management fees already incurred are non-refundable.",
    ],
  },
  {
    heading: "5. Feature and change work",
    body: [
      "One-time feature or change requests are quoted and approved before we begin. Once approved and started, amounts for completed work are non-refundable. Work not yet started can be cancelled without charge.",
    ],
  },
  {
    heading: "6. Duplicate or incorrect charges",
    body: [
      "If you believe you were charged in error, by duplicate, or incorrectly, contact us promptly and we will investigate. Verified erroneous charges will be refunded.",
    ],
  },
  {
    heading: "7. How to request a refund",
    body: [
      `To request a refund or raise a billing issue, email ${contactEmail} with your account details and the invoice or payment reference. We aim to respond within a reasonable time and will explain the outcome.`,
      "Approved refunds are returned using the original payment method where possible. Processing times depend on the payment provider.",
    ],
  },
  {
    heading: "8. Wallet credits and unused balances",
    body: [
      "Wallet top-ups are prepaid service credits, not a bank account or savings product. Credits do not earn interest and can only be used for services supplied by TheWebsiteForge.",
      "Unused wallet credit may be refunded on request, less any non-refundable payment-provider charges, promotional credit, chargebacks, amounts already due, or services already supplied. We may require identity and payment verification before approving a wallet refund.",
      "Approved wallet refunds are returned to the original payment method where reasonably possible. Processing times depend on the payment provider.",
    ],
  },
  {
    heading: "9. Your statutory rights",
    body: [
      "Nothing in this policy limits any rights you have under applicable consumer protection law that cannot be excluded. Where such law gives you a stronger right than this policy, that law applies.",
    ],
  },
];
</script>

<template>
  <LegalDocument
    title="Refund Policy"
    subtitle="When refunds are and aren't available across builds, hosting, domains, and feature work."
    :effective-date="effectiveDate"
    document-code="TWF / REF / 03"
    :sections="sections"
  />
</template>
