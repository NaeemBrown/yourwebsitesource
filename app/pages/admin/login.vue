<script setup lang="ts">
definePageMeta({ layout: false });

useSeoMeta({ title: "Admin sign in — TheWebsiteForge", robots: "noindex" });

const { user, ready, configured, signInWithGoogle } = useAuth();
const router = useRouter();

const signingIn = ref(false);
const error = ref<string | null>(null);

// Once signed in, leave the login page.
watch(
  [ready, user],
  async () => {
    if (ready.value && user.value) await router.replace("/admin");
  },
  { immediate: true },
);

async function handleSignIn() {
  error.value = null;
  signingIn.value = true;
  try {
    await signInWithGoogle();
  } catch (e) {
    const err = e as { message?: string };
    error.value = err?.message || "Sign-in failed. Please try again.";
  } finally {
    signingIn.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-[#05070d] px-4 text-slate-200"
  >
    <div
      class="glass gradient-border w-full max-w-sm rounded-2xl p-8 text-center"
    >
      <div class="flex justify-center">
        <LogoMark :size="40" />
      </div>
      <h1 class="mt-5 font-display text-xl font-semibold text-white">
        Admin sign in
      </h1>
      <p class="mt-2 text-sm text-slate-400">
        Sign in with an authorized Google account to manage TheWebsiteForge.
      </p>

      <!-- ClientOnly: `configured` is set by the client-only Firebase
           plugin, so SSR always sees false — rendering the branch on the
           server causes a hydration mismatch. -->
      <ClientOnly>
        <div
          v-if="!configured"
          class="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-200"
        >
          Firebase is not configured yet. Add the
          <code class="text-amber-100">NUXT_PUBLIC_FIREBASE_*</code> values to
          your <code class="text-amber-100">.env</code> to enable Google
          sign-in.
        </div>

        <button
          v-else
          class="btn-gradient mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          :disabled="signingIn"
          @click="handleSignIn"
        >
          <span
            v-if="signingIn"
            class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
          {{ signingIn ? "Signing in…" : "Continue with Google" }}
        </button>

        <p v-if="error" class="mt-4 text-xs text-rose-400">{{ error }}</p>
      </ClientOnly>

      <NuxtLink
        to="/"
        class="mt-6 inline-block text-xs text-slate-500 transition hover:text-slate-300"
      >
        ← Back to site
      </NuxtLink>
    </div>
  </div>
</template>
