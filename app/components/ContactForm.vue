<script setup lang="ts">
import type {
  ContactErrorBody,
  ContactFormStep,
  ContactFormValues,
} from "~/types/contact";

const steps: ContactFormStep[] = [
  {
    eyebrow: "Step 01",
    title: "Contact Details",
    description: "Who should we reply to when we scope the project?",
  },
  {
    eyebrow: "Step 02",
    title: "Business & Site Type",
    description:
      "Tell us what kind of business this is and what needs building.",
  },
  {
    eyebrow: "Step 03",
    title: "Budget & Deadline",
    description:
      "Give us the range and timing so we can suggest the right path.",
  },
  {
    eyebrow: "Step 04",
    title: "Project Specifics",
    description: "Share the features, goals, and references that matter most.",
  },
];

const initialForm = (): ContactFormValues => ({
  name: "",
  email: "",
  company: "",
  phone: "",
  businessType: "",
  siteType: "",
  existingWebsite: "",
  budget: "",
  deadline: "",
  goals: "",
  pages: "",
  features: [],
  references: "",
  extraDetails: "",
  website: "",
});

const form = reactive<ContactFormValues>(initialForm());
const currentStep = ref(0);
const status = ref<"idle" | "loading" | "success" | "error">("idle");
const fieldErrors = ref<Record<string, string>>({});
const serverMessage = ref("");

const businessTypes = [
  "Startup / SaaS",
  "Local service business",
  "E-commerce brand",
  "Agency / studio",
  "Personal brand / creator",
  "Enterprise / internal team",
  "Other",
];

const siteTypes = [
  "Landing page",
  "Multi-page website",
  "Online store",
  "Portfolio",
  "Web app / dashboard",
  "Redesign existing site",
  "Not sure yet",
];

const budgets = [
  "Under $2.5k",
  "$2.5k - $5k",
  "$5k - $10k",
  "$10k+",
  "Need guidance",
];

const deadlines = [
  "ASAP",
  "2 - 4 weeks",
  "1 - 2 months",
  "Flexible",
  "Just exploring",
];

const featureOptions = [
  "Contact form",
  "Booking flow",
  "Online payments",
  "CMS / blog",
  "Animations",
  "User accounts",
  "Dashboard",
  "SEO setup",
  "Analytics",
  "API integration",
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-400/20";

const current = computed(() => steps[currentStep.value]);
const progress = computed(() => ((currentStep.value + 1) / steps.length) * 100);

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Minimum field lengths enforced per step.
const MIN_NAME_LENGTH = 2;
const MIN_GOALS_LENGTH = 10;
const MIN_PAGES_LENGTH = 3;

function validateStep(step = currentStep.value) {
  const errors: Record<string, string> = {};

  if (step === 0) {
    if (form.name.trim().length < MIN_NAME_LENGTH)
      errors.name = "Please enter your name.";
    if (!isEmail(form.email.trim()))
      errors.email = "Please enter a valid email.";
  }

  if (step === 1) {
    if (!form.businessType)
      errors.businessType = "Choose the closest business type.";
    if (!form.siteType) errors.siteType = "Choose the kind of site you need.";
  }

  if (step === 2) {
    if (!form.budget) errors.budget = "Choose a budget range.";
    if (!form.deadline) errors.deadline = "Choose a deadline.";
  }

  if (step === 3) {
    if (form.goals.trim().length < MIN_GOALS_LENGTH)
      errors.goals = `Tell us the main goal in at least ${MIN_GOALS_LENGTH} characters.`;
    if (form.pages.trim().length < MIN_PAGES_LENGTH)
      errors.pages = "List the pages or sections you expect.";
    if (!form.features.length) errors.features = "Choose at least one feature.";
    // The server rejects a combined message over 5000 chars — catch it here so
    // the user sees which fields to trim instead of an unhighlighted failure.
    if (buildMessage().length > 5000)
      errors.extraDetails =
        "Your brief is too long — please trim it to roughly 5,000 characters in total.";
  }

  fieldErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function goNext() {
  if (!validateStep()) return;
  currentStep.value = Math.min(currentStep.value + 1, steps.length - 1);
  fieldErrors.value = {};
}

function goBack() {
  currentStep.value = Math.max(currentStep.value - 1, 0);
  fieldErrors.value = {};
}

function toggleFeature(feature: string) {
  if (form.features.includes(feature)) {
    form.features = form.features.filter((item) => item !== feature);
  } else {
    form.features = [...form.features, feature];
  }
}

function buildMessage() {
  return [
    "New quote request",
    "",
    "Contact",
    `Name: ${form.name}`,
    `Email: ${form.email}`,
    `Company: ${form.company || "Not provided"}`,
    `Phone: ${form.phone || "Not provided"}`,
    "",
    "Business & site",
    `Business type: ${form.businessType}`,
    `Site type: ${form.siteType}`,
    `Existing website: ${form.existingWebsite || "Not provided"}`,
    "",
    "Budget & deadline",
    `Budget: ${form.budget}`,
    `Deadline: ${form.deadline}`,
    "",
    "Specifics",
    `Main goals: ${form.goals}`,
    `Pages/sections: ${form.pages}`,
    `Features: ${form.features.join(", ")}`,
    `References: ${form.references || "Not provided"}`,
    `Extra details: ${form.extraDetails || "Not provided"}`,
  ].join("\n");
}

async function submit() {
  if (!validateStep(3)) {
    currentStep.value = 3;
    return;
  }

  status.value = "loading";
  fieldErrors.value = {};
  serverMessage.value = "";

  try {
    const res = await $fetch<{ ok: boolean; message: string }>("/api/contact", {
      method: "POST",
      body: {
        name: form.name,
        email: form.email,
        company: form.company,
        budget: form.budget,
        message: buildMessage(),
        website: form.website,
      },
    });
    status.value = "success";
    serverMessage.value = res.message;
  } catch (err) {
    status.value = "error";
    const data = (err as ContactErrorBody)?.data?.data;
    if (data?.errors) {
      fieldErrors.value = data.errors;
      serverMessage.value = "Please fix the highlighted fields.";
      // Server errors can point at fields on earlier steps (name/email/company
      // live on step 0, budget on step 2; `message` maps to the step-4
      // textareas) — surface them where they render, and jump to the earliest
      // step that shows one, or the user stares at nothing highlighted.
      if (data.errors.message) {
        fieldErrors.value = {
          ...fieldErrors.value,
          extraDetails: data.errors.message,
        };
      }
      const errored = Object.keys(data.errors);
      if (errored.some((k) => ["name", "email", "company"].includes(k))) {
        currentStep.value = 0;
      } else if (errored.includes("budget")) {
        currentStep.value = 2;
      }
    } else {
      serverMessage.value = "Something went wrong. Please email us directly.";
    }
  }
}

function reset() {
  Object.assign(form, initialForm());
  currentStep.value = 0;
  status.value = "idle";
  fieldErrors.value = {};
  serverMessage.value = "";
}
</script>

<template>
  <div class="glass-strong gradient-border rounded-3xl p-6 sm:p-8">
    <div
      v-if="status === 'success'"
      class="flex flex-col items-center py-10 text-center"
    >
      <div
        class="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent-600"
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h3 class="mt-5 font-display text-xl font-semibold text-white">
        Quote request sent
      </h3>
      <p class="mt-2 max-w-sm text-sm text-slate-400">{{ serverMessage }}</p>
      <button
        type="button"
        class="glass mt-6 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        @click="reset"
      >
        Send another
      </button>
    </div>

    <form v-else class="space-y-6" novalidate @submit.prevent="submit">
      <div class="absolute -left-[9999px]" aria-hidden="true">
        <label
          >Leave this empty<input
            v-model="form.website"
            tabindex="-1"
            autocomplete="off"
        /></label>
      </div>

      <div>
        <div class="flex items-center justify-between gap-4">
          <div>
            <p
              class="text-xs font-semibold uppercase tracking-[0.24em] text-brand-300"
            >
              {{ current.eyebrow }}
            </p>
            <h3 class="mt-2 font-display text-2xl font-bold text-white">
              {{ current.title }}
            </h3>
            <p class="mt-1 text-sm leading-relaxed text-slate-400">
              {{ current.description }}
            </p>
          </div>
          <span class="hidden text-sm font-semibold text-slate-500 sm:block">
            {{ currentStep + 1 }}/{{ steps.length }}
          </span>
        </div>

        <div class="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <div class="mt-5 grid grid-cols-4 gap-2">
          <button
            v-for="(step, index) in steps"
            :key="step.title"
            type="button"
            class="h-2 rounded-full transition"
            :class="index <= currentStep ? 'bg-brand-300' : 'bg-white/10'"
            :aria-label="step.title"
            @click="index < currentStep && (currentStep = index)"
          />
        </div>
      </div>

      <Transition name="quote-step" mode="out-in">
        <div :key="currentStep" class="min-h-[28rem] space-y-4">
          <template v-if="currentStep === 0">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300"
                  >Name</label
                >
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="Jane Doe"
                  :class="inputClass"
                />
                <p v-if="fieldErrors.name" class="mt-1 text-xs text-white">
                  {{ fieldErrors.name }}
                </p>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300"
                  >Email</label
                >
                <input
                  v-model="form.email"
                  type="email"
                  placeholder="jane@company.com"
                  :class="inputClass"
                />
                <p v-if="fieldErrors.email" class="mt-1 text-xs text-white">
                  {{ fieldErrors.email }}
                </p>
              </div>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300">
                  Company <span class="text-slate-600">(optional)</span>
                </label>
                <input
                  v-model="form.company"
                  type="text"
                  maxlength="200"
                  placeholder="Acme Inc."
                  :class="inputClass"
                />
                <p v-if="fieldErrors.company" class="mt-1 text-xs text-white">
                  {{ fieldErrors.company }}
                </p>
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300">
                  Phone <span class="text-slate-600">(optional)</span>
                </label>
                <input
                  v-model="form.phone"
                  type="tel"
                  placeholder="+1 555 000 0000"
                  :class="inputClass"
                />
              </div>
            </div>
          </template>

          <template v-else-if="currentStep === 1">
            <div>
              <label class="mb-2 block text-xs font-medium text-slate-300"
                >Type of business</label
              >
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="type in businessTypes"
                  :key="type"
                  type="button"
                  class="rounded-xl border px-4 py-3 text-left text-sm font-semibold transition"
                  :class="
                    form.businessType === type
                      ? 'border-brand-300/70 bg-brand-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  "
                  @click="form.businessType = type"
                >
                  {{ type }}
                </button>
              </div>
              <p
                v-if="fieldErrors.businessType"
                class="mt-1 text-xs text-white"
              >
                {{ fieldErrors.businessType }}
              </p>
            </div>

            <div>
              <label class="mb-2 block text-xs font-medium text-slate-300"
                >Type of site</label
              >
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="type in siteTypes"
                  :key="type"
                  type="button"
                  class="rounded-xl border px-4 py-3 text-left text-sm font-semibold transition"
                  :class="
                    form.siteType === type
                      ? 'border-accent-300/70 bg-accent-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  "
                  @click="form.siteType = type"
                >
                  {{ type }}
                </button>
              </div>
              <p v-if="fieldErrors.siteType" class="mt-1 text-xs text-white">
                {{ fieldErrors.siteType }}
              </p>
            </div>

            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-300">
                Existing website <span class="text-slate-600">(optional)</span>
              </label>
              <input
                v-model="form.existingWebsite"
                type="url"
                placeholder="https://example.com"
                :class="inputClass"
              />
            </div>
          </template>

          <template v-else-if="currentStep === 2">
            <div>
              <label class="mb-2 block text-xs font-medium text-slate-300"
                >Budget range</label
              >
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="budget in budgets"
                  :key="budget"
                  type="button"
                  class="rounded-xl border px-4 py-3 text-left text-sm font-semibold transition"
                  :class="
                    form.budget === budget
                      ? 'border-brand-300/70 bg-brand-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  "
                  @click="form.budget = budget"
                >
                  {{ budget }}
                </button>
              </div>
              <p v-if="fieldErrors.budget" class="mt-1 text-xs text-white">
                {{ fieldErrors.budget }}
              </p>
            </div>

            <div>
              <label class="mb-2 block text-xs font-medium text-slate-300"
                >Deadline</label
              >
              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="deadline in deadlines"
                  :key="deadline"
                  type="button"
                  class="rounded-xl border px-4 py-3 text-left text-sm font-semibold transition"
                  :class="
                    form.deadline === deadline
                      ? 'border-accent-300/70 bg-accent-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  "
                  @click="form.deadline = deadline"
                >
                  {{ deadline }}
                </button>
              </div>
              <p v-if="fieldErrors.deadline" class="mt-1 text-xs text-white">
                {{ fieldErrors.deadline }}
              </p>
            </div>
          </template>

          <template v-else>
            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-300"
                >Main goal</label
              >
              <textarea
                v-model="form.goals"
                rows="3"
                placeholder="What should this site help you do?"
                :class="inputClass"
              />
              <p v-if="fieldErrors.goals" class="mt-1 text-xs text-white">
                {{ fieldErrors.goals }}
              </p>
            </div>

            <div>
              <label class="mb-1.5 block text-xs font-medium text-slate-300"
                >Expected pages or sections</label
              >
              <textarea
                v-model="form.pages"
                rows="3"
                placeholder="Home, about, services, contact, dashboard, product pages..."
                :class="inputClass"
              />
              <p v-if="fieldErrors.pages" class="mt-1 text-xs text-white">
                {{ fieldErrors.pages }}
              </p>
            </div>

            <div>
              <label class="mb-2 block text-xs font-medium text-slate-300"
                >Needed features</label
              >
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="feature in featureOptions"
                  :key="feature"
                  type="button"
                  class="rounded-full border px-3 py-2 text-xs font-semibold transition"
                  :class="
                    form.features.includes(feature)
                      ? 'border-brand-300/70 bg-brand-400/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
                  "
                  @click="toggleFeature(feature)"
                >
                  {{ feature }}
                </button>
              </div>
              <p v-if="fieldErrors.features" class="mt-1 text-xs text-white">
                {{ fieldErrors.features }}
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300">
                  Reference links <span class="text-slate-600">(optional)</span>
                </label>
                <textarea
                  v-model="form.references"
                  rows="3"
                  placeholder="Sites you like, competitors, inspiration..."
                  :class="inputClass"
                />
              </div>
              <div>
                <label class="mb-1.5 block text-xs font-medium text-slate-300">
                  Extra details <span class="text-slate-600">(optional)</span>
                </label>
                <textarea
                  v-model="form.extraDetails"
                  rows="3"
                  placeholder="Anything else we should know?"
                  :class="inputClass"
                />
                <p
                  v-if="fieldErrors.extraDetails"
                  class="mt-1 text-xs text-white"
                >
                  {{ fieldErrors.extraDetails }}
                </p>
              </div>
            </div>
          </template>
        </div>
      </Transition>

      <p
        v-if="status === 'error' && serverMessage"
        class="rounded-lg bg-white/10 px-4 py-2.5 text-sm text-white ring-1 ring-white/20"
      >
        {{ serverMessage }}
      </p>

      <div class="flex flex-col gap-3 sm:flex-row">
        <button
          v-if="currentStep > 0"
          type="button"
          class="glass inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
          @click="goBack"
        >
          Back
        </button>
        <button
          v-if="currentStep < steps.length - 1"
          v-magnetic="0.3"
          type="button"
          class="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white"
          @click="goNext"
        >
          Continue
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
        </button>
        <button
          v-else
          v-magnetic="0.3"
          type="submit"
          :disabled="status === 'loading'"
          class="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          <svg
            v-if="status === 'loading'"
            class="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          {{ status === "loading" ? "Sending..." : "Send quote request" }}
        </button>
      </div>

      <p class="text-center text-xs text-slate-500">
        Each section must be completed before moving on. We reply within one
        business day.
      </p>
    </form>
  </div>
</template>

<style scoped>
.quote-step-enter-active,
.quote-step-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.quote-step-enter-from {
  opacity: 0;
  transform: translateX(14px);
}

.quote-step-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
</style>
