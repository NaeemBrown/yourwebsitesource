<script setup lang="ts">
import { buildPackages, formatUsdCents, estimateZar } from "~~/shared/billing";
import type { AuthUser } from "~/types/auth";

/**
 * Build checkout intake (WebForgePlan2 §4.6). Collects name/email (prefilled if
 * signed in), shows the USD price + the ZAR amount that will actually be
 * charged, then starts Paystack checkout.
 */
const route = useRoute();
const { user, signInWithGoogle } = useAuth();
const { startCheckout, loading, error } = useCheckout();
const { balanceCents, refresh: refreshWallet } = useWalletBalance();

const planKey = computed(() => String(route.query.plan ?? ""));
const pkg = computed(() => buildPackages[planKey.value]);

const config = useRuntimeConfig();
const rate = Number(config.public.usdToZar) || 17;

const name = ref("");
const email = ref("");
const useWalletFirst = ref(true);
const briefOpen = ref(false);
const briefSubmitted = ref(false);
const briefSaving = ref(false);
const briefError = ref("");
const briefId = ref("");
const expandedField = ref<"goals" | "pages" | null>(null);
const openDropdown = ref<string | null>(null);
const brief = reactive({
  businessType: "",
  siteType: "",
  pageCount: "",
  deadline: "",
  goals: "",
  pages: "",
  features: [] as string[],
  references: "",
});

const businessTypes = [
  "Startup / SaaS",
  "Local business",
  "E-commerce brand",
  "Agency / studio",
  "Personal brand",
  "Other",
];
const siteTypes = [
  "Marketing website",
  "Online store",
  "Portfolio",
  "Web app / dashboard",
  "Existing site redesign",
];
const pageCounts = ["1 - 3 pages", "4 - 6 pages", "7 - 12 pages", "12+ pages"];
const deadlines = ["ASAP", "2 - 4 weeks", "1 - 2 months", "Flexible"];
const featureOptions = [
  "Contact form",
  "Booking flow",
  "Online payments",
  "CMS / blog",
  "Animations",
  "User accounts",
  "SEO setup",
  "Analytics",
];
const dropdowns = [
  {
    key: "businessType",
    label: "Business type",
    placeholder: "Select closest match",
    options: businessTypes,
  },
  {
    key: "siteType",
    label: "Type of site",
    placeholder: "Select site type",
    options: siteTypes,
  },
  {
    key: "pageCount",
    label: "Estimated page count",
    placeholder: "Select page range",
    options: pageCounts,
  },
  {
    key: "deadline",
    label: "Preferred deadline",
    placeholder: "Select timing",
    options: deadlines,
  },
] as const;

const walletBalanceCents = computed(() => Math.max(0, balanceCents.value ?? 0));
const hasWalletFunds = computed(
  () => !!user.value && walletBalanceCents.value > 0,
);
const walletAppliedCents = computed(() => {
  if (!pkg.value || !hasWalletFunds.value || !useWalletFirst.value) return 0;
  return Math.min(pkg.value.amountUsdCents, walletBalanceCents.value);
});
const chargeUsdCents = computed(() => {
  if (!pkg.value) return 0;
  return Math.max(0, pkg.value.amountUsdCents - walletAppliedCents.value);
});

// Prefill identity from the signed-in user. The wallet balance is refreshed
// by useWalletBalance()'s own auth watcher, so we must NOT call refreshWallet()
// here: refresh() reads and writes its `loading` ref, which would become a
// tracked dependency of this effect and re-trigger it in an infinite loop
// (spamming /api/account/wallet).
watchEffect(() => {
  if (user.value) {
    name.value ||= user.value.displayName ?? "";
    email.value ||= user.value.email ?? "";
  }
});

const emailValid = computed(() =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value),
);
const canSubmit = computed(
  () => !!pkg.value && emailValid.value && !loading.value,
);

// Per-field brief validation. `briefAttempted` flips on the first save attempt
// so incomplete fields highlight red live and clear as the user fills them.
const briefAttempted = ref(false);
const briefFieldErrors = computed(() => ({
  businessType: briefAttempted.value && !brief.businessType,
  siteType: briefAttempted.value && !brief.siteType,
  pageCount: briefAttempted.value && !brief.pageCount,
  deadline: briefAttempted.value && !brief.deadline,
  goals: briefAttempted.value && brief.goals.trim().length < 10,
  pages: briefAttempted.value && brief.pages.trim().length < 3,
  features: briefAttempted.value && brief.features.length === 0,
}));
const briefIsComplete = computed(
  () =>
    !!brief.businessType &&
    !!brief.siteType &&
    !!brief.pageCount &&
    !!brief.deadline &&
    brief.goals.trim().length >= 10 &&
    brief.pages.trim().length >= 3 &&
    brief.features.length > 0,
);

function toggleFeature(feature: string) {
  const index = brief.features.indexOf(feature);
  if (index >= 0) brief.features.splice(index, 1);
  else brief.features.push(feature);
}

function selectBriefOption(
  key: (typeof dropdowns)[number]["key"],
  value: string,
) {
  brief[key] = value;
  openDropdown.value = null;
}

function buildBriefMessage() {
  return [
    `Checkout project brief: ${pkg.value?.label ?? planKey.value}`,
    "",
    `Business type: ${brief.businessType}`,
    `Site type: ${brief.siteType}`,
    `Estimated page count: ${brief.pageCount}`,
    `Preferred deadline: ${brief.deadline}`,
    `Main goals: ${brief.goals}`,
    `Pages / sections: ${brief.pages}`,
    `Required features: ${brief.features.join(", ")}`,
    `References: ${brief.references || "Not provided"}`,
  ].join("\n");
}

function openBrief() {
  if (!canSubmit.value) return;
  briefError.value = "";
  briefOpen.value = true;
}

async function submitBrief() {
  briefAttempted.value = true;
  if (!briefIsComplete.value) {
    briefError.value = "Complete each highlighted field before continuing.";
    return;
  }

  briefSaving.value = true;
  briefError.value = "";
  try {
    // Authenticate right before we save the brief and take payment, so the
    // order is always tied to a real account and the brief email matches the
    // authenticated identity (launch req §3).
    if (!user.value) {
      await signInWithGoogle();
      // signInWithGoogle() populates the store ref, which TS control-flow
      // analysis can't see — re-read it via a cast to undo the stale `null`
      // narrowing from the outer check.
      const signedIn = user.value as AuthUser | null;
      if (!signedIn) {
        briefError.value = "Please sign in to continue to payment.";
        return;
      }
      name.value = signedIn.displayName ?? name.value;
      email.value = signedIn.email ?? email.value;
      await refreshWallet(true);
    }

    const saved = await $fetch<{ id: string }>("/api/checkout/brief", {
      method: "POST",
      body: {
        email: email.value.trim(),
        planKey: planKey.value,
        answers: {
          ...brief,
          summary: buildBriefMessage(),
        },
      },
    });
    briefId.value = saved.id;
    briefSubmitted.value = true;
    briefOpen.value = false;
    await pay();
  } catch {
    briefError.value = "We couldn't save your brief. Please try again.";
  } finally {
    briefSaving.value = false;
  }
}

async function pay() {
  if (!pkg.value) return;
  if (!briefSubmitted.value) {
    openBrief();
    return;
  }
  if (!user.value) {
    await signInWithGoogle();
    if (!user.value) return;
    await refreshWallet(true);
  }
  await startCheckout({
    purpose: "build",
    planKey: planKey.value,
    name: name.value.trim() || undefined,
    email: email.value.trim() || undefined,
    briefId: briefId.value || undefined,
    useWalletFirst: hasWalletFunds.value && useWalletFirst.value,
  });
}

useSeoMeta({ title: "Checkout — TheWebsiteForge", robots: "noindex" });
</script>

<template>
  <div class="checkout-page px-4 pt-36 pb-24 sm:px-6 lg:px-8">
    <div class="checkout-stage mx-auto" :class="{ 'brief-is-open': briefOpen }">
      <div
        v-if="!pkg"
        v-motion="reveal(0)"
        class="glass rounded-2xl p-8 text-center"
      >
        <h1 class="font-display text-2xl font-bold text-white">
          Plan not found
        </h1>
        <p class="mt-3 text-slate-400">
          We couldn't find that package. Head back to pricing to choose one.
        </p>
        <NuxtLink
          to="/pricing"
          class="btn-gradient mt-6 inline-flex rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
        >
          View pricing
        </NuxtLink>
      </div>

      <div
        v-else
        v-motion="reveal(0)"
        class="checkout-card glass-strong overflow-hidden rounded-[2rem] p-8 sm:p-12"
      >
        <div
          class="mb-8 flex items-center justify-between border-b border-white/10 pb-5 font-mono text-[0.55rem] uppercase tracking-[0.24em] text-white/35"
        >
          <span>Secure build checkout</span>
          <span>01 / Details</span>
        </div>
        <span
          class="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-300"
        >
          Website build
        </span>
        <h1 class="mt-4 font-display text-3xl font-bold text-white">
          {{ pkg.label }}
        </h1>
        <p class="mt-2 text-slate-400">{{ pkg.blurb }}</p>
        <p
          class="mt-4 border-l border-brand-300/40 pl-4 text-sm leading-relaxed text-slate-400"
        >
          Includes your first month of managed hosting free. After that, only
          the recurring services you choose are deducted from your wallet.
        </p>

        <div class="mt-6 flex items-baseline gap-2">
          <span class="font-display text-4xl font-bold text-white">
            {{ formatUsdCents(pkg.amountUsdCents) }}
          </span>
          <span class="text-sm text-slate-500">one-off</span>
        </div>
        <p class="mt-1 text-sm text-slate-400">
          Secure checkout charge
          <span class="font-semibold text-brand-300">
            {{ estimateZar(chargeUsdCents, rate) }}
          </span>
          (ZAR equivalent).
        </p>

        <div
          v-if="hasWalletFunds"
          class="wallet-card mt-6 rounded-2xl border border-white/10 p-5"
        >
          <label class="flex cursor-pointer items-start gap-3">
            <input
              v-model="useWalletFirst"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-white/30 bg-black/40 text-brand-500 focus:ring-brand-500"
            />
            <span>
              <span class="block text-sm font-semibold text-white"
                >Use funds in my wallet first</span
              >
              <span class="mt-0.5 block text-xs text-slate-400">
                Available now: {{ formatUsdCents(walletBalanceCents) }}
              </span>
            </span>
          </label>

          <div v-if="useWalletFirst" class="mt-3 space-y-1 text-xs">
            <p class="flex items-center justify-between text-slate-300">
              <span>Wallet applied</span>
              <span class="font-semibold text-white"
                >-{{ formatUsdCents(walletAppliedCents) }}</span
              >
            </p>
            <p class="flex items-center justify-between text-slate-300">
              <span>Charge at checkout</span>
              <span class="font-semibold text-brand-300">{{
                formatUsdCents(chargeUsdCents)
              }}</span>
            </p>
            <p v-if="chargeUsdCents === 0" class="text-white">
              Your wallet fully covers this build. No Paystack charge will be
              needed.
            </p>
          </div>
        </div>

        <div
          class="checkout-fields mt-10 space-y-5 border-t border-white/10 pt-8"
        >
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300"
              >Your name</label
            >
            <input
              v-model="name"
              type="text"
              placeholder="Jane Doe"
              class="checkout-input w-full rounded-xl border border-white/10 px-4 py-3.5 text-white outline-none transition"
            />
          </div>
          <div>
            <label class="mb-1.5 block text-sm font-medium text-slate-300"
              >Email</label
            >
            <input
              v-model="email"
              type="email"
              placeholder="jane@company.com"
              class="checkout-input w-full rounded-xl border border-white/10 px-4 py-3.5 text-white outline-none transition"
            />
            <p class="mt-1 text-xs text-slate-500">
              Your receipt and project updates go here.
            </p>
          </div>
        </div>

        <p v-if="error" class="mt-4 text-sm text-white">{{ error }}</p>

        <template v-if="!briefOpen">
          <button
            type="button"
            :disabled="!canSubmit"
            class="checkout-button mt-7 inline-flex w-full items-center justify-center rounded-full bg-[#ece9e2] px-5 py-4 text-sm font-semibold text-[#151412] disabled:cursor-not-allowed disabled:opacity-50"
            @click="pay"
          >
            {{
              loading
                ? "Starting checkout…"
                : !user
                  ? "Complete brief & continue"
                  : !briefSubmitted
                    ? "Complete project brief"
                    : chargeUsdCents === 0
                      ? "Pay with wallet funds"
                      : "Proceed to secure payment"
            }}
          </button>
          <p class="mt-3 text-center text-xs text-slate-500">
            Your details stay here while you sign in. Wallet credit is then
            applied first, and Paystack securely charges only any remaining
            amount.
          </p>
        </template>
      </div>

      <Transition name="brief-modal">
        <section
          v-if="briefOpen"
          class="brief-modal relative overflow-hidden rounded-[2rem] border border-white/10 p-6 text-white sm:p-8"
          role="region"
          aria-labelledby="brief-title"
        >
          <div class="brief-content">
            <button
              type="button"
              class="absolute top-5 right-5 grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/55 transition hover:bg-white/10 hover:text-white"
              aria-label="Close project brief"
              @click="briefOpen = false"
            >
              ×
            </button>

            <div class="max-w-xl pr-12">
              <p
                class="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-white/35"
              >
                Before payment / Project brief
              </p>
              <h2
                id="brief-title"
                class="mt-2 font-display text-3xl font-medium tracking-[-0.06em]"
              >
                Tell us what we're building.
              </h2>
              <p class="mt-2 text-xs leading-relaxed text-white/45">
                This gives the studio enough context to prepare your kickoff
                before your payment is complete.
              </p>
            </div>

            <form class="mt-5 space-y-4" @submit.prevent="submitBrief">
              <div class="grid gap-3 sm:grid-cols-2">
                <div
                  v-for="dropdown in dropdowns"
                  :key="dropdown.key"
                  class="custom-select"
                >
                  <span>{{ dropdown.label }}</span>
                  <button
                    type="button"
                    :class="{
                      'is-open': openDropdown === dropdown.key,
                      'has-error': briefFieldErrors[dropdown.key],
                    }"
                    @click="
                      openDropdown =
                        openDropdown === dropdown.key ? null : dropdown.key
                    "
                  >
                    <span>{{
                      brief[dropdown.key] || dropdown.placeholder
                    }}</span>
                    <i />
                  </button>
                  <Transition name="select-menu">
                    <div
                      v-if="openDropdown === dropdown.key"
                      class="custom-select-menu"
                    >
                      <button
                        v-for="item in dropdown.options"
                        :key="item"
                        type="button"
                        :class="{ 'is-selected': brief[dropdown.key] === item }"
                        @click="selectBriefOption(dropdown.key, item)"
                      >
                        {{ item }}
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  class="expand-field"
                  :class="{ 'has-error': briefFieldErrors.goals }"
                  @click="expandedField = 'goals'"
                >
                  <span>
                    <small>Main goal</small>
                    <strong>{{
                      brief.goals || "What should this website achieve?"
                    }}</strong>
                  </span>
                  <i>↗</i>
                </button>
                <button
                  type="button"
                  class="expand-field"
                  :class="{ 'has-error': briefFieldErrors.pages }"
                  @click="expandedField = 'pages'"
                >
                  <span>
                    <small>Expected pages or sections</small>
                    <strong>{{
                      brief.pages || "Home, services, pricing, contact..."
                    }}</strong>
                  </span>
                  <i>↗</i>
                </button>
              </div>

              <fieldset
                class="brief-fieldset"
                :class="{ 'has-error': briefFieldErrors.features }"
              >
                <legend class="text-xs font-medium text-white/55">
                  Required features
                </legend>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button
                    v-for="feature in featureOptions"
                    :key="feature"
                    type="button"
                    class="brief-chip rounded-full border px-3 py-1.5 text-[0.68rem] transition"
                    :class="{ 'is-active': brief.features.includes(feature) }"
                    @click="toggleFeature(feature)"
                  >
                    {{ feature }}
                  </button>
                </div>
              </fieldset>

              <label class="brief-field brief-reference">
                <span>Reference links <small>(optional)</small></span>
                <input
                  v-model="brief.references"
                  type="text"
                  placeholder="Sites, competitors, or inspiration you like"
                />
              </label>

              <p
                v-if="briefError"
                class="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75"
              >
                {{ briefError }}
              </p>

              <div
                class="flex flex-col-reverse gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p
                  class="max-w-sm text-[0.68rem] leading-relaxed text-white/30"
                >
                  Your brief is saved to our project inbox and attached to your
                  selected build.
                </p>
                <button
                  type="submit"
                  :disabled="briefSaving"
                  class="checkout-button inline-flex shrink-0 items-center justify-center rounded-full bg-[#ece9e2] px-6 py-3.5 text-sm font-semibold text-[#151412] disabled:opacity-50"
                >
                  {{
                    briefSaving
                      ? "Saving brief..."
                      : "Save brief & continue to payment"
                  }}
                </button>
              </div>
            </form>
          </div>
        </section>
      </Transition>
    </div>

    <Teleport to="body">
      <Transition name="editor-modal">
        <div
          v-if="expandedField"
          class="editor-backdrop fixed inset-0 z-[120] grid place-items-center p-4"
          @click.self="expandedField = null"
        >
          <section
            class="editor-modal w-full max-w-3xl rounded-[2rem] border border-white/10 p-6 text-white sm:p-10"
          >
            <div class="flex items-start justify-between gap-8">
              <div>
                <p
                  class="font-mono text-[0.55rem] uppercase tracking-[0.25em] text-white/35"
                >
                  Project brief / Expanded editor
                </p>
                <h3
                  class="mt-3 font-display text-4xl font-medium tracking-[-0.06em]"
                >
                  {{
                    expandedField === "goals"
                      ? "Main project goal"
                      : "Expected pages or sections"
                  }}
                </h3>
              </div>
              <button
                type="button"
                class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-white/55"
                @click="expandedField = null"
              >
                ×
              </button>
            </div>
            <textarea
              v-if="expandedField === 'goals'"
              v-model="brief.goals"
              autofocus
              rows="12"
              class="editor-textarea mt-8"
              placeholder="Explain what the website should achieve, who it serves, and what success looks like..."
            />
            <textarea
              v-else
              v-model="brief.pages"
              autofocus
              rows="12"
              class="editor-textarea mt-8"
              placeholder="List every page or section you expect..."
            />
            <div class="mt-5 flex items-center justify-between gap-5">
              <span class="text-xs text-white/30"
                >Your writing is preserved when this window closes.</span
              >
              <button
                type="button"
                class="rounded-full bg-[#ece9e2] px-6 py-3 text-sm font-semibold text-[#151412]"
                @click="expandedField = null"
              >
                Done writing
              </button>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.checkout-page {
  position: relative;
  min-height: 100vh;
}

.checkout-page::before {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(
      circle at 50% 15%,
      rgba(255, 255, 255, 0.055),
      transparent 28rem
    ),
    linear-gradient(135deg, rgba(255, 255, 255, 0.018), transparent 45%);
  content: "";
  pointer-events: none;
}

.checkout-stage {
  display: grid;
  width: 100%;
  max-width: 42rem;
  gap: 1rem;
  transition: max-width 800ms cubic-bezier(0.22, 1, 0.36, 1);
}

.checkout-stage.brief-is-open {
  max-width: 92rem;
}

.checkout-card {
  position: relative;
  align-self: start;
  background:
    linear-gradient(145deg, rgba(31, 30, 28, 0.97), rgba(20, 19, 18, 0.98)),
    #171614;
  box-shadow: 0 2rem 8rem rgba(0, 0, 0, 0.42);
}

.checkout-card::before {
  position: absolute;
  top: -8rem;
  right: -8rem;
  width: 18rem;
  height: 18rem;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  box-shadow:
    0 0 0 2.5rem rgba(255, 255, 255, 0.012),
    0 0 0 5rem rgba(255, 255, 255, 0.008);
  content: "";
  pointer-events: none;
}

.wallet-card {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.055),
    rgba(0, 0, 0, 0.18)
  );
}

.checkout-input {
  background: rgba(5, 5, 5, 0.34);
}

.checkout-input:focus {
  border-color: rgba(236, 233, 226, 0.38);
  background: rgba(5, 5, 5, 0.52);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.025);
}

.checkout-button {
  transition:
    transform 400ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 300ms ease;
}

.checkout-button:hover:not(:disabled) {
  background: #fff;
  transform: translateY(-2px);
}

.brief-modal {
  align-self: start;
  background:
    radial-gradient(
      circle at 85% 0%,
      rgba(255, 255, 255, 0.06),
      transparent 20rem
    ),
    #171614;
  box-shadow: 0 2rem 8rem rgba(0, 0, 0, 0.5);
}

.brief-field {
  display: block;
}

.brief-field > span {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
}

.brief-field small {
  color: rgba(255, 255, 255, 0.25);
}

.brief-field input,
.brief-field select,
.brief-field textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.8rem;
  outline: none;
  background: rgba(0, 0, 0, 0.24);
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  color: white;
  transition:
    border-color 250ms ease,
    background-color 250ms ease;
}

.brief-field select option {
  background: #171614;
}

.brief-field input:focus,
.brief-field select:focus,
.brief-field textarea:focus {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(0, 0, 0, 0.4);
}

.brief-chip {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.025);
  color: rgba(255, 255, 255, 0.48);
}

.brief-chip:hover,
.brief-chip.is-active {
  border-color: rgba(236, 233, 226, 0.42);
  background: rgba(236, 233, 226, 0.1);
  color: white;
}

/* Invalid-field highlighting after a failed save attempt */
.custom-select > button.has-error,
.expand-field.has-error {
  border-color: rgba(248, 113, 113, 0.7);
  background: rgba(248, 113, 113, 0.08);
}

.brief-fieldset.has-error legend {
  color: rgba(248, 113, 113, 0.9);
}

.brief-fieldset.has-error .brief-chip {
  border-color: rgba(248, 113, 113, 0.45);
}

.custom-select {
  position: relative;
  z-index: 5;
}

.custom-select:has(.custom-select-menu) {
  z-index: 15;
}

.custom-select > span {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.68rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.48);
}

.custom-select > button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.8rem;
  background: rgba(0, 0, 0, 0.24);
  padding: 0.72rem 0.9rem;
  font-size: 0.78rem;
  text-align: left;
  color: white;
}

.custom-select > button i {
  width: 0.38rem;
  height: 0.38rem;
  border-right: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: translateY(-0.12rem) rotate(45deg);
  transition: transform 300ms ease;
}

.custom-select > button.is-open i {
  transform: translateY(0.12rem) rotate(225deg);
}

.custom-select-menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  left: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.9rem;
  background: rgba(24, 23, 21, 0.98);
  padding: 0.3rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
}

.custom-select-menu button {
  display: block;
  width: 100%;
  border-radius: 0.62rem;
  padding: 0.62rem 0.72rem;
  font-size: 0.74rem;
  text-align: left;
  color: rgba(255, 255, 255, 0.5);
  transition:
    background-color 200ms ease,
    color 200ms ease;
}

.custom-select-menu button:hover,
.custom-select-menu button.is-selected {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.select-menu-enter-active,
.select-menu-leave-active {
  transition:
    opacity 180ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.select-menu-enter-from,
.select-menu-leave-to {
  opacity: 0;
  transform: translateY(-0.35rem) scale(0.98);
}

.expand-field {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.9rem;
  background: rgba(0, 0, 0, 0.22);
  padding: 0.8rem 0.9rem;
  text-align: left;
  transition:
    border-color 250ms ease,
    background-color 250ms ease;
}

.expand-field:hover {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.04);
}

.expand-field span {
  min-width: 0;
}

.expand-field small {
  display: block;
  font-size: 0.66rem;
  color: rgba(255, 255, 255, 0.42);
}

.expand-field strong {
  display: block;
  overflow: hidden;
  margin-top: 0.28rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.78);
}

.expand-field i {
  font-size: 0.9rem;
  font-style: normal;
  color: rgba(255, 255, 255, 0.35);
}

.editor-backdrop {
  background: rgba(5, 5, 5, 0.78);
  backdrop-filter: blur(18px);
}

.editor-modal {
  background:
    radial-gradient(
      circle at 85% 0%,
      rgba(255, 255, 255, 0.06),
      transparent 20rem
    ),
    #171614;
  box-shadow: 0 2rem 8rem rgba(0, 0, 0, 0.72);
}

.editor-textarea {
  width: 100%;
  resize: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.25rem;
  outline: none;
  background: rgba(0, 0, 0, 0.3);
  padding: 1.25rem;
  font-size: 1rem;
  line-height: 1.7;
  color: white;
}

.editor-textarea:focus {
  border-color: rgba(255, 255, 255, 0.35);
}

.editor-modal-enter-active,
.editor-modal-leave-active {
  transition: opacity 250ms ease;
}

.editor-modal-enter-active .editor-modal,
.editor-modal-leave-active .editor-modal {
  transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.editor-modal-enter-from,
.editor-modal-leave-to {
  opacity: 0;
}

.editor-modal-enter-from .editor-modal,
.editor-modal-leave-to .editor-modal {
  transform: translateY(1rem) scale(0.98);
}

.brief-modal-enter-active {
  transform-origin: left center;
  animation: brief-panel-build 1050ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.brief-modal-enter-active .brief-content {
  animation: brief-content-in 480ms ease 690ms both;
}

.brief-modal-leave-active {
  transform-origin: left center;
  animation: brief-panel-out 520ms cubic-bezier(0.55, 0, 1, 0.45) both;
}

.brief-modal-leave-active .brief-content {
  animation: brief-content-out 180ms ease both;
}

@keyframes brief-panel-build {
  0% {
    opacity: 0;
    border-radius: 0.4rem;
    transform: translateX(-7rem) scaleX(0.04) scaleY(0.045);
  }
  18% {
    opacity: 1;
  }
  48% {
    border-radius: 0.4rem;
    transform: translateX(-0.6rem) scaleX(1) scaleY(0.045);
  }
  68% {
    border-radius: 0.7rem;
    transform: translateX(0) scaleX(1) scaleY(0.045);
  }
  100% {
    border-radius: 2rem;
    transform: translateX(0) scaleX(1) scaleY(1);
  }
}

@keyframes brief-content-in {
  from {
    opacity: 0;
    transform: translateY(0.8rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes brief-content-out {
  to {
    opacity: 0;
    transform: translateY(0.4rem);
  }
}

@keyframes brief-panel-out {
  0% {
    opacity: 1;
    border-radius: 2rem;
    transform: translateX(0) scaleX(1) scaleY(1);
  }
  48% {
    opacity: 1;
    border-radius: 0.5rem;
    transform: translateX(0) scaleX(1) scaleY(0.04);
  }
  100% {
    opacity: 0;
    border-radius: 0.3rem;
    transform: translateX(-5rem) scaleX(0.05) scaleY(0.04);
  }
}

@media (min-width: 1100px) {
  .checkout-stage.brief-is-open {
    grid-template-columns: minmax(25rem, 0.82fr) minmax(36rem, 1.18fr);
  }

  .brief-modal {
    position: sticky;
    top: 7rem;
  }
}

@media (max-width: 1099px) {
  .checkout-stage.brief-is-open {
    max-width: 48rem;
  }

  .brief-modal {
    overflow: visible;
  }

  .brief-modal-enter-from,
  .brief-modal-leave-to {
    transform: translateY(-2rem) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .brief-modal-enter-active,
  .brief-modal-leave-active,
  .brief-modal-enter-active .brief-content,
  .brief-modal-leave-active .brief-content {
    animation-duration: 1ms;
    animation-delay: 0ms;
  }
}
</style>
