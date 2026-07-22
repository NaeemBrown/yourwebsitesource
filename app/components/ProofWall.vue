<script setup lang="ts">
import { projects, type ProjectCategory } from "~~/shared/site";
import type { WebsiteType } from "~/types/proof";

const websiteTypes: WebsiteType[] = [
  {
    category: "SaaS",
    title: "SaaS Websites",
    description:
      "Product-led websites that explain the offer, show the platform, and move visitors toward trials, demos, or paid plans.",
    bestFor: "Software tools, subscriptions, dashboards, and B2B products.",
    pieces: ["Pricing", "Feature pages", "Auth flows", "Docs"],
    icon: "dashboard",
    accent: "#e6e6e6",
  },
  {
    category: "E-commerce",
    title: "Online Stores",
    description:
      "Fast storefronts with product storytelling, smooth browsing, cart flows, and checkout paths that feel easy to trust.",
    bestFor:
      "Retail brands, drops, subscriptions, bookings, and catalog sites.",
    pieces: ["Product pages", "Cart", "Checkout", "Search"],
    icon: "cart",
    accent: "#cfcfcf",
  },
  {
    category: "Agency",
    title: "Agency Sites",
    description:
      "Credibility-first websites that make services, case studies, and contact paths clear without feeling generic.",
    bestFor:
      "Studios, law firms, consultants, teams, and local service brands.",
    pieces: ["Services", "Case studies", "CMS", "Lead forms"],
    icon: "layers",
    accent: "#dcdcdc",
  },
  {
    category: "Portfolio",
    title: "Portfolio Sites",
    description:
      "Visual showcases with strong motion, project storytelling, and a presentation style built around the work itself.",
    bestFor:
      "Designers, artists, photographers, creators, and personal brands.",
    pieces: ["Gallery", "Project pages", "Motion", "Media"],
    icon: "gallery",
    accent: "#c2c2c2",
  },
  {
    category: "Web App",
    title: "Web Apps",
    description:
      "Interactive tools and portals with real workflows, user states, data views, and product-level interface polish.",
    bestFor: "Dashboards, portals, internal tools, booking tools, and MVPs.",
    pieces: ["Dashboard", "Roles", "Realtime", "Exports"],
    icon: "app",
    accent: "#ababab",
  },
  {
    category: "Landing",
    title: "Landing Pages",
    description:
      "Focused one-page experiences built around a single offer, campaign, product launch, or lead capture goal.",
    bestFor: "Launches, ads, waitlists, events, and simple offers.",
    pieces: ["Hero", "Benefits", "FAQ", "CTA"],
    icon: "target",
    accent: "#f0f0f0",
  },
];

const activeCategory = ref<ProjectCategory>("SaaS");

// both arrays are non-empty compile-time constants, so index 0 always exists
const activeType = computed(
  () =>
    websiteTypes.find((type) => type.category === activeCategory.value) ??
    websiteTypes[0]!,
);

const activeExample = computed(
  () =>
    projects.find((project) => project.category === activeCategory.value) ??
    projects[0]!,
);

const categoryCounts = computed(() =>
  websiteTypes.map((type) => ({
    category: type.category,
    count: projects.filter((project) => project.category === type.category)
      .length,
  })),
);
</script>

<template>
  <section class="px-4 py-36 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-7xl">
      <SectionHeading
        eyebrow="Build Range"
        title="Website types we build"
        subtitle="Explore the main kinds of sites we can design, develop, and tailor around your business."
      />

      <div
        class="mt-20 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.8fr)] lg:items-stretch"
      >
        <div
          class="glass gradient-border relative min-h-[34rem] overflow-hidden rounded-2xl p-5 sm:p-7"
        >
          <div class="type-map absolute inset-0" aria-hidden="true" />
          <div class="relative grid h-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="(type, index) in websiteTypes"
              :key="type.category"
              type="button"
              class="type-node group relative flex min-h-48 flex-col justify-between overflow-hidden rounded-xl border p-4 text-left transition duration-300 sm:p-5"
              :class="
                activeCategory === type.category
                  ? 'is-active border-white/40 bg-white/[0.07]'
                  : 'border-white/10 bg-white/[0.035] hover:border-white/30 hover:bg-white/[0.07]'
              "
              :style="`--node-index:${index};--accent:${type.accent}`"
              @click="activeCategory = type.category"
            >
              <span class="node-sheen" aria-hidden="true" />
              <span class="node-corner node-corner-a" aria-hidden="true" />
              <span class="node-corner node-corner-b" aria-hidden="true" />

              <span class="relative flex items-start justify-between gap-3">
                <span class="node-icon grid place-items-center">
                  <svg
                    v-if="type.icon === 'dashboard'"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="3" />
                    <path d="M7 15v-3M12 15V9M17 15v-5" />
                  </svg>
                  <svg
                    v-else-if="type.icon === 'cart'"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 5h2l2 11h9l2-7H8" />
                    <path d="M10 20h.01M17 20h.01" />
                  </svg>
                  <svg
                    v-else-if="type.icon === 'layers'"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m12 3 8 4-8 4-8-4 8-4Z" />
                    <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
                  </svg>
                  <svg
                    v-else-if="type.icon === 'gallery'"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="4" y="5" width="16" height="14" rx="3" />
                    <path d="m7 16 3.2-3.2 2.3 2.3 2.5-3.1L18 16" />
                    <path d="M8 9h.01" />
                  </svg>
                  <svg
                    v-else-if="type.icon === 'app'"
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="4" y="4" width="7" height="7" rx="2" />
                    <rect x="13" y="4" width="7" height="7" rx="2" />
                    <rect x="4" y="13" width="7" height="7" rx="2" />
                    <path d="M14 17h5M16.5 14.5v5" />
                  </svg>
                  <svg
                    v-else
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </span>

                <span class="node-index"> 0{{ index + 1 }} </span>
              </span>

              <span class="relative mt-5 block">
                <span
                  class="block font-display text-2xl font-bold leading-none text-white"
                >
                  {{ type.category }}
                </span>
                <span class="mt-3 block text-sm leading-relaxed text-slate-400">
                  {{ type.bestFor }}
                </span>
              </span>

              <span class="node-rail mt-5" aria-hidden="true">
                <span />
              </span>
            </button>
          </div>
        </div>

        <aside
          v-spotlight
          class="glass gradient-border relative overflow-hidden rounded-2xl p-6 sm:p-7"
        >
          <div
            class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent"
          />
          <p
            class="text-xs font-semibold uppercase tracking-[0.28em] text-brand-200"
          >
            Selected Type
          </p>
          <h3
            class="mt-4 font-display text-4xl font-bold leading-tight text-white"
          >
            {{ activeType.title }}
          </h3>
          <p class="mt-4 text-sm leading-7 text-slate-300">
            {{ activeType.description }}
          </p>

          <div class="mt-7 rounded-xl border border-white/10 bg-black/20 p-4">
            <p
              class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"
            >
              Common build pieces
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <span
                v-for="piece in activeType.pieces"
                :key="piece"
                class="rounded-md bg-white/[0.05] px-2.5 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10"
              >
                {{ piece }}
              </span>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-2 gap-3">
            <div class="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p class="text-xs text-slate-500">Example</p>
              <p class="mt-1 text-sm font-semibold text-white">
                {{ activeExample.name }}
              </p>
            </div>
            <div class="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p class="text-xs text-slate-500">In showcase</p>
              <p class="mt-1 text-sm font-semibold text-white">
                {{
                  categoryCounts.find(
                    (item) => item.category === activeCategory,
                  )?.count ?? 0
                }}
                examples
              </p>
            </div>
          </div>

          <NuxtLink
            to="/showcase"
            class="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-brand-100"
          >
            Browse examples
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </NuxtLink>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.type-map {
  background:
    radial-gradient(
      circle at 18% 22%,
      rgba(255, 255, 255, 0.12),
      transparent 22%
    ),
    radial-gradient(
      circle at 82% 72%,
      rgba(255, 255, 255, 0.1),
      transparent 24%
    ),
    linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  background-size:
    auto,
    auto,
    44px 44px,
    44px 44px;
  mask-image: radial-gradient(circle at center, black, transparent 78%);
  opacity: 0.9;
}

.type-node::before {
  background:
    radial-gradient(
      circle at center,
      color-mix(in srgb, var(--accent) 40%, transparent),
      transparent 68%
    ),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--accent) 28%, transparent),
      rgba(255, 255, 255, 0.06)
    );
  content: "";
  filter: blur(1px);
  inset: auto -24% -36% auto;
  height: 8rem;
  opacity: 0.72;
  position: absolute;
  rotate: calc(var(--node-index) * 12deg);
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
  width: 11rem;
}

.type-node::after {
  background:
    linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--accent) 80%, white 20%),
      transparent
    ),
    linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent);
  content: "";
  height: 1px;
  left: 10%;
  opacity: 0;
  position: absolute;
  right: 10%;
  top: 0;
  transition: opacity 0.3s ease;
}

.type-node:hover::before {
  opacity: 1;
  transform: translateY(-0.5rem) scale(1.08);
}

.type-node:hover,
.type-node.is-active {
  transform: translateY(-0.35rem);
}

.type-node:hover::after,
.type-node.is-active::after {
  opacity: 1;
}

.node-sheen {
  background: linear-gradient(
    120deg,
    transparent 15%,
    rgba(255, 255, 255, 0.14),
    transparent 42%
  );
  inset: 0;
  opacity: 0;
  position: absolute;
  transform: translateX(-60%);
  transition:
    opacity 0.3s ease,
    transform 0.55s ease;
}

.type-node:hover .node-sheen,
.type-node.is-active .node-sheen {
  opacity: 1;
  transform: translateX(42%);
}

.node-corner {
  border-color: color-mix(in srgb, var(--accent) 70%, white 15%);
  height: 1.45rem;
  opacity: 0;
  position: absolute;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  width: 1.45rem;
}

.node-corner-a {
  border-left-width: 1px;
  border-top-width: 1px;
  left: 0.75rem;
  top: 0.75rem;
  transform: translate(0.25rem, 0.25rem);
}

.node-corner-b {
  border-bottom-width: 1px;
  border-right-width: 1px;
  bottom: 0.75rem;
  right: 0.75rem;
  transform: translate(-0.25rem, -0.25rem);
}

.type-node:hover .node-corner,
.type-node.is-active .node-corner {
  opacity: 0.9;
  transform: translate(0);
}

.node-icon {
  background:
    radial-gradient(
      circle at 30% 20%,
      rgba(255, 255, 255, 0.24),
      transparent 42%
    ),
    color-mix(in srgb, var(--accent) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 38%, white 10%);
  border-radius: 0.85rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 16px 40px color-mix(in srgb, var(--accent) 16%, transparent);
  color: color-mix(in srgb, var(--accent) 78%, white 22%);
  height: 3.25rem;
  position: relative;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
  width: 3.25rem;
}

.type-node:hover .node-icon,
.type-node.is-active .node-icon {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 18px 54px color-mix(in srgb, var(--accent) 28%, transparent);
  transform: scale(1.04) rotate(-3deg);
}

.node-index {
  color: color-mix(in srgb, var(--accent) 62%, white 20%);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  line-height: 1;
  opacity: 0.75;
  padding-top: 0.2rem;
  text-transform: uppercase;
}

.node-rail {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  display: block;
  height: 3px;
  overflow: hidden;
  position: relative;
  width: 100%;
}

.node-rail span {
  background: linear-gradient(90deg, var(--accent), rgba(255, 255, 255, 0.85));
  border-radius: inherit;
  display: block;
  height: 100%;
  transform: scaleX(0.28);
  transform-origin: left;
  transition: transform 0.3s ease;
  width: 100%;
}

.type-node:hover .node-rail span,
.type-node.is-active .node-rail span {
  transform: scaleX(1);
}
</style>
