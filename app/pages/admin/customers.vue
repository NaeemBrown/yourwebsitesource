<script setup lang="ts">
import { recurringServices, formatUsdCents } from "~~/shared/billing";
import type { Customer, Recurring, Txn } from "~/models/admin";

definePageMeta({ layout: "admin" });
useSeoMeta({ title: "Customers — Admin", robots: "noindex" });

const { adminFetch } = useAuth();
const customers = ref<Customer[]>([]);
const pending = ref(true);
const error = ref<string | null>(null);

const serviceOptions = Object.values(recurringServices);
const totalMrr = computed(() =>
  customers.value.reduce((sum, customer) => sum + customer.mrrCents, 0),
);
const totalWallet = computed(() =>
  customers.value.reduce(
    (sum, customer) => sum + customer.walletBalanceCents,
    0,
  ),
);
const totalSites = computed(() =>
  customers.value.reduce((sum, customer) => sum + customer.siteCount, 0),
);

// --- manage panel state ---
const selected = ref<Customer | null>(null);
const detail = ref<{ recurring: Recurring[]; transactions: Txn[] } | null>(
  null,
);
const detailPending = ref(false);
const panelError = ref<string | null>(null);
const panelMsg = ref<string | null>(null);

// wallet adjust form
const adjDirection = ref<"credit" | "debit">("credit");
const adjCreateInvoice = ref(false);
const adjAmount = ref<number | null>(null);
const adjType = ref("topup");
const adjDescription = ref("");
const adjBusy = ref(false);

// recurring form
const recPlanKey = ref("");
const recBusy = ref(false);

async function loadCustomers() {
  pending.value = true;
  try {
    const res = await adminFetch<{ customers: Customer[] }>(
      "/api/admin/customers",
    );
    customers.value = res.customers;
  } catch (e) {
    error.value = errMsg(e, "Failed to load customers.");
  } finally {
    pending.value = false;
  }
}

function errMsg(e: unknown, fallback: string) {
  const err = e as {
    data?: { statusMessage?: string };
    statusMessage?: string;
  };
  return err?.data?.statusMessage || err?.statusMessage || fallback;
}

async function openManage(c: Customer) {
  selected.value = c;
  detail.value = null;
  panelError.value = null;
  panelMsg.value = null;
  adjAmount.value = null;
  adjDescription.value = "";
  detailPending.value = true;
  try {
    detail.value = await adminFetch(
      `/api/admin/customer-billing?customerId=${c.id}`,
    );
  } catch (e) {
    panelError.value = errMsg(e, "Failed to load billing.");
  } finally {
    detailPending.value = false;
  }
}

function closeManage() {
  selected.value = null;
  detail.value = null;
}

async function submitAdjust() {
  if (!selected.value || !adjAmount.value || adjAmount.value <= 0) return;
  adjBusy.value = true;
  panelError.value = null;
  panelMsg.value = null;
  try {
    const res = await adminFetch<{ balanceAfterCents: number }>(
      "/api/admin/wallet",
      {
        method: "POST",
        body: {
          customerId: selected.value.id,
          direction: adjDirection.value,
          amountUsdCents: Math.round(adjAmount.value * 100),
          type: adjType.value,
          description: adjDescription.value.trim() || undefined,
          createInvoice:
            adjDirection.value === "debit" && adjCreateInvoice.value,
        },
      },
    );
    selected.value.walletBalanceCents = res.balanceAfterCents;
    panelMsg.value = `Balance is now ${formatUsdCents(res.balanceAfterCents)}.`;
    adjAmount.value = null;
    adjDescription.value = "";
    await openManage(selected.value);
  } catch (e) {
    panelError.value = errMsg(e, "Adjustment failed.");
  } finally {
    adjBusy.value = false;
  }
}

async function addRecurring() {
  if (!selected.value || !recPlanKey.value) return;
  recBusy.value = true;
  panelError.value = null;
  try {
    await adminFetch("/api/admin/recurring", {
      method: "POST",
      body: { customerId: selected.value.id, planKey: recPlanKey.value },
    });
    recPlanKey.value = "";
    await openManage(selected.value);
  } catch (e) {
    panelError.value = errMsg(e, "Could not add service.");
  } finally {
    recBusy.value = false;
  }
}

async function setRecurringStatus(id: string, status: string) {
  panelError.value = null;
  try {
    await adminFetch("/api/admin/recurring", {
      method: "PATCH",
      body: { id, status },
    });
    if (selected.value) await openManage(selected.value);
  } catch (e) {
    panelError.value = errMsg(e, "Could not update service.");
  }
}

// type options per direction
const typeOptions = computed(() =>
  adjDirection.value === "credit"
    ? ["topup", "refund", "adjustment"]
    : ["feature", "change", "hosting", "database", "adjustment"],
);
watch(adjDirection, () => {
  adjType.value = typeOptions.value[0]!;
});

onMounted(loadCustomers);
</script>

<template>
  <div class="admin-page admin-page--customers">
    <h1 class="font-display text-2xl font-semibold text-white">Customers</h1>
    <p class="mt-1 text-sm text-slate-400">
      Everyone you build and host for. Manage wallets and recurring charges
      here.
    </p>

    <div v-if="!pending && !error" class="admin-summary">
      <div class="admin-summary-card">
        <span>Total clients</span>
        <strong>{{ customers.length }}</strong>
      </div>
      <div class="admin-summary-card">
        <span>Sites managed</span>
        <strong>{{ totalSites }}</strong>
      </div>
      <div class="admin-summary-card">
        <span>Client MRR</span>
        <strong>{{ formatUsdCents(totalMrr) }}</strong>
      </div>
      <div class="admin-summary-card">
        <span>Wallet balance</span>
        <strong>{{ formatUsdCents(totalWallet) }}</strong>
      </div>
    </div>

    <p v-if="pending" class="mt-8 text-sm text-slate-500">Loading…</p>
    <p v-else-if="error" class="mt-8 text-sm text-rose-400">{{ error }}</p>
    <p v-else-if="!customers.length" class="mt-8 text-sm text-slate-500">
      No customers yet.
    </p>

    <div v-else class="glass gradient-border mt-8 overflow-hidden rounded-2xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead
            class="border-b border-white/10 text-xs uppercase text-slate-500"
          >
            <tr>
              <th class="px-4 py-3 font-medium">Customer</th>
              <th class="px-4 py-3 font-medium">Sites</th>
              <th class="px-4 py-3 font-medium">Wallet</th>
              <th class="px-4 py-3 font-medium">Since</th>
              <th class="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            <tr v-for="c in customers" :key="c.id">
              <td class="px-4 py-3">
                <p class="font-medium text-white">{{ c.name }}</p>
                <a
                  :href="`mailto:${c.email}`"
                  class="text-xs text-brand-400 hover:text-brand-300"
                >
                  {{ c.email }}
                </a>
                <p v-if="c.company" class="text-xs text-slate-500">
                  {{ c.company }}
                </p>
              </td>
              <td class="px-4 py-3 text-slate-300">{{ c.siteCount }}</td>
              <td
                class="px-4 py-3 font-medium"
                :class="
                  c.walletBalanceCents > 0
                    ? 'text-emerald-300'
                    : 'text-slate-400'
                "
              >
                {{ formatUsdCents(c.walletBalanceCents) }}
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-slate-400">
                {{ formatDate(c.createdAt) }}
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  type="button"
                  class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/5"
                  @click="openManage(c)"
                >
                  Manage billing
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- manage billing modal -->
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      @click.self="closeManage"
    >
      <div
        class="glass-strong gradient-border my-auto w-full max-w-2xl rounded-2xl p-6"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-display text-lg font-semibold text-white">
              {{ selected.name }} — billing
            </h2>
            <p class="text-sm text-slate-400">
              Balance:
              <span class="font-semibold text-white">{{
                formatUsdCents(selected.walletBalanceCents)
              }}</span>
            </p>
          </div>
          <button
            type="button"
            class="text-sm text-slate-400 hover:text-white"
            @click="closeManage"
          >
            Close
          </button>
        </div>

        <p v-if="panelError" class="mt-3 text-sm text-rose-400">
          {{ panelError }}
        </p>
        <p v-if="panelMsg" class="mt-3 text-sm text-brand-300">
          {{ panelMsg }}
        </p>

        <div class="mt-5 grid gap-6 lg:grid-cols-2">
          <!-- adjust wallet -->
          <div class="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 class="text-sm font-semibold text-white">Adjust wallet</h3>
            <div class="mt-3 flex gap-2">
              <select
                v-model="adjDirection"
                class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="credit">Credit (+)</option>
                <option value="debit">Debit (−)</option>
              </select>
              <select
                v-model="adjType"
                class="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white capitalize"
              >
                <option v-for="t in typeOptions" :key="t" :value="t">
                  {{ t }}
                </option>
              </select>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <div class="relative flex-1">
                <span
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  >$</span
                >
                <input
                  v-model.number="adjAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount (USD)"
                  class="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-brand-400/60"
                />
              </div>
            </div>
            <input
              v-model="adjDescription"
              type="text"
              placeholder="Description (e.g. Feature: booking calendar)"
              class="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-brand-400/60"
            />
            <label
              v-if="adjDirection === 'debit'"
              class="mt-2 flex items-center gap-2 text-xs text-slate-400"
            >
              <input
                v-model="adjCreateInvoice"
                type="checkbox"
                class="rounded"
              />
              Raise a paid invoice for this charge
            </label>
            <button
              type="button"
              :disabled="adjBusy || !adjAmount"
              class="btn-gradient mt-3 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              @click="submitAdjust"
            >
              {{ adjBusy ? "Saving…" : "Apply" }}
            </button>
          </div>

          <!-- add recurring -->
          <div class="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 class="text-sm font-semibold text-white">
              Add recurring charge
            </h3>
            <select
              v-model="recPlanKey"
              class="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value="">Choose a service…</option>
              <option v-for="s in serviceOptions" :key="s.key" :value="s.key">
                {{ s.label }} — {{ formatUsdCents(s.amountUsdCents) }}/mo
              </option>
            </select>
            <button
              type="button"
              :disabled="recBusy || !recPlanKey"
              class="btn-gradient mt-3 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              @click="addRecurring"
            >
              {{ recBusy ? "Adding…" : "Add service" }}
            </button>
          </div>
        </div>

        <!-- recurring list -->
        <div v-if="detail" class="mt-6">
          <h3 class="text-sm font-semibold text-white">Recurring services</h3>
          <p
            v-if="!detail.recurring.length"
            class="mt-2 text-sm text-slate-500"
          >
            None yet.
          </p>
          <table v-else class="mt-3 w-full text-left text-sm">
            <tbody class="divide-y divide-white/5">
              <tr v-for="r in detail.recurring" :key="r.id">
                <td class="py-2 text-slate-200">{{ r.label }}</td>
                <td class="py-2 text-slate-300">
                  {{ formatUsdCents(r.amountCents) }}/{{
                    r.interval === "year" ? "yr" : "mo"
                  }}
                </td>
                <td class="py-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold"
                    :class="
                      r.status === 'active'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-500/15 text-slate-400'
                    "
                  >
                    {{ r.status }}
                  </span>
                </td>
                <td class="py-2 text-right">
                  <button
                    v-if="r.status === 'active'"
                    type="button"
                    class="text-xs text-amber-300 hover:underline"
                    @click="setRecurringStatus(r.id, 'paused')"
                  >
                    Pause
                  </button>
                  <button
                    v-else-if="r.status === 'paused'"
                    type="button"
                    class="text-xs text-emerald-300 hover:underline"
                    @click="setRecurringStatus(r.id, 'active')"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    class="ml-3 text-xs text-rose-300 hover:underline"
                    @click="setRecurringStatus(r.id, 'canceled')"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- recent ledger -->
        <div v-if="detail && detail.transactions.length" class="mt-6">
          <h3 class="text-sm font-semibold text-white">Recent transactions</h3>
          <table class="mt-3 w-full text-left text-sm">
            <tbody class="divide-y divide-white/5">
              <tr v-for="t in detail.transactions" :key="t.id">
                <td class="py-2 text-slate-400">
                  {{ formatDate(t.createdAt) }}
                </td>
                <td class="py-2 text-slate-200">{{ t.description }}</td>
                <td
                  class="py-2 text-right"
                  :class="
                    t.amountCents >= 0 ? 'text-emerald-300' : 'text-slate-200'
                  "
                >
                  {{ t.amountCents >= 0 ? "+" : "−"
                  }}{{ formatUsdCents(Math.abs(t.amountCents)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="detailPending" class="mt-4 text-sm text-slate-500">Loading…</p>
      </div>
    </div>
  </div>
</template>
