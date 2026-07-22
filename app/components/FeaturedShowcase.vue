<script setup lang="ts">
import { projects } from "~~/shared/site";

const featured = projects.slice(0, 4);

const isExternal = (url?: string) => !!url && /^https?:\/\//.test(url);
const linkAttrs = (url?: string) =>
  isExternal(url)
    ? { href: url, target: "_blank", rel: "noopener noreferrer" }
    : { href: url || "/showcase" };

// The cards move on their own as a seamless horizontal ribbon (no scroll-jacking
// pin). We render the set twice and translate the track by exactly one set width,
// so the loop is continuous. The duplicate set is hidden from assistive tech.
const ribbon = computed(() =>
  [...featured, ...featured].map((project, i) => ({
    project,
    n: i % featured.length,
    clone: i >= featured.length,
    key: `${project.id}-${i}`,
  })),
);
</script>

<template>
  <section class="relative hidden overflow-hidden py-24 lg:block">
    <div class="mx-auto flex max-w-[1500px] items-end justify-between px-[8vw]">
      <div>
        <p
          class="mb-8 flex items-center gap-4 font-mono text-xs uppercase tracking-[0.4em] text-slate-500"
        >
          <span class="h-px w-12 bg-slate-700" />
          Selected work
        </p>
        <h2
          class="font-serif text-[clamp(2.5rem,5.5vw,5rem)] font-light leading-[1.04] tracking-[-0.01em] text-[#ece9e2]"
        >
          The <span class="italic text-brand-300">work</span>
        </h2>
      </div>
      <NuxtLink
        to="/showcase"
        class="btn-line mb-2 inline-flex w-fit items-center gap-3 px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em]"
      >
        View all
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </NuxtLink>
    </div>

    <!-- self-running ribbon — keeps moving even under the cursor -->
    <div class="work-ribbon mt-16 overflow-hidden">
      <div class="work-ribbon-track flex w-max">
        <a
          v-for="item in ribbon"
          :key="item.key"
          v-bind="linkAttrs(item.project.url)"
          :aria-hidden="item.clone ? 'true' : undefined"
          :tabindex="item.clone ? -1 : undefined"
          class="work-frame group relative mr-8 block h-[62vh] w-[42vw] shrink-0 overflow-hidden rounded-[1.75rem] border border-white/10"
        >
          <ProjectIdentityVisual :name="item.project.name" :index="item.n" />
          <div
            class="showcase-overlay-a absolute inset-0 flex flex-col justify-between p-10"
          >
            <div
              class="flex items-center justify-between font-mono text-xs uppercase tracking-[0.3em] text-[#ece9e2]/70"
            >
              <span>0{{ item.n + 1 }}</span>
              <span class="flex items-center gap-2">
                {{ item.project.category }}
                <svg
                  class="opacity-50 transition duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </span>
            </div>
            <div class="flex items-end justify-between gap-6">
              <p
                class="font-mono text-xs uppercase tracking-[0.25em] text-slate-400"
              >
                {{ item.project.metric }} — {{ item.project.metricLabel }}
              </p>
              <span
                class="work-open-label font-mono text-[0.55rem] uppercase tracking-[0.28em] text-white/35"
              >
                Open project
              </span>
            </div>
          </div>
        </a>
      </div>
    </div>
  </section>

  <section class="px-6 py-24 sm:px-10 lg:hidden">
    <p
      class="mb-8 flex items-center gap-4 font-mono text-xs uppercase tracking-[0.4em] text-slate-500"
    >
      <span class="h-px w-12 bg-slate-700" />
      Selected work
    </p>
    <h2
      class="font-serif text-[clamp(2.5rem,12vw,4rem)] font-light leading-[1.05] tracking-tight text-[#ece9e2]"
    >
      The <span class="italic text-brand-300">work</span>
    </h2>

    <div
      v-reveal:stagger="{ selector: '.m-frame', stagger: 0.12 }"
      class="mt-12 space-y-5"
    >
      <a
        v-for="(project, i) in featured"
        :key="project.id"
        v-bind="linkAttrs(project.url)"
        class="m-frame group relative block aspect-[4/5] w-full overflow-hidden rounded-3xl border border-white/10"
      >
        <ProjectIdentityVisual :name="project.name" :index="i" />
        <div
          class="showcase-overlay-b absolute inset-0 flex flex-col justify-between p-7"
        >
          <div
            class="flex items-center justify-between font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[#ece9e2]/70"
          >
            <span>0{{ i + 1 }}</span>
            <span class="flex items-center gap-2">
              {{ project.category }}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </div>
          <p
            class="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-slate-400"
          >
            {{ project.metric }} — {{ project.metricLabel }}
          </p>
        </div>
      </a>
    </div>
  </section>
</template>

<style scoped>
/* Static gradients live here (not inline style attributes): prettier reflows
   long inline styles across lines, and the reformatted whitespace triggers
   SSR hydration style-mismatch warnings. */
.showcase-overlay-a {
  background: linear-gradient(
    to top,
    rgba(14, 13, 12, 0.72),
    transparent 32%,
    rgba(14, 13, 12, 0.2)
  );
}
.showcase-overlay-b {
  background: linear-gradient(
    to top,
    rgba(14, 13, 12, 0.72),
    transparent 38%,
    rgba(14, 13, 12, 0.2)
  );
}

/* self-running ribbon: render the set twice, translate by one set width */
.work-ribbon-track {
  animation: work-ribbon 44s linear infinite;
}

@keyframes work-ribbon {
  to {
    transform: translateX(-50%);
  }
}

.work-frame,
.m-frame {
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0);
  transition:
    transform 1.5s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 1.2s ease,
    box-shadow 1.8s ease;
}

.work-frame > div:last-child,
.m-frame > div:last-child {
  transition: background-color 1.5s ease;
}

.work-frame:hover,
.m-frame:hover {
  transform: translateY(-0.45rem);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 36px 100px rgba(0, 0, 0, 0.34);
}

.work-open-label {
  opacity: 0.55;
  transform: translateY(0.35rem);
  transition:
    opacity 1.2s ease 0.12s,
    transform 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s;
}

.work-frame:hover .work-open-label {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .work-ribbon-track {
    animation: none;
  }
  .work-ribbon {
    overflow-x: auto;
  }

  .work-frame,
  .m-frame,
  .work-open-label {
    transition: none;
  }

  .work-frame:hover,
  .m-frame:hover {
    transform: none;
  }
}
</style>
