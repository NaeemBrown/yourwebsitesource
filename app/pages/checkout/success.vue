<script setup lang="ts">
/**
 * Checkout success page (plan §5.2 step 7).
 * Paystack redirects here with ?reference=... after payment. We verify the
 * reference server-side before showing a confirmed state — the redirect alone
 * is never trusted. The webhook does the real provisioning in the background.
 */
const route = useRoute();
const reference = computed(() => String(route.query.reference ?? ""));

// Stable key so the verify result is deduped/cached predictably across SSR and
// client hydration. Fetches immediately on load (the page is only reached via a
// Paystack redirect that carries the reference).
const hasReference = computed(() => reference.value.length > 0);

const { data, pending } = await useFetch("/api/checkout/verify", {
  key: "checkout-verify",
  query: { reference },
  // Only fetch when we actually have a reference.
  immediate: hasReference.value,
});

const paid = computed(() => data.value?.paid === true);

useSeoMeta({ title: "Payment — TheWebsiteForge", robots: "noindex" });
</script>

<template>
  <div class="px-4 pt-36 pb-24 sm:px-6 lg:px-8">
    <div v-motion="reveal(0)" class="mx-auto max-w-xl text-center">
      <div v-if="!hasReference" class="glass rounded-2xl p-10">
        <h1 class="font-display text-3xl font-bold text-white">
          No payment found
        </h1>
        <p class="mt-3 text-slate-400">
          This page confirms payments after checkout, but no payment reference
          was provided. If you were charged and ended up here, please
          <NuxtLink to="/contact" class="text-brand-300 underline"
            >contact us</NuxtLink
          >.
        </p>
      </div>

      <div v-else-if="pending" class="glass rounded-2xl p-10">
        <p class="text-lg text-slate-300">Confirming your payment…</p>
      </div>

      <div v-else-if="paid" class="glass rounded-2xl p-10">
        <span
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-600"
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 class="mt-6 font-display text-3xl font-bold text-white">
          Payment confirmed
        </h1>
        <p class="mt-3 text-slate-400">
          Thank you! A receipt is on its way to your inbox. We'll be in touch
          shortly to get things moving.
        </p>
        <p v-if="reference" class="mt-4 text-xs text-slate-500">
          Reference: {{ reference }}
        </p>
        <div class="mt-8 flex justify-center gap-3">
          <NuxtLink
            to="/"
            class="rounded-xl bg-gradient-to-br from-brand-500 to-accent-600 px-5 py-2.5 font-semibold text-white"
          >
            Back to home
          </NuxtLink>
        </div>
      </div>

      <div v-else class="glass rounded-2xl p-10">
        <h1 class="font-display text-3xl font-bold text-white">
          We're still confirming your payment
        </h1>
        <p class="mt-3 text-slate-400">
          If you completed the payment, it may take a moment to process. You'll
          receive a receipt by email once it's confirmed. If you think something
          went wrong, please
          <NuxtLink to="/contact" class="text-brand-300 underline"
            >contact us</NuxtLink
          >.
        </p>
        <p v-if="reference" class="mt-4 text-xs text-slate-500">
          Reference: {{ reference }}
        </p>
      </div>
    </div>
  </div>
</template>
