<script setup lang="ts">
import {
  databaseTiers,
  domainInfo,
  hostingPlans,
  pricingTiers,
} from "~~/shared/site";

useSeoMeta({
  title: "Pricing - TheWebsiteForge",
  description: "Clear pricing for websites, hosting, databases, and domains.",
});

// Per-page social card: the wordmark is already in the template, so the big
// title is the page topic.
defineOgImage("Forge", {
  title: "Pricing",
  description: "Clear pricing for websites, hosting, databases, and domains.",
});

const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

const packageMeta = [
  ["01", "Launch quickly"],
  ["02", "The popular choice"],
  ["03", "Built for growth"],
  ["04", "Systems and scale"],
];

const comparison = [
  ["Pages", "1-3", "Up to 6", "Up to 12", "Scoped"],
  ["Motion", "Light", "Enhanced", "Advanced", "Custom"],
  ["CMS", "-", "Optional", "Included", "Included"],
  ["Integrations", "Basic", "Standard", "Advanced", "Custom"],
  ["Revisions", "1", "3", "4", "Scoped"],
  ["Timeline", "3-5 days", "1-3 weeks", "2-5 weeks", "By milestone"],
];
</script>

<template>
  <main class="pricing-page min-h-screen bg-[#0e0d0c] pt-36 text-[#ece9e2]">
    <section class="px-6 sm:px-10 lg:px-20">
      <div class="mx-auto max-w-[1600px]">
        <header class="border-b border-white/10 pb-14">
          <div
            class="flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.32em] text-white/35"
          >
            <span>Pricing / Clear from the start</span>
            <span>USD / ZAR at checkout</span>
          </div>
          <div class="mt-14 grid items-end gap-12 lg:grid-cols-[1fr_0.32fr]">
            <h1
              class="font-display text-[clamp(4.5rem,13vw,13rem)] font-medium leading-[0.75] tracking-[-0.09em]"
            >
              Pick your<br />
              <span class="font-serif font-light italic text-brand-300"
                >starting point.</span
              >
            </h1>
            <div class="max-w-sm border-l border-white/15 pl-6">
              <span class="mb-5 block h-2 w-2 rounded-full bg-brand-300" />
              <p class="text-base leading-relaxed text-white/50">
                Straightforward packages for getting online, growing an
                established business, or building something more ambitious.
              </p>
            </div>
          </div>
        </header>

        <section class="py-20">
          <div
            class="mb-10 flex items-center justify-between border-b border-white/10 pb-5 font-mono text-[0.58rem] uppercase tracking-[0.28em] text-white/35"
          >
            <span>Website creation</span>
            <span>One-time project fee</span>
          </div>

          <div
            class="pricing-packages grid border-t border-white/10 lg:grid-cols-4"
          >
            <article
              v-for="(tier, index) in pricingTiers"
              :key="tier.id"
              v-reveal="{ y: 35, delay: index * 0.06 }"
              class="package-card group relative flex min-h-[38rem] flex-col border-b border-white/10 py-8 lg:border-r lg:px-7 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
              :class="{ 'is-featured': tier.highlighted }"
            >
              <div class="package-glow absolute inset-0 opacity-0" />
              <div class="relative flex items-center justify-between">
                <span
                  class="font-mono text-[0.55rem] uppercase tracking-[0.26em] text-white/30"
                  >{{ packageMeta[index]?.[0] }}</span
                >
                <span
                  v-if="tier.highlighted"
                  class="rounded-full border border-brand-300/30 px-3 py-1 font-mono text-[0.48rem] uppercase tracking-[0.2em] text-brand-300"
                  >Recommended</span
                >
              </div>

              <div class="relative mt-12">
                <p
                  class="font-mono text-[0.52rem] uppercase tracking-[0.2em] text-white/35"
                >
                  {{ packageMeta[index]?.[1] }}
                </p>
                <h2
                  class="mt-3 font-display text-4xl font-medium tracking-[-0.06em]"
                >
                  {{ tier.name }}
                </h2>
                <p class="mt-4 min-h-16 text-sm leading-relaxed text-white/45">
                  {{ tier.tagline }}
                </p>
              </div>

              <div class="relative mt-9 border-y border-white/10 py-6">
                <span
                  class="font-display text-[clamp(3rem,4vw,5rem)] font-medium leading-none tracking-[-0.08em]"
                >
                  {{ dollars(tier.price) }}
                </span>
                <span
                  class="ml-2 font-mono text-[0.5rem] uppercase tracking-[0.18em] text-white/35"
                  >/ {{ tier.period }}</span
                >
              </div>

              <ul class="relative mt-7 flex-1 space-y-3 text-sm text-white/55">
                <li
                  v-for="feature in tier.features"
                  :key="feature"
                  class="flex items-start gap-3"
                >
                  <span class="mt-2 h-px w-4 shrink-0 bg-brand-300/60" />
                  {{ feature }}
                </li>
              </ul>

              <NuxtLink
                :to="
                  tier.planKey
                    ? `/checkout/start?plan=${tier.planKey}`
                    : '/contact'
                "
                class="package-action relative mt-8 flex items-center justify-between border-t border-white/15 pt-5 font-mono text-[0.58rem] uppercase tracking-[0.22em]"
              >
                {{ tier.cta }}
                <span class="package-arrow text-lg">↗</span>
              </NuxtLink>
            </article>
          </div>
        </section>

        <section class="border-y border-white/10 py-20">
          <div class="grid gap-12 lg:grid-cols-[0.38fr_1fr]">
            <div>
              <p
                class="font-mono text-[0.58rem] uppercase tracking-[0.28em] text-white/35"
              >
                Compare / 01
              </p>
              <h2
                class="mt-6 font-display text-[clamp(3rem,6vw,6rem)] font-medium leading-[0.88] tracking-[-0.075em]"
              >
                The right<br />
                <span class="font-serif font-light italic text-brand-300"
                  >fit, clearly.</span
                >
              </h2>
              <p class="mt-7 max-w-sm text-sm leading-relaxed text-white/45">
                Each package is a starting point. We confirm the scope before
                work begins, so there are no surprises later.
              </p>
            </div>

            <div class="comparison-grid">
              <div
                class="grid grid-cols-[1.1fr_repeat(4,1fr)] border-b border-white/15 pb-4 font-mono text-[0.5rem] uppercase tracking-[0.18em] text-white/35"
              >
                <span>Included</span>
                <span v-for="tier in pricingTiers" :key="tier.id">{{
                  tier.name
                }}</span>
              </div>
              <div
                v-for="row in comparison"
                :key="row[0]"
                class="grid grid-cols-[1.1fr_repeat(4,1fr)] border-b border-white/10 py-5 text-sm"
              >
                <strong class="font-medium text-white/70">{{ row[0] }}</strong>
                <span
                  v-for="value in row.slice(1)"
                  :key="value"
                  class="text-white/40"
                  >{{ value }}</span
                >
              </div>
            </div>
          </div>
        </section>

        <section class="py-24">
          <div class="mb-14 grid items-end gap-8 lg:grid-cols-2">
            <div>
              <p
                class="font-mono text-[0.58rem] uppercase tracking-[0.28em] text-white/35"
              >
                Hosting / 02
              </p>
              <h2
                class="mt-5 font-display text-[clamp(3.5rem,7vw,7rem)] font-medium leading-[0.86] tracking-[-0.08em]"
              >
                We keep it<br />
                <span class="font-serif font-light italic text-brand-300"
                  >online.</span
                >
              </h2>
            </div>
            <p
              class="max-w-md text-base leading-relaxed text-white/45 lg:ml-auto"
            >
              Fast hosting, SSL, backups, monitoring, and support after launch.
              Choose the level that matches the website.
            </p>
          </div>

          <div class="grid border-t border-white/10 lg:grid-cols-3">
            <article
              v-for="(plan, index) in hostingPlans"
              :key="plan.id"
              class="hosting-card relative border-b border-white/10 py-8 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
            >
              <div class="flex items-center justify-between">
                <span
                  class="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-white/30"
                  >0{{ index + 1 }}</span
                >
                <span
                  v-if="plan.highlighted"
                  class="font-mono text-[0.48rem] uppercase tracking-[0.18em] text-brand-300"
                  >Most popular</span
                >
              </div>
              <h3
                class="mt-10 font-display text-3xl font-medium tracking-[-0.055em]"
              >
                {{ plan.name }}
              </h3>
              <p class="mt-3 min-h-12 text-sm leading-relaxed text-white/40">
                {{ plan.tagline }}
              </p>
              <p class="mt-7 border-y border-white/10 py-5">
                <span class="font-display text-5xl tracking-[-0.07em]">{{
                  dollars(plan.price)
                }}</span>
                <span class="text-sm text-white/35"> / month</span>
              </p>
              <ul class="mt-7 space-y-3 text-sm text-white/50">
                <li
                  v-for="feature in plan.features"
                  :key="feature"
                  class="flex gap-3"
                >
                  <span class="text-brand-300">+</span>{{ feature }}
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section
          class="infrastructure-grid grid border-y border-white/10 lg:grid-cols-2"
        >
          <article
            class="relative overflow-hidden border-b border-white/10 py-16 lg:border-r lg:border-b-0 lg:pr-14"
          >
            <div
              class="infra-orbit absolute -top-24 -right-24 h-72 w-72 rounded-full border border-white/10"
            />
            <p
              class="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-white/30"
            >
              Infrastructure / Database
            </p>
            <h3
              class="mt-5 font-display text-4xl font-medium tracking-[-0.06em]"
            >
              Data that grows with you.
            </h3>
            <p class="mt-4 max-w-lg text-sm leading-relaxed text-white/45">
              Managed databases for logins, content, products, and application
              data.
            </p>
            <div class="mt-10">
              <div
                v-for="tier in databaseTiers"
                :key="tier.id"
                class="grid grid-cols-[1fr_auto] border-t border-white/10 py-5"
              >
                <div>
                  <strong class="text-sm font-medium">{{ tier.name }}</strong>
                  <p class="mt-1 text-xs text-white/35">{{ tier.detail }}</p>
                </div>
                <span class="font-mono text-xs text-brand-300"
                  >{{ dollars(tier.price) }}/mo</span
                >
              </div>
            </div>
          </article>

          <article class="relative overflow-hidden py-16 lg:pl-14">
            <div class="domain-grid absolute inset-0" />
            <p
              class="relative font-mono text-[0.55rem] uppercase tracking-[0.25em] text-white/30"
            >
              Infrastructure / Domains
            </p>
            <h3
              class="relative mt-5 font-display text-4xl font-medium tracking-[-0.06em]"
            >
              Your name, handled.
            </h3>
            <p
              class="relative mt-4 max-w-lg text-sm leading-relaxed text-white/45"
            >
              {{ domainInfo.tagline }}
            </p>
            <ul class="relative mt-10 space-y-5">
              <li
                v-for="(point, index) in domainInfo.points"
                :key="point"
                class="grid grid-cols-[2rem_1fr] border-t border-white/10 pt-5 text-sm text-white/50"
              >
                <span
                  class="font-mono text-[0.5rem] tracking-[0.2em] text-white/25"
                  >0{{ index + 1 }}</span
                >
                {{ point }}
              </li>
            </ul>
          </article>
        </section>

        <section class="py-24">
          <div class="grid gap-12 lg:grid-cols-[0.42fr_1fr]">
            <div>
              <p
                class="font-mono text-[0.58rem] uppercase tracking-[0.28em] text-white/35"
              >
                Changes / 03
              </p>
              <h2
                class="mt-5 font-display text-[clamp(3.5rem,6vw,6rem)] font-medium leading-[0.88] tracking-[-0.075em]"
              >
                Stay sharp<br />
                <span class="font-serif font-light italic text-brand-300"
                  >after launch.</span
                >
              </h2>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
              <article
                class="care-card rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-7"
              >
                <h3 class="font-display text-2xl font-medium">
                  Changes after launch
                </h3>
                <p class="mt-2 text-sm text-white/40">
                  Small text and image tweaks are included with hosting.
                </p>
                <ul
                  class="mt-7 border-t border-white/10 pt-6 text-sm text-white/50"
                >
                  <li class="flex gap-3">
                    <span class="text-brand-300">+</span>Submit a change request
                    from your account
                  </li>
                  <li class="mt-3 flex gap-3">
                    <span class="text-brand-300">+</span>We scope it and send a
                    fixed quote
                  </li>
                  <li class="mt-3 flex gap-3">
                    <span class="text-brand-300">+</span>Approve it and the work
                    is paid from your prepaid wallet
                  </li>
                  <li class="mt-3 flex gap-3">
                    <span class="text-brand-300">+</span>No surprises, no
                    retainers
                  </li>
                </ul>
                <NuxtLink
                  to="/account"
                  class="mt-7 inline-flex text-sm font-medium text-brand-300 hover:underline"
                >
                  Open your account &rarr;
                </NuxtLink>
              </article>
              <article
                class="care-card rounded-[1.5rem] border border-white/10 bg-white/[0.025] p-7"
              >
                <h3 class="font-display text-2xl font-medium">
                  Already have a website?
                </h3>
                <p class="mt-2 text-sm text-white/40">
                  We also host and look after sites we didn't build.
                </p>
                <ul
                  class="mt-7 border-t border-white/10 pt-6 text-sm text-white/50"
                >
                  <li class="flex gap-3">
                    <span class="text-brand-300">+</span>Tell us where it's
                    hosted and what it runs on
                  </li>
                  <li class="mt-3 flex gap-3">
                    <span class="text-brand-300">+</span>We confirm the right
                    hosting plan and migrate it
                  </li>
                  <li class="mt-3 flex gap-3">
                    <span class="text-brand-300">+</span>Fast, backed up, and
                    online from day one
                  </li>
                </ul>
                <NuxtLink
                  to="/contact"
                  class="mt-7 inline-flex text-sm font-medium text-brand-300 hover:underline"
                >
                  Tell us about your site &rarr;
                </NuxtLink>
              </article>
            </div>
          </div>
        </section>
      </div>
    </section>

    <section class="border-y border-white/10 px-6 py-20 sm:px-10 lg:px-20">
      <div
        class="mx-auto grid max-w-[1600px] gap-12 lg:grid-cols-[0.42fr_1fr] lg:items-end"
      >
        <div>
          <p
            class="font-mono text-[0.58rem] uppercase tracking-[0.28em] text-white/35"
          >
            Credits / 04
          </p>
          <h2
            class="mt-5 font-display text-[clamp(3.5rem,6vw,6rem)] font-medium leading-[0.88] tracking-[-0.075em]"
          >
            Fund once.<br />
            <span class="font-serif font-light italic text-brand-300"
              >Move faster.</span
            >
          </h2>
        </div>
        <div class="grid gap-8 md:grid-cols-3">
          <div class="border-t border-white/12 pt-5">
            <span class="font-mono text-[0.5rem] tracking-[0.2em] text-white/25"
              >01</span
            >
            <h3 class="mt-4 font-display text-2xl tracking-[-0.05em]">
              Instant approvals
            </h3>
            <p class="mt-3 text-sm leading-relaxed text-white/42">
              Approved changes, domains, and services can begin without waiting
              for another bank clearance.
            </p>
          </div>
          <div class="border-t border-white/12 pt-5">
            <span class="font-mono text-[0.5rem] tracking-[0.2em] text-white/25"
              >02</span
            >
            <h3 class="mt-4 font-display text-2xl tracking-[-0.05em]">
              Smart checkout
            </h3>
            <p class="mt-3 text-sm leading-relaxed text-white/42">
              Available credit is used first. If it does not cover the full
              cost, Paystack securely charges only the difference.
            </p>
          </div>
          <div class="border-t border-white/12 pt-5">
            <span class="font-mono text-[0.5rem] tracking-[0.2em] text-white/25"
              >03</span
            >
            <h3 class="mt-4 font-display text-2xl tracking-[-0.05em]">
              Clear runway
            </h3>
            <p class="mt-3 text-sm leading-relaxed text-white/42">
              Your dashboard shows monthly burn and estimated runway. Low
              balances receive a warning and seven-day grace period.
            </p>
          </div>
        </div>
      </div>
    </section>

    <FaqAccordion />
    <CtaSection
      title="Not sure which one fits?"
      subtitle="Send us your idea and we'll recommend the right route with a clear scope."
    />
  </main>
</template>

<style scoped>
.pricing-page {
  background:
    radial-gradient(
      circle at 75% 10%,
      rgba(255, 255, 255, 0.035),
      transparent 25%
    ),
    #0e0d0c;
}

.package-card {
  isolation: isolate;
}

.package-card.is-featured {
  background: rgba(255, 255, 255, 0.035);
}

.package-glow {
  z-index: -1;
  background: radial-gradient(
    circle at 60% 15%,
    rgba(221, 214, 202, 0.1),
    transparent 45%
  );
  transition: opacity 400ms ease;
}

.package-card:hover .package-glow,
.package-card.is-featured .package-glow {
  opacity: 1;
}

.package-arrow {
  transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
}

.package-card:hover .package-arrow {
  transform: translate(0.2rem, -0.2rem);
}

.hosting-card,
.care-card {
  transition:
    background-color 350ms ease,
    border-color 350ms ease,
    transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.hosting-card:hover,
.care-card:hover {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.035);
  transform: translateY(-0.3rem);
}

.infra-orbit {
  box-shadow:
    inset 0 0 0 2rem rgba(255, 255, 255, 0.015),
    inset 0 0 0 5rem rgba(255, 255, 255, 0.01);
}

.domain-grid {
  opacity: 0.12;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px);
  background-size: 3.5rem 3.5rem;
  mask-image: radial-gradient(circle at 70% 40%, black, transparent 65%);
}

@media (max-width: 767px) {
  .comparison-grid {
    overflow-x: auto;
  }

  .comparison-grid > div {
    min-width: 46rem;
  }
}
</style>
