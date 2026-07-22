<script setup lang="ts">
import { formatUsdCents } from "~~/shared/billing";

/** Invoice detail + PDF download for the signed-in customer. */
const route = useRoute();
const { user, ready, authFetch } = useAuth();

interface InvoiceDetail {
  invoice: {
    id: string;
    number: number;
    type: string;
    amountCents: number;
    vatCents: number;
    currency: string;
    status: string;
    issuedAt: string;
    paidAt: string | null;
  };
  customer: { name: string; email: string; company: string | null };
  lineItems: { description: string; amountCents: number }[];
}

const data = ref<InvoiceDetail | null>(null);
const pending = ref(true);
const error = ref<string | null>(null);
const downloading = ref(false);
const resumeBusy = ref(false);
const actionError = ref<string | null>(null);

const id = computed(() => route.params.id as string);

const fmtDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

const statusClass = (s: string) =>
  ({
    paid: "bg-emerald-500/15 text-emerald-300",
    open: "bg-brand-500/15 text-brand-300",
    failed: "bg-rose-500/15 text-rose-300",
    refunded: "bg-slate-500/15 text-slate-400",
  })[s] || "bg-slate-500/15 text-slate-400";

async function load() {
  if (!user.value) return;
  pending.value = true;
  error.value = null;
  try {
    data.value = await authFetch<InvoiceDetail>(
      `/api/account/invoice?id=${id.value}`,
    );
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    error.value =
      err?.data?.statusMessage || err?.statusMessage || "Invoice not found.";
  } finally {
    pending.value = false;
  }
}

async function downloadPdf() {
  downloading.value = true;
  actionError.value = null;
  try {
    const blob = await authFetch<Blob>(
      `/api/account/invoice-pdf?id=${id.value}`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${String(data.value?.invoice.number).padStart(5, "0")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    actionError.value = "Could not download the PDF.";
  } finally {
    downloading.value = false;
  }
}

async function payNow() {
  resumeBusy.value = true;
  actionError.value = null;
  try {
    const res = await authFetch<{ authorizationUrl?: string }>(
      "/api/account/resume-payment",
      { method: "POST", body: { invoiceId: id.value } },
    );
    if (res?.authorizationUrl) {
      window.location.href = res.authorizationUrl;
    } else {
      throw new Error("No checkout URL.");
    }
  } catch (e) {
    const err = e as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    actionError.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Could not start payment.";
    resumeBusy.value = false;
  }
}

if (import.meta.client) {
  watch(
    [ready, () => user.value?.uid],
    () => {
      if (ready.value && user.value) load();
    },
    { immediate: true },
  );
}

useSeoMeta({ title: "Invoice — TheWebsiteForge", robots: "noindex" });
</script>

<template>
  <div class="px-4 pt-36 pb-24 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl">
      <NuxtLink to="/account" class="text-sm text-slate-400 hover:text-white">
        ← Back to account
      </NuxtLink>

      <!-- `user && pending`: a signed-out visitor never runs load(), so pending
           alone would show "Loading…" forever instead of the sign-in prompt. -->
      <div
        v-if="!ready || (user && pending)"
        class="glass mt-6 rounded-2xl p-10 text-center text-slate-400"
      >
        Loading…
      </div>
      <div
        v-else-if="!user"
        class="glass mt-6 rounded-2xl p-10 text-center text-slate-400"
      >
        Please sign in to view this invoice.
      </div>
      <div
        v-else-if="error"
        class="glass mt-6 rounded-2xl p-10 text-center text-white"
      >
        {{ error }}
      </div>

      <div v-else-if="data" class="glass-strong mt-6 rounded-2xl p-8">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 class="font-display text-2xl font-bold text-white">
              Invoice #{{ String(data.invoice.number).padStart(5, "0") }}
            </h1>
            <p class="mt-1 text-sm text-slate-400">
              Issued {{ fmtDate(data.invoice.issuedAt) }}
            </p>
          </div>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold capitalize"
            :class="statusClass(data.invoice.status)"
          >
            {{ data.invoice.status }}
          </span>
        </div>

        <div class="mt-6 border-t border-white/10 pt-6">
          <p class="text-xs uppercase tracking-wide text-white/40">Billed to</p>
          <p class="mt-2 text-white">
            {{ data.customer.company || data.customer.name }}
          </p>
          <p class="text-sm text-slate-400">{{ data.customer.email }}</p>
        </div>

        <table class="mt-6 w-full text-left text-sm">
          <thead>
            <tr class="border-b border-white/10 text-slate-400">
              <th class="py-2 font-medium">Description</th>
              <th class="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(li, idx) in data.lineItems"
              :key="idx"
              class="border-b border-white/5"
            >
              <td class="py-2.5 text-slate-200">{{ li.description }}</td>
              <td class="py-2.5 text-right text-slate-200">
                {{ formatUsdCents(li.amountCents) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div class="mt-4 flex justify-end">
          <div class="w-48 space-y-1 text-sm">
            <div
              v-if="data.invoice.vatCents > 0"
              class="flex justify-between text-slate-400"
            >
              <span>VAT</span>
              <span>{{ formatUsdCents(data.invoice.vatCents) }}</span>
            </div>
            <div class="flex justify-between font-semibold text-white">
              <span>Total</span>
              <span>
                {{
                  formatUsdCents(
                    data.invoice.amountCents + data.invoice.vatCents,
                  )
                }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            :disabled="downloading"
            class="glass rounded-lg px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            @click="downloadPdf"
          >
            {{ downloading ? "Preparing…" : "Download PDF" }}
          </button>
          <button
            v-if="
              data.invoice.status === 'open' && data.invoice.type === 'build'
            "
            type="button"
            :disabled="resumeBusy"
            class="btn-gradient rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            @click="payNow"
          >
            {{ resumeBusy ? "Starting…" : "Complete payment" }}
          </button>
        </div>
        <p v-if="actionError" class="mt-3 text-sm text-white">
          {{ actionError }}
        </p>
      </div>
    </div>
  </div>
</template>
