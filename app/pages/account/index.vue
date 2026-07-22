<script setup lang="ts">
import {
  TOPUP_PRESETS_USD_CENTS,
  MIN_TOPUP_USD_CENTS,
  formatUsdCents,
} from "~~/shared/billing";
import type {
  ChangeRequest,
  CustomerProject,
  Invoice,
  Site,
  Txn,
  UpcomingCost,
  WalletData,
} from "~/types/account";

/**
 * Customer portal (WebForgePlan2 §4.5): wallet balance + runway, add funds,
 * transaction ledger, recurring services, sites, one-off invoices, and a
 * change-request form. Any signed-in customer (not gated by ADMIN_EMAILS).
 */
const { user, ready, configured, signInWithGoogle, signOut, authFetch } =
  useAuth();
const {
  startCheckout,
  loading: topupLoading,
  error: topupError,
} = useCheckout();
const { balanceCents, refresh: refreshWalletBalance } = useWalletBalance();

const wallet = ref<WalletData | null>(null);
const txns = ref<Txn[]>([]);
const invoices = ref<Invoice[]>([]);
const sites = ref<Site[]>([]);
const projects = ref<CustomerProject[]>([]);
const requests = ref<ChangeRequest[]>([]);
const upcomingCosts = ref<UpcomingCost[]>([]);
const activeProjectId = ref("");
const projectNotes = ref("");
const projectBusy = ref(false);
const fileName = ref("");
const fileUrl = ref("");
const pending = ref(true);
const loadError = ref<string | null>(null);

const presets = TOPUP_PRESETS_USD_CENTS;
const customAmount = ref<number | null>(null);
const minTopupUsd = MIN_TOPUP_USD_CENTS / 100;

const crTitle = ref("");
const crDetails = ref("");
const crSiteId = ref("");
const crBusy = ref(false);
const crMessage = ref<string | null>(null);

// Self-serve cancellation of a recurring service (confirm-to-cancel).
const cancelBusyId = ref<string | null>(null);
const cancelConfirmId = ref<string | null>(null);
const serviceMessage = ref<string | null>(null);

async function cancelService(id: string) {
  if (cancelConfirmId.value !== id) {
    cancelConfirmId.value = id;
    return;
  }
  cancelConfirmId.value = null;
  cancelBusyId.value = id;
  serviceMessage.value = null;
  try {
    await authFetch("/api/account/recurring", {
      method: "PATCH",
      body: { id },
    });
    serviceMessage.value =
      "Service canceled — you won't be charged for it again.";
    await load();
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    serviceMessage.value =
      err?.data?.statusMessage || err?.statusMessage || "Could not cancel.";
  } finally {
    cancelBusyId.value = null;
  }
}

const runwayLabel = computed(() => {
  const w = wallet.value;
  if (w == null || w.runwayMonths == null) return "No recurring services yet";
  if (w.balanceCents <= 0)
    return "Out of funds — top up to keep services running";
  if (w.runwayMonths < 1) return "Less than a month left — top up soon";
  const m = Math.floor(w.runwayMonths);
  return `~${m} month${m === 1 ? "" : "s"} of runway`;
});
const activeProject = computed(
  () =>
    projects.value.find((project) => project.id === activeProjectId.value) ??
    projects.value[0] ??
    null,
);
const openActions = computed(
  () =>
    activeProject.value?.actions.filter((action) => action.status === "open") ??
    [],
);
const runwayPercent = computed(() => {
  const months = wallet.value?.runwayMonths;
  if (months == null) return 100;
  return Math.max(3, Math.min(100, (months / 6) * 100));
});

async function load() {
  if (!user.value) return;
  pending.value = true;
  loadError.value = null;
  try {
    const [w, t, b, p] = await Promise.all([
      authFetch<WalletData>("/api/account/wallet"),
      authFetch<{ transactions: Txn[] }>("/api/account/transactions"),
      authFetch<{ invoices: Invoice[]; sites: Site[] }>("/api/account/billing"),
      authFetch<{
        projects: CustomerProject[];
        requests: ChangeRequest[];
        upcomingCosts: UpcomingCost[];
      }>("/api/account/projects"),
    ]);
    wallet.value = w;
    balanceCents.value = w.balanceCents;
    txns.value = t.transactions;
    invoices.value = b.invoices;
    sites.value = b.sites;
    projects.value = p.projects;
    requests.value = p.requests;
    upcomingCosts.value = p.upcomingCosts;
    activeProjectId.value ||= p.projects[0]?.id ?? "";
    projectNotes.value = p.projects[0]?.customerNotes ?? "";
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    loadError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Failed to load your account.";
  } finally {
    pending.value = false;
  }
}

watch(activeProject, (project) => {
  projectNotes.value = project?.customerNotes ?? "";
});

async function saveProjectNotes() {
  if (!activeProject.value) return;
  projectBusy.value = true;
  try {
    await authFetch("/api/account/projects", {
      method: "PATCH",
      body: {
        projectId: activeProject.value.id,
        customerNotes: projectNotes.value,
      },
    });
    activeProject.value.customerNotes = projectNotes.value;
  } finally {
    projectBusy.value = false;
  }
}

async function completeAction(actionId: string) {
  if (!activeProject.value) return;
  projectBusy.value = true;
  try {
    await authFetch("/api/account/projects", {
      method: "PATCH",
      body: { projectId: activeProject.value.id, actionId },
    });
    await load();
  } finally {
    projectBusy.value = false;
  }
}

async function addProjectFile() {
  if (
    !activeProject.value ||
    fileName.value.trim().length < 2 ||
    !fileUrl.value
  )
    return;
  projectBusy.value = true;
  try {
    await authFetch("/api/account/project-files", {
      method: "POST",
      body: {
        projectId: activeProject.value.id,
        name: fileName.value,
        url: fileUrl.value,
      },
    });
    fileName.value = "";
    fileUrl.value = "";
    await load();
  } finally {
    projectBusy.value = false;
  }
}

const briefValue = (key: string) => {
  const value = activeProject.value?.brief?.[key];
  return Array.isArray(value) ? value.join(", ") : String(value ?? "—");
};

function topup(cents: number) {
  void refreshWalletBalance();
  void startCheckout({ purpose: "topup", amountUsdCents: cents });
}
function topupCustom() {
  const cents = Math.round((customAmount.value ?? 0) * 100);
  if (cents < MIN_TOPUP_USD_CENTS) return;
  void refreshWalletBalance();
  void startCheckout({ purpose: "topup", amountUsdCents: cents });
}

const resumeBusy = ref(false);
const resumeError = ref<string | null>(null);

/** Complete payment for an awaiting-payment build by resuming the existing
 * invoice (no duplicate order is created), then redirect to Paystack. */
async function resumePayment(projectId: string) {
  resumeBusy.value = true;
  resumeError.value = null;
  try {
    const res = await authFetch<{ authorizationUrl?: string }>(
      "/api/account/resume-payment",
      { method: "POST", body: { projectId } },
    );
    if (res?.authorizationUrl) {
      window.location.href = res.authorizationUrl;
    } else {
      throw new Error("No checkout URL returned.");
    }
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    resumeError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Could not start payment. Please try again.";
    resumeBusy.value = false;
  }
}

async function submitChangeRequest() {
  // Client-side validation with clear feedback.
  if (!sites.value.length) {
    crMessage.value = "You need a live site with us before requesting changes.";
    return;
  }
  if (!crSiteId.value) {
    crMessage.value = "Please choose which site this change is for.";
    return;
  }
  if (crTitle.value.trim().length < 3) {
    crMessage.value = "Give the request a short title (at least 3 characters).";
    return;
  }
  if (crDetails.value.trim().length < 10) {
    crMessage.value = "Please describe the change in a sentence or two.";
    return;
  }
  crBusy.value = true;
  crMessage.value = null;
  try {
    await authFetch("/api/account/change-request", {
      method: "POST",
      body: {
        title: crTitle.value.trim(),
        details: crDetails.value.trim(),
        siteId: crSiteId.value || undefined,
      },
    });
    crTitle.value = "";
    crDetails.value = "";
    crSiteId.value = "";
    crMessage.value =
      "Thanks! We've received your request and will be in touch with a quote.";
    await load();
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    crMessage.value =
      err?.data?.statusMessage || err?.statusMessage || "Could not submit.";
  } finally {
    crBusy.value = false;
  }
}

const approveBusy = ref<string | null>(null);
const approveError = ref<string | null>(null);

/** Approve a quoted change request and pay it from the wallet balance. */
async function approveRequest(id: string) {
  approveBusy.value = id;
  approveError.value = null;
  try {
    await authFetch("/api/account/change-request", {
      method: "PATCH",
      body: { id },
    });
    await Promise.all([load(), refreshWalletBalance()]);
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    approveError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Could not approve. Please try again.";
  } finally {
    approveBusy.value = null;
  }
}

/** Cancel an open/quoted change request the customer raised by mistake. */
async function cancelRequest(id: string) {
  approveBusy.value = id;
  approveError.value = null;
  try {
    await authFetch("/api/account/change-request", {
      method: "PATCH",
      body: { id, action: "cancel" },
    });
    await load();
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    approveError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Could not cancel the request.";
  } finally {
    approveBusy.value = null;
  }
}

const txnSign = (c: number) => (c >= 0 ? "+" : "−");
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
const statusClass = (s: string) =>
  ({
    paid: "bg-white/15 text-white",
    open: "bg-brand-500/15 text-brand-300",
    failed: "bg-white/5 text-slate-300 ring-1 ring-white/30",
    refunded: "bg-slate-500/15 text-slate-400",
    live: "bg-white/15 text-white",
    suspended: "bg-slate-500/20 text-slate-300",
    draft: "bg-slate-500/15 text-slate-400",
    offboarded: "bg-slate-500/15 text-slate-400",
  })[s] || "bg-slate-500/15 text-slate-400";

if (import.meta.client) {
  watch(
    [ready, () => user.value?.uid],
    () => {
      if (ready.value && user.value) load();
    },
    { immediate: true },
  );
}

useSeoMeta({ title: "My account — TheWebsiteForge", robots: "noindex" });
</script>

<template>
  <div class="px-4 pt-36 pb-24 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-5xl">
      <!-- ClientOnly: everything below branches on Firebase auth state, which
           only exists in the browser — SSR'ing it causes hydration
           mismatches. -->
      <ClientOnly>
        <template #fallback>
          <div class="glass rounded-2xl p-10 text-center text-slate-400">
            Loading…
          </div>
        </template>
        <!-- loading auth -->
        <div
          v-if="!ready"
          class="glass rounded-2xl p-10 text-center text-slate-400"
        >
          Loading…
        </div>

        <!-- not configured -->
        <div v-else-if="!configured" class="glass rounded-2xl p-10 text-center">
          <h1 class="font-display text-2xl font-bold text-white">
            Sign-in unavailable
          </h1>
          <p class="mt-3 text-slate-400">
            Authentication isn't configured yet.
          </p>
        </div>

        <!-- signed out -->
        <div v-else-if="!user" v-motion="reveal(0)" class="mx-auto max-w-md">
          <div class="glass-strong rounded-2xl p-8 text-center">
            <h1 class="font-display text-3xl font-bold text-white">
              Your account
            </h1>
            <p class="mt-3 text-slate-400">
              Sign in to manage your wallet, top up credit, view invoices, and
              request changes.
            </p>
            <button
              type="button"
              class="btn-gradient mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white"
              @click="signInWithGoogle"
            >
              Continue with Google
            </button>
          </div>
        </div>

        <!-- signed in -->
        <div v-else>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 class="font-display text-3xl font-bold text-white">
                My account
              </h1>
              <p class="mt-1 text-sm text-slate-400">{{ user.email }}</p>
            </div>
            <button
              type="button"
              class="glass rounded-lg px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              @click="signOut"
            >
              Sign out
            </button>
          </div>

          <p v-if="loadError" class="mt-8 text-sm text-white">
            {{ loadError }}
          </p>
          <p v-else-if="pending" class="mt-8 text-sm text-slate-500">
            Loading your account…
          </p>

          <div v-else class="mt-8 space-y-6">
            <section
              v-if="activeProject"
              class="account-project-hero overflow-hidden rounded-[2rem] border border-white/10 p-6 sm:p-8"
            >
              <div class="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <p
                    class="font-mono text-[0.55rem] uppercase tracking-[0.24em] text-white/35"
                  >
                    Active project / {{ activeProject.planKey }}
                  </p>
                  <h2
                    class="mt-3 font-display text-4xl font-medium tracking-[-0.06em] text-white"
                  >
                    {{ activeProject.name }}
                  </h2>
                  <p
                    class="mt-3 max-w-xl text-sm leading-relaxed text-white/45"
                  >
                    {{
                      activeProject.latestUpdate ||
                      "Your project has been added to the studio queue."
                    }}
                  </p>
                  <div
                    v-if="activeProject.status === 'awaiting_payment'"
                    class="mt-5"
                  >
                    <button
                      type="button"
                      :disabled="resumeBusy"
                      class="btn-gradient inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      @click="resumePayment(activeProject.id)"
                    >
                      {{ resumeBusy ? "Starting…" : "Complete payment" }}
                    </button>
                    <p v-if="resumeError" class="mt-2 text-xs text-white">
                      {{ resumeError }}
                    </p>
                  </div>
                </div>
                <select
                  v-if="projects.length > 1"
                  v-model="activeProjectId"
                  class="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white"
                >
                  <option
                    v-for="project in projects"
                    :key="project.id"
                    :value="project.id"
                  >
                    {{ project.name }}
                  </option>
                </select>
              </div>

              <div class="mt-10 grid gap-7 lg:grid-cols-[1fr_0.45fr]">
                <div>
                  <div class="flex items-end justify-between">
                    <div>
                      <span class="text-xs text-white/35">Current stage</span>
                      <p
                        class="mt-1 text-xl font-semibold capitalize text-white"
                      >
                        {{ activeProject.status.replaceAll("_", " ") }}
                      </p>
                    </div>
                    <strong
                      class="font-display text-5xl font-medium tracking-[-0.08em] text-white"
                      >{{ activeProject.progress }}%</strong
                    >
                  </div>
                  <div class="mt-5 h-1 overflow-hidden bg-white/10">
                    <div
                      class="h-full bg-[#ece9e2] transition-all duration-700"
                      :style="{ width: `${activeProject.progress}%` }"
                    />
                  </div>
                  <div
                    class="mt-5 flex flex-wrap justify-between gap-3 font-mono text-[0.48rem] uppercase tracking-[0.16em] text-white/25"
                  >
                    <span>Brief</span><span>Design</span><span>Build</span
                    ><span>Review</span><span>Launch</span>
                  </div>
                </div>
                <div class="border-l border-white/10 pl-0 lg:pl-7">
                  <span
                    class="font-mono text-[0.52rem] uppercase tracking-[0.2em] text-white/30"
                    >Estimated launch</span
                  >
                  <p class="mt-3 text-lg font-medium text-white">
                    {{
                      activeProject.estimatedLaunchAt
                        ? fmtDate(activeProject.estimatedLaunchAt)
                        : "Set after studio review"
                    }}
                  </p>
                  <p class="mt-4 text-xs leading-relaxed text-white/35">
                    Progress and launch timing are updated by the studio as work
                    moves forward.
                  </p>
                </div>
              </div>
            </section>

            <section
              v-if="openActions.length"
              class="rounded-[1.75rem] border border-white/10 bg-[#ece9e2] p-6 text-[#151412] sm:p-8"
            >
              <div class="flex items-end justify-between gap-5">
                <div>
                  <p
                    class="font-mono text-[0.52rem] uppercase tracking-[0.22em] text-black/35"
                  >
                    Action centre
                  </p>
                  <h2
                    class="mt-2 font-display text-3xl font-medium tracking-[-0.055em]"
                  >
                    Needed from you
                  </h2>
                </div>
                <span class="text-xs text-black/35"
                  >{{ openActions.length }} open</span
                >
              </div>
              <div class="mt-6 grid gap-3 sm:grid-cols-2">
                <article
                  v-for="action in openActions"
                  :key="action.id"
                  class="rounded-2xl border border-black/10 p-5"
                >
                  <h3 class="font-semibold">{{ action.title }}</h3>
                  <p class="mt-2 text-xs leading-relaxed text-black/45">
                    {{
                      action.details ||
                      "Complete this item to keep work moving."
                    }}
                  </p>
                  <button
                    type="button"
                    :disabled="projectBusy"
                    class="mt-5 rounded-full bg-[#151412] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    @click="completeAction(action.id)"
                  >
                    Mark complete
                  </button>
                </article>
              </div>
            </section>

            <div v-if="activeProject" class="grid gap-6 lg:grid-cols-2">
              <section class="glass rounded-[1.75rem] p-6">
                <div class="flex items-center justify-between">
                  <h2 class="text-sm font-semibold text-white">
                    Submitted project brief
                  </h2>
                  <span class="text-[0.65rem] text-white/25">Read only</span>
                </div>
                <dl class="mt-5 grid gap-4 sm:grid-cols-2">
                  <div
                    v-for="item in [
                      ['Business', 'businessType'],
                      ['Site type', 'siteType'],
                      ['Page count', 'pageCount'],
                      ['Deadline', 'deadline'],
                      ['Main goal', 'goals'],
                      ['Pages / sections', 'pages'],
                      ['Features', 'features'],
                      ['References', 'references'],
                    ]"
                    :key="item[1]"
                    class="border-t border-white/10 pt-3"
                  >
                    <dt class="text-[0.65rem] text-white/30">{{ item[0] }}</dt>
                    <dd class="mt-1 text-xs leading-relaxed text-white/65">
                      {{ briefValue(item[1]!) }}
                    </dd>
                  </div>
                </dl>
                <label class="mt-6 block">
                  <span class="text-xs font-medium text-white/45"
                    >Corrections or additional notes</span
                  >
                  <textarea
                    v-model="projectNotes"
                    rows="3"
                    class="mt-2 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-white outline-none focus:border-white/30"
                    placeholder="Add anything that changed after checkout..."
                  />
                </label>
                <button
                  type="button"
                  :disabled="projectBusy"
                  class="btn-line mt-3 px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  @click="saveProjectNotes"
                >
                  Save notes
                </button>
              </section>

              <section class="glass rounded-[1.75rem] p-6">
                <h2 class="text-sm font-semibold text-white">
                  Files and deliverables
                </h2>
                <p
                  v-if="!activeProject.files.length"
                  class="mt-3 text-sm text-white/30"
                >
                  No project files have been added yet. Your studio deliverables
                  will appear here.
                </p>
                <a
                  v-for="file in activeProject.files"
                  :key="file.id"
                  :href="file.url"
                  target="_blank"
                  rel="noopener"
                  class="mt-3 flex items-center justify-between rounded-xl border border-white/10 p-4 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
                >
                  <span>{{ file.name }}</span>
                  <span class="text-xs capitalize text-white/25">{{
                    file.kind.replaceAll("_", " ")
                  }}</span>
                </a>
                <div class="mt-5 border-t border-white/10 pt-5">
                  <p class="text-xs font-medium text-white/45">
                    Share a file link
                  </p>
                  <div class="mt-3 grid gap-2 sm:grid-cols-[0.7fr_1fr_auto]">
                    <input
                      v-model="fileName"
                      placeholder="Logo files"
                      class="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-white/30"
                    />
                    <input
                      v-model="fileUrl"
                      type="url"
                      placeholder="https://drive.google.com/..."
                      class="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      :disabled="projectBusy"
                      class="btn-line px-4 py-2 text-xs font-semibold disabled:opacity-50"
                      @click="addProjectFile"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <h3 class="mt-8 text-xs font-semibold text-white/50">
                  Recent project activity
                </h3>
                <div class="mt-3 space-y-3">
                  <div
                    v-for="item in activeProject.activity.slice(0, 4)"
                    :key="item.id"
                    class="border-l border-white/15 pl-4"
                  >
                    <p class="text-xs font-medium text-white/70">
                      {{ item.title }}
                    </p>
                    <p class="mt-1 text-[0.65rem] text-white/25">
                      {{ fmtDate(item.createdAt) }}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div class="grid gap-6 lg:grid-cols-3">
              <!-- wallet + add funds -->
              <div class="lg:col-span-2 space-y-6">
                <div class="glass-strong gradient-border rounded-2xl p-6">
                  <p class="text-sm text-slate-400">Wallet balance</p>
                  <p class="mt-1 font-display text-4xl font-bold text-white">
                    {{ formatUsdCents(wallet?.balanceCents ?? 0) }}
                  </p>
                  <p class="mt-1 text-sm text-slate-400">
                    {{ runwayLabel }}
                    <span
                      v-if="wallet && wallet.monthlyBurnCents > 0"
                      class="text-slate-500"
                    >
                      · {{ formatUsdCents(wallet.monthlyBurnCents) }}/mo
                    </span>
                  </p>
                  <div
                    class="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      class="h-full rounded-full bg-[#ece9e2] transition-all duration-700"
                      :style="{ width: `${runwayPercent}%` }"
                    />
                  </div>

                  <div class="mt-6">
                    <p class="mb-2 text-sm font-medium text-slate-300">
                      Add funds
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="p in presets"
                        :key="p"
                        type="button"
                        :disabled="topupLoading"
                        class="glass rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
                        @click="topup(p)"
                      >
                        {{ formatUsdCents(p) }}
                      </button>
                    </div>
                    <div class="mt-3 flex items-center gap-2">
                      <div class="relative flex-1">
                        <span
                          class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                          >$</span
                        >
                        <input
                          v-model.number="customAmount"
                          type="number"
                          :min="minTopupUsd"
                          :placeholder="`Custom (min $${minTopupUsd})`"
                          class="w-full rounded-lg border border-white/10 bg-black/30 py-2.5 pl-7 pr-3 text-white outline-none transition focus:border-brand-400/60"
                        />
                      </div>
                      <button
                        type="button"
                        :disabled="
                          topupLoading || (customAmount ?? 0) < minTopupUsd
                        "
                        class="btn-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        @click="topupCustom"
                      >
                        Add
                      </button>
                    </div>
                    <p class="mt-2 text-xs leading-relaxed text-slate-500">
                      Recurring services draw from this balance. If it cannot
                      cover a charge, we warn you and keep services active for a
                      7-day grace period.
                    </p>
                    <p v-if="topupError" class="mt-2 text-sm text-white">
                      {{ topupError }}
                    </p>
                  </div>
                </div>

                <!-- transactions -->
                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">
                    Transaction history
                  </h2>
                  <p v-if="!txns.length" class="mt-3 text-sm text-slate-500">
                    No transactions yet. Add funds to get started.
                  </p>
                  <table v-else class="mt-4 w-full text-left text-sm">
                    <thead>
                      <tr class="border-b border-white/10 text-slate-400">
                        <th class="py-2 font-medium">Date</th>
                        <th class="py-2 font-medium">Description</th>
                        <th class="py-2 text-right font-medium">Amount</th>
                        <th class="py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="t in txns"
                        :key="t.id"
                        class="border-b border-white/5 last:border-0"
                      >
                        <td class="py-2.5 text-slate-400">
                          {{ fmtDate(t.createdAt) }}
                        </td>
                        <td class="py-2.5 text-slate-200">
                          {{ t.description }}
                        </td>
                        <td
                          class="py-2.5 text-right font-medium"
                          :class="
                            t.amountCents >= 0 ? 'text-white' : 'text-slate-200'
                          "
                        >
                          {{ txnSign(t.amountCents)
                          }}{{ formatUsdCents(Math.abs(t.amountCents)) }}
                        </td>
                        <td class="py-2.5 text-right text-slate-400">
                          {{ formatUsdCents(t.balanceAfterCents) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <!-- invoices (one-off builds) -->
                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">Invoices</h2>
                  <p
                    v-if="!invoices.length"
                    class="mt-3 text-sm text-slate-500"
                  >
                    No invoices yet.
                  </p>
                  <table v-else class="mt-4 w-full text-left text-sm">
                    <thead>
                      <tr class="border-b border-white/10 text-slate-400">
                        <th class="py-2 font-medium">#</th>
                        <th class="py-2 font-medium">Type</th>
                        <th class="py-2 text-right font-medium">Amount</th>
                        <th class="py-2 text-right font-medium">Status</th>
                        <th class="py-2 text-right font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="i in invoices"
                        :key="i.id"
                        class="border-b border-white/5 last:border-0"
                      >
                        <td class="py-2.5 text-slate-400">{{ i.number }}</td>
                        <td class="py-2.5 capitalize text-slate-200">
                          {{ i.type }}
                        </td>
                        <td class="py-2.5 text-right text-slate-200">
                          {{ formatUsdCents(i.amountCents) }}
                        </td>
                        <td class="py-2.5 text-right">
                          <span
                            class="rounded-full px-2 py-0.5 text-xs font-semibold"
                            :class="statusClass(i.status)"
                          >
                            {{ i.status }}
                          </span>
                        </td>
                        <td class="py-2.5 text-right whitespace-nowrap">
                          <NuxtLink
                            :to="`/account/invoices/${i.id}`"
                            class="text-xs text-brand-300 hover:underline"
                          >
                            View
                          </NuxtLink>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- right column: services, sites, change request -->
              <div class="space-y-6">
                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">
                    Recurring services
                  </h2>
                  <p v-if="serviceMessage" class="mt-2 text-xs text-brand-300">
                    {{ serviceMessage }}
                  </p>
                  <p
                    v-if="!wallet?.recurring.length"
                    class="mt-3 text-sm text-slate-500"
                  >
                    None yet. We'll set these up when your site goes live.
                  </p>
                  <ul v-else class="mt-4 space-y-3">
                    <li
                      v-for="r in wallet.recurring"
                      :key="r.id"
                      class="text-sm"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <p class="font-medium text-white">{{ r.label }}</p>
                          <p class="text-xs text-slate-500">
                            Next: {{ fmtDate(r.nextChargeAt) }}
                          </p>
                        </div>
                        <span
                          class="whitespace-nowrap font-semibold text-brand-300"
                        >
                          {{ formatUsdCents(r.amountCents)
                          }}{{ r.interval === "year" ? "/yr" : "/mo" }}
                        </span>
                      </div>
                      <div class="mt-1">
                        <button
                          v-if="cancelConfirmId !== r.id"
                          type="button"
                          :disabled="cancelBusyId === r.id"
                          class="text-xs text-slate-500 hover:text-rose-300 disabled:opacity-50"
                          @click="cancelService(r.id)"
                        >
                          {{
                            cancelBusyId === r.id
                              ? "Canceling…"
                              : "Cancel service"
                          }}
                        </button>
                        <span v-else class="text-xs text-slate-400">
                          Cancel {{ r.label }}?
                          <button
                            type="button"
                            class="ml-1 font-semibold text-rose-300 hover:underline"
                            @click="cancelService(r.id)"
                          >
                            Yes, cancel
                          </button>
                          <button
                            type="button"
                            class="ml-2 text-slate-500 hover:text-white"
                            @click="cancelConfirmId = null"
                          >
                            Keep it
                          </button>
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">Your sites</h2>
                  <p v-if="!sites.length" class="mt-3 text-sm text-slate-500">
                    No sites yet.
                  </p>
                  <ul v-else class="mt-4 space-y-2">
                    <li
                      v-for="s in sites"
                      :key="s.id"
                      class="flex items-center justify-between gap-3 text-sm"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-slate-200">{{ s.name }}</p>
                        <a
                          v-if="s.deployUrl"
                          :href="s.deployUrl"
                          target="_blank"
                          rel="noopener"
                          class="text-xs text-brand-300 hover:underline"
                        >
                          Visit site ↗
                        </a>
                      </div>
                      <span
                        class="rounded-full px-2 py-0.5 text-xs font-semibold"
                        :class="statusClass(s.status)"
                      >
                        {{ s.status }}
                      </span>
                    </li>
                  </ul>
                </div>

                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">
                    Upcoming costs
                  </h2>
                  <p
                    v-if="!upcomingCosts.length"
                    class="mt-3 text-sm text-slate-500"
                  >
                    No scheduled wallet deductions.
                  </p>
                  <ul v-else class="mt-4 space-y-3">
                    <li
                      v-for="cost in upcomingCosts.slice(0, 5)"
                      :key="`${cost.kind}-${cost.id}`"
                      class="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <p class="text-xs font-medium text-white/70">
                          {{ cost.label }}
                        </p>
                        <p class="mt-1 text-[0.65rem] text-white/25">
                          {{ fmtDate(cost.dueAt) }}
                        </p>
                      </div>
                      <span class="text-xs font-semibold text-white">{{
                        formatUsdCents(cost.amountCents)
                      }}</span>
                    </li>
                  </ul>
                </div>

                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">
                    Change requests
                  </h2>
                  <p
                    v-if="!requests.length"
                    class="mt-3 text-sm text-slate-500"
                  >
                    No requests submitted yet.
                  </p>
                  <ul v-else class="mt-4 space-y-3">
                    <li
                      v-for="request in requests.slice(0, 5)"
                      :key="request.id"
                      class="rounded-xl border border-white/10 p-3"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <p class="text-xs font-medium text-white/75">
                          {{ request.title }}
                        </p>
                        <span
                          class="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] capitalize text-white/40"
                          >{{ request.status }}</span
                        >
                      </div>
                      <p
                        v-if="request.quotedCents"
                        class="mt-2 text-[0.65rem] text-white/35"
                      >
                        Quote: {{ formatUsdCents(request.quotedCents) }}
                      </p>
                      <div
                        v-if="
                          request.status === 'quoted' ||
                          request.status === 'open'
                        "
                        class="mt-3 flex flex-wrap items-center gap-2"
                      >
                        <button
                          v-if="
                            request.status === 'quoted' && request.quotedCents
                          "
                          type="button"
                          :disabled="approveBusy === request.id"
                          class="btn-gradient inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          @click="approveRequest(request.id)"
                        >
                          {{
                            approveBusy === request.id
                              ? "Processing…"
                              : `Approve & pay ${formatUsdCents(request.quotedCents)} from wallet`
                          }}
                        </button>
                        <button
                          type="button"
                          :disabled="approveBusy === request.id"
                          class="inline-flex items-center justify-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-50"
                          @click="cancelRequest(request.id)"
                        >
                          Cancel
                        </button>
                      </div>
                    </li>
                  </ul>
                  <p v-if="approveError" class="mt-3 text-xs text-white">
                    {{ approveError }}
                  </p>
                </div>

                <div class="glass rounded-2xl p-6">
                  <h2 class="text-sm font-semibold text-white">
                    Request a change
                  </h2>
                  <p class="mt-1 text-xs text-slate-500">
                    Need an update or new feature? Tell us and we'll quote it
                    from your wallet.
                  </p>
                  <p
                    v-if="!sites.length"
                    class="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400"
                  >
                    Change requests are for sites we build or host for you. Once
                    your first site is live, you'll be able to request changes
                    here.
                  </p>
                  <div v-else class="mt-4 space-y-3">
                    <select
                      v-model="crSiteId"
                      class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-brand-400/60"
                    >
                      <option value="">Which site?</option>
                      <option v-for="s in sites" :key="s.id" :value="s.id">
                        {{ s.name }}
                      </option>
                    </select>
                    <input
                      v-model="crTitle"
                      type="text"
                      placeholder="Short title"
                      class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-brand-400/60"
                    />
                    <textarea
                      v-model="crDetails"
                      rows="3"
                      placeholder="Describe what you'd like…"
                      class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-brand-400/60"
                    />
                    <button
                      type="button"
                      :disabled="crBusy || !crSiteId"
                      class="btn-gradient inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      @click="submitChangeRequest"
                    >
                      {{ crBusy ? "Sending…" : "Submit request" }}
                    </button>
                    <p v-if="crMessage" class="text-xs text-brand-300">
                      {{ crMessage }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.account-project-hero {
  position: relative;
  background:
    radial-gradient(
      circle at 88% 12%,
      rgba(255, 255, 255, 0.07),
      transparent 20rem
    ),
    linear-gradient(145deg, rgba(31, 30, 28, 0.96), rgba(17, 16, 15, 0.98));
  box-shadow: 0 2rem 6rem rgba(0, 0, 0, 0.25);
}

.account-project-hero::after {
  position: absolute;
  top: -11rem;
  right: -10rem;
  width: 24rem;
  height: 24rem;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  box-shadow:
    0 0 0 4rem rgba(255, 255, 255, 0.008),
    0 0 0 8rem rgba(255, 255, 255, 0.005);
  content: "";
  pointer-events: none;
}
</style>
