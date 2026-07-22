<script setup lang="ts">
import gsap from "gsap";
import { stats as fallbackStats, type Stat } from "~~/shared/site";

const { data } = await useFetch("/api/stats", {
  default: () => ({ stats: fallbackStats }),
});

const items = computed<Stat[]>(() => data.value?.stats ?? fallbackStats);
const root = ref<HTMLElement | null>(null);
const introShell = ref<HTMLElement | null>(null);
const introPin = ref<HTMLElement | null>(null);
const metrics = ref<HTMLElement | null>(null);
let ctx: gsap.Context | null = null;
let tick: gsap.TickerCallback | null = null;

function parse(raw: string) {
  const match = raw.trim().match(/^(\D*?)([\d.,]+)(.*)$/s);
  if (!match) return null;
  const [, prefix, numStr = "", suffix] = match;
  const hasComma = numStr.includes(",");
  const decimals = (numStr.split(".")[1] ?? "").length;
  const target = parseFloat(numStr.replace(/,/g, ""));
  const fmt = (number: number) => {
    let value = number.toFixed(decimals);
    if (hasComma) {
      const [integer, decimal] = value.split(".");
      value =
        Number(integer).toLocaleString("en-US") +
        (decimal ? `.${decimal}` : "");
    }
    return prefix + value + suffix;
  };
  return { target, fmt };
}

onBeforeUnmount(() => {
  if (tick) gsap.ticker.remove(tick);
  ctx?.revert();
});

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const element = root.value;
  if (!element) return;

  ctx = gsap.context(() => {
    // ── Cinematic aperture intro ──────────────────────────────────────────────
    // Black bars cover the stage. As you scroll, the title zooms out of the
    // blackness while the bars part (bright bordered edges) to reveal it, then
    // it eases away to hand off to the metrics. Faux-pinned via the live rect
    // (reliable under the transformed v-stack ancestor that breaks sticky).
    const shell = introShell.value;
    const pin = introPin.value;
    const reveal = element.querySelector<HTMLElement>(".reveal-layer");
    const barTop = element.querySelector<HTMLElement>(".aperture-top");
    const barBot = element.querySelector<HTMLElement>(".aperture-bottom");
    if (shell && pin) {
      const easeOut = gsap.parseEase("expo.out");
      const easeIO = gsap.parseEase("expo.inOut");
      const lerp = gsap.utils.interpolate;
      // The faux-pin position stays live, but the reveal itself is one-way:
      // once a beat has played it locks, so scrolling back up is static.
      let maxP = 0;
      const onTick = () => {
        const vh = window.innerHeight || 1;
        const max = Math.max(1, shell.offsetHeight - vh);
        const ty = gsap.utils.clamp(0, max, -shell.getBoundingClientRect().top);
        pin.style.transform = `translateY(${ty.toFixed(1)}px)`;
        if (ty / max > maxP) maxP = ty / max;
        const p = maxP;

        // bars part outward (0.12 → 0.55)
        const open = easeOut(gsap.utils.clamp(0, 1, (p - 0.12) / 0.43));
        if (barTop) barTop.style.transform = `translateY(${-open * 101}%)`;
        if (barBot) barBot.style.transform = `translateY(${open * 101}%)`;

        // title zooms out of the black + fades in, then holds. We deliberately
        // don't ease it away at the end: the reveal is locked one-way, so the
        // hold keeps the title rendered when scrolling back up (no blank stage).
        if (reveal) {
          const zoom = easeIO(gsap.utils.clamp(0, 1, p / 0.55));
          const appear = gsap.utils.clamp(0, 1, (p - 0.1) / 0.28);
          reveal.style.transform = `scale(${lerp(1.28, 1, zoom).toFixed(3)})`;
          reveal.style.opacity = appear.toFixed(3);
        }
      };
      tick = onTick;
      gsap.ticker.add(onTick);
      onTick();
    }

    // ── Metrics: develop the grid + count, when it scrolls into view ──
    const cards = gsap.utils.toArray<HTMLElement>(".stat-card");
    const values = gsap.utils.toArray<HTMLElement>(".stat-value");
    const rules = gsap.utils.toArray<HTMLElement>(".stat-rule");
    const parsed = values.map((node) => {
      const result = parse(node.dataset.value ?? node.textContent ?? "");
      if (result) node.textContent = result.fmt(0);
      return result;
    });

    const metas = gsap.utils.toArray<HTMLElement>(".stat-meta");
    const captions = gsap.utils.toArray<HTMLElement>(".stat-caption");

    // initial states for the reveal sequence
    gsap.set(cards, { clipPath: "inset(0 0 100% 0)", autoAlpha: 0 });
    gsap.set(values, { filter: "blur(18px)", opacity: 0, yPercent: 14 });
    gsap.set(rules, { scaleX: 0, transformOrigin: "left center" });
    gsap.set([metas, captions], { autoAlpha: 0, y: 14 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: metrics.value, start: "top 78%", once: true },
      defaults: { ease: "expo.inOut" },
    });

    // 1 — the intro statement rises in
    tl.from(".stats-intro > *", {
      autoAlpha: 0,
      y: 28,
      duration: 1.1,
      ease: "expo.out",
      stagger: 0.12,
    });

    // 2 — the cards develop upward in a diagonal sweep (clip-path wipe)
    tl.to(
      cards,
      {
        clipPath: "inset(0 0 0% 0)",
        autoAlpha: 1,
        duration: 1.2,
        stagger: 0.14,
      },
      0.35,
    );

    // 3 — per card: the metric tag fades, the number blurs into focus while it
    //     counts up, the rule draws, the caption settles — one continuous motion
    parsed.forEach((result, index) => {
      const at = 0.55 + index * 0.14;
      if (metas[index])
        tl.to(metas[index], { autoAlpha: 1, y: 0, duration: 0.7 }, at);
      if (values[index]) {
        tl.to(
          values[index],
          { filter: "blur(0px)", opacity: 1, yPercent: 0, duration: 1.2 },
          at + 0.05,
        );
        if (result) {
          const counter = { value: 0 };
          tl.to(
            counter,
            {
              value: result.target,
              duration: 1.7,
              ease: "power3.out",
              onUpdate: () =>
                (values[index]!.textContent = result.fmt(counter.value)),
            },
            at + 0.05,
          );
        }
      }
      if (rules[index])
        tl.to(rules[index], { scaleX: 1, duration: 1.1 }, at + 0.15);
      if (captions[index])
        tl.to(captions[index], { autoAlpha: 1, y: 0, duration: 0.8 }, at + 0.3);
    });
  }, element);
});

const metricKind = (index: number) =>
  ["Output", "Performance", "Impact", "Reach"][index] ?? "Record";
</script>

<template>
  <section ref="root" class="stats-section relative">
    <div
      class="stats-grid pointer-events-none absolute inset-0"
      aria-hidden="true"
    />

    <!-- cinematic aperture intro: black bars cover the stage; scrolling parts
         them (bright bordered edges) as the title zooms out of the blackness -->
    <div ref="introShell" class="stats-intro-shell relative h-[200vh]">
      <div
        ref="introPin"
        class="intro-pin absolute inset-x-0 top-0 h-screen overflow-hidden"
      >
        <!-- the info revealed by the aperture -->
        <div
          class="reveal-layer absolute inset-0 flex items-center px-6 opacity-0 sm:px-10 lg:px-24"
        >
          <div class="relative mx-auto w-full max-w-[1500px]">
            <span
              class="pointer-events-none absolute -top-[0.42em] right-0 select-none font-display text-[42vw] font-medium leading-none tracking-tighter text-white/[0.04] lg:text-[24vw]"
              aria-hidden="true"
              >04</span
            >
            <p
              class="relative flex items-center gap-4 font-mono text-[0.65rem] uppercase tracking-[0.42em] text-slate-400"
            >
              <span class="h-px w-12 bg-slate-600" />
              Evidence, not adjectives
            </p>
            <h2
              class="relative mt-10 max-w-5xl font-serif text-[clamp(3rem,8vw,9rem)] font-light leading-[0.92] tracking-[-0.03em] text-[#ece9e2]"
            >
              The work leaves a mark.
            </h2>
            <p
              class="relative mt-12 flex items-center gap-3 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-slate-500"
            >
              <span class="inline-block h-2 w-2 rounded-full bg-[#d4cfc4]" />
              Scroll — the numbers
            </p>
          </div>
        </div>

        <!-- aperture bars (closed = full black cover) -->
        <div
          class="aperture-top pointer-events-none absolute inset-x-0 top-0 z-20 h-[50.5%] border-b border-[#d4cfc4]/30 bg-[#0a0908]"
          aria-hidden="true"
        />
        <div
          class="aperture-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[50.5%] border-t border-[#d4cfc4]/30 bg-[#0a0908]"
          aria-hidden="true"
        />
      </div>
    </div>

    <!-- the metrics -->
    <div
      ref="metrics"
      class="relative mx-auto grid max-w-[1500px] gap-20 px-6 pb-32 sm:px-10 sm:pb-44 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)] lg:gap-16 lg:px-24"
    >
      <div class="stats-intro lg:sticky lg:top-32 lg:self-start">
        <p
          class="flex items-center gap-4 font-mono text-[0.65rem] uppercase tracking-[0.42em] text-slate-500"
        >
          <span class="h-px w-12 bg-slate-700" />
          By the numbers
        </p>
        <p
          class="mt-10 max-w-md text-base leading-relaxed text-slate-400 sm:text-lg"
        >
          Measured in launches, speed, commercial impact, and reach. These are
          the numbers behind the polish.
        </p>
        <div class="stats-console mt-14 hidden lg:block">
          <div class="stats-console-head">
            <span>Studio telemetry</span>
            <span class="stats-console-status">Live</span>
          </div>
          <div class="stats-console-wave" aria-hidden="true">
            <span
              v-for="bar in 24"
              :key="bar"
              :style="{
                '--bar': bar,
                height: `${18 + (bar % 7) * 8}%`,
              }"
            />
          </div>
          <div class="stats-console-foot">
            <span>04 records</span>
            <span>Verified output</span>
          </div>
        </div>
        <div
          class="mt-10 hidden items-center gap-4 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-slate-600 lg:flex"
        >
          <span class="inline-block h-2 w-2 rounded-full bg-[#d4cfc4]" />
          Live studio record
        </div>
      </div>

      <ol class="stats-records grid gap-3 sm:grid-cols-2">
        <li
          v-for="(stat, index) in items"
          :key="stat.label"
          class="stat-card group relative min-h-[20rem] overflow-hidden rounded-[1.5rem] border border-white/[0.1] p-7 sm:min-h-[25rem] sm:p-9"
        >
          <div
            class="stat-sheen pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100"
          />
          <div
            class="stat-scan pointer-events-none absolute inset-x-0 top-0 h-px"
          />
          <span
            class="stat-ghost pointer-events-none absolute -right-[0.04em] -bottom-[0.18em] select-none font-display text-[clamp(12rem,22vw,22rem)] font-medium leading-none tracking-[-0.12em]"
            aria-hidden="true"
          >
            {{ String(index + 1).padStart(2, "0") }}
          </span>
          <svg
            class="stat-orbit pointer-events-none absolute top-1/2 left-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2"
            viewBox="0 0 300 300"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="150" cy="150" r="104" />
            <circle cx="150" cy="150" r="74" stroke-dasharray="2 9" />
            <circle class="stat-orbit-node" cx="150" cy="46" r="3.5" />
          </svg>

          <div class="relative flex h-full flex-col justify-between">
            <div
              class="stat-meta flex items-center justify-between font-mono text-[0.6rem] uppercase tracking-[0.3em] text-slate-600"
            >
              <span>Metric {{ String(index + 1).padStart(2, "0") }}</span>
              <span>{{ metricKind(index) }}</span>
            </div>

            <div class="mt-20">
              <span
                class="stat-value block font-display text-[clamp(4.75rem,10vw,10rem)] font-medium leading-[0.78] tracking-[-0.075em] text-[#ece9e2]"
                :data-value="stat.value"
              >
                {{ stat.value }}
              </span>
              <div
                class="stat-rule mt-9 h-px bg-gradient-to-r from-[#d4cfc4]/70 via-white/20 to-transparent"
              />
              <div
                class="stat-caption mt-5 flex items-start justify-between gap-6"
              >
                <span
                  class="max-w-[15rem] font-mono text-[0.68rem] uppercase leading-relaxed tracking-[0.28em] text-slate-400"
                >
                  {{ stat.label }}
                </span>
                <span
                  class="font-serif text-2xl font-light italic text-slate-600"
                  >↗</span
                >
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.stats-section {
  background:
    radial-gradient(
      circle at 78% 24%,
      rgba(236, 233, 226, 0.055),
      transparent 30%
    ),
    #121110;
}

.stats-grid {
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(
    to bottom,
    transparent,
    black 16%,
    black 84%,
    transparent
  );
}

.stat-sheen {
  background:
    radial-gradient(
      circle at 25% 70%,
      rgba(236, 233, 226, 0.11),
      transparent 58%
    ),
    linear-gradient(135deg, rgba(255, 255, 255, 0.035), transparent 60%);
}

.stats-console {
  width: min(100%, 23rem);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.018);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.stats-console-head,
.stats-console-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1rem;
  color: rgba(148, 163, 184, 0.5);
  font-family: monospace;
  font-size: 0.55rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.stats-console-head {
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.stats-console-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.stats-console-status {
  color: rgba(236, 233, 226, 0.7);
}

.stats-console-status::before {
  display: inline-block;
  width: 0.35rem;
  height: 0.35rem;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: #ece9e2;
  box-shadow: 0 0 0 5px rgba(236, 233, 226, 0.06);
  content: "";
}

.stats-console-wave {
  display: flex;
  height: 5.5rem;
  align-items: center;
  gap: 0.26rem;
  padding: 0 1rem;
}

.stats-console-wave span {
  width: 2px;
  background: linear-gradient(
    to top,
    rgba(236, 233, 226, 0.12),
    rgba(236, 233, 226, 0.72)
  );
  transform-origin: center;
  animation: stats-wave 2.8s ease-in-out infinite alternate;
  animation-delay: calc(var(--bar) * -90ms);
}

.stat-card {
  background: rgba(255, 255, 255, 0.012);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
  transition:
    border-color 1s ease,
    background-color 1s ease,
    transform 1.2s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 1.2s ease;
}

.stat-card:hover {
  z-index: 2;
  border-color: rgba(236, 233, 226, 0.24);
  background-color: rgba(255, 255, 255, 0.026);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.24);
  transform: translateY(-0.45rem);
}

.stat-ghost {
  color: rgba(255, 255, 255, 0.018);
  transition:
    color 1.4s ease,
    transform 1.8s cubic-bezier(0.16, 1, 0.3, 1);
}

.stat-card:hover .stat-ghost {
  color: rgba(255, 255, 255, 0.04);
  transform: translate(-0.03em, -0.03em);
}

.stat-orbit {
  stroke: rgba(236, 233, 226, 0.08);
  stroke-width: 0.7;
  transform-origin: center;
  transition:
    stroke 1.4s ease,
    transform 2s cubic-bezier(0.16, 1, 0.3, 1);
}

.stat-orbit-node {
  fill: rgba(236, 233, 226, 0.65);
  stroke: none;
}

.stat-card:hover .stat-orbit {
  stroke: rgba(236, 233, 226, 0.16);
  transform: translate(-50%, -50%) rotate(22deg) scale(1.05);
}

.stat-value {
  position: relative;
  z-index: 1;
  transition:
    transform 1.4s cubic-bezier(0.16, 1, 0.3, 1),
    text-shadow 1.4s ease;
}

.stat-card:hover .stat-value {
  text-shadow: 0 18px 70px rgba(236, 233, 226, 0.09);
  transform: translateY(-0.35rem);
}

.stat-scan {
  z-index: 3;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(236, 233, 226, 0.38),
    transparent
  );
  opacity: 0;
  transform: translateY(0);
}

.stat-card:hover .stat-scan {
  animation: stat-scan 2.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes stats-wave {
  to {
    transform: scaleY(0.35);
    opacity: 0.35;
  }
}

@keyframes stat-scan {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  20% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    transform: translateY(25rem);
  }
}

/* the JS aperture doesn't run under reduced motion — collapse the tall shell,
   drop the covering bars, and just show the title in normal flow */
@media (prefers-reduced-motion: reduce) {
  .stats-intro-shell {
    height: auto;
  }
  .intro-pin {
    position: relative;
    height: auto;
    padding-top: 7rem;
    padding-bottom: 7rem;
  }
  .reveal-layer {
    position: relative;
    opacity: 1 !important;
  }
  .aperture-top,
  .aperture-bottom {
    display: none;
  }

  .stats-console-wave span,
  .stat-card:hover .stat-scan {
    animation: none;
  }

  .stat-card:hover {
    transform: none;
  }
}
</style>
