<script setup lang="ts">
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const services = [
  {
    number: "01",
    title: "Website creation",
    description:
      "Distinctive, high-performance websites designed and built around your goals.",
    link: "/pricing",
    action: "View build plans",
  },
  {
    number: "02",
    title: "Website hosting",
    description:
      "Fast, monitored hosting with SSL, backups, support, and room to grow.",
    link: "/pricing",
    action: "Explore hosting",
  },
  {
    number: "03",
    title: "Domain purchasing",
    description:
      "Domain registration, renewals, and management without markup games.",
    link: "/pricing",
    action: "Find your domain",
  },
];

const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const topShutter = ref<HTMLElement | null>(null);
const bottomShutter = ref<HTMLElement | null>(null);
const transitionLabel = ref<HTMLElement | null>(null);
const progress = ref<HTMLElement | null>(null);
const aperture = ref<HTMLElement | null>(null);
const dial = ref<HTMLElement | null>(null);
let context: gsap.Context | null = null;
let removePointerMove: (() => void) | null = null;

onBeforeUnmount(() => {
  context?.revert();
  removePointerMove?.();
});

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!root.value || !stage.value) return;

  gsap.registerPlugin(ScrollTrigger);
  context = gsap.context(() => {
    // gsap.quickTo's types only accept numbers, but CSS-var targets need the
    // "%" unit string (which gsap handles fine at runtime) — hence the casts.
    const setSpotX = gsap.quickTo(stage.value!, "--spot-x", {
      duration: 0.8,
      ease: "power3",
    }) as unknown as (value: string) => void;
    const setSpotY = gsap.quickTo(stage.value!, "--spot-y", {
      duration: 0.8,
      ease: "power3",
    }) as unknown as (value: string) => void;
    const onPointerMove = (event: PointerEvent) => {
      const bounds = stage.value!.getBoundingClientRect();
      setSpotX(`${((event.clientX - bounds.left) / bounds.width) * 100}%`);
      setSpotY(`${((event.clientY - bounds.top) / bounds.height) * 100}%`);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    removePointerMove = () =>
      window.removeEventListener("pointermove", onPointerMove);

    const entrance = gsap.timeline({ paused: true });

    entrance
      .fromTo(
        stage.value,
        {
          clipPath: "inset(14% 5% 14% 5% round 2.25rem)",
          scale: 0.94,
        },
        {
          clipPath: "inset(0% 0% 0% 0% round 0rem)",
          scale: 1,
          ease: "power3.inOut",
        },
        0,
      )
      .fromTo(
        topShutter.value,
        { scaleY: 1 },
        { scaleY: 0, ease: "power4.inOut" },
        0.12,
      )
      .fromTo(
        bottomShutter.value,
        { scaleY: 1 },
        { scaleY: 0, ease: "power4.inOut" },
        0.12,
      )
      .fromTo(
        transitionLabel.value,
        { opacity: 1, letterSpacing: "0.46em" },
        { opacity: 0, letterSpacing: "0.8em", ease: "power2.in" },
        0.42,
      )
      .fromTo(
        aperture.value,
        { scale: 0.08, opacity: 0.9, rotate: -24 },
        { scale: 5.5, opacity: 0, rotate: 18, ease: "power3.inOut" },
        0.38,
      );

    const content = gsap.timeline({ paused: true });

    content
      .fromTo(
        ".manifesto-kicker",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, ease: "power2.out" },
        0,
      )
      .fromTo(
        ".manifesto-word",
        { yPercent: 115, rotate: 2 },
        { yPercent: 0, rotate: 0, stagger: 0.08, ease: "power4.out" },
        0.04,
      )
      .fromTo(
        ".manifesto-copy",
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, ease: "power3.out" },
        0.32,
      )
      .fromTo(
        ".manifesto-principle",
        { opacity: 0, yPercent: 60 },
        { opacity: 1, yPercent: 0, stagger: 0.08, ease: "power3.out" },
        0.38,
      )
      .fromTo(
        dial.value,
        { rotate: -18, scale: 0.9 },
        { rotate: 42, scale: 1.08, ease: "none" },
        0,
      );

    // Drive both timelines forward only — once a beat has played it locks at
    // that progress, so scrolling back up is static (no reverse/replay).
    let entranceMax = 0;
    ScrollTrigger.create({
      trigger: root.value,
      start: "top bottom",
      end: "top top",
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (self.progress > entranceMax) {
          entranceMax = self.progress;
          entrance.progress(entranceMax);
        }
      },
    });

    let contentMax = 0;
    ScrollTrigger.create({
      trigger: root.value,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        if (self.progress > contentMax) {
          contentMax = self.progress;
          content.progress(contentMax);
          gsap.set(progress.value, { scaleY: contentMax });
        }
      },
    });
  }, root.value);
});
</script>

<template>
  <section ref="root" class="manifesto-shell relative">
    <div
      ref="stage"
      class="manifesto-stage sticky top-0 min-h-screen overflow-hidden"
    >
      <div class="manifesto-grain pointer-events-none absolute inset-0" />
      <div class="manifesto-aurora pointer-events-none absolute inset-0" />
      <div class="manifesto-spotlight pointer-events-none absolute inset-0" />

      <div
        ref="dial"
        class="manifesto-dial pointer-events-none absolute top-1/2 right-[-15vw] z-[1] hidden aspect-square w-[min(62vw,900px)] -translate-y-1/2 rounded-full lg:block"
        aria-hidden="true"
      >
        <div class="manifesto-dial-spinner absolute inset-0 rounded-full">
          <div class="manifesto-dial-ring absolute inset-[8%] rounded-full" />
          <div class="manifesto-dial-ring absolute inset-[22%] rounded-full" />
          <span class="manifesto-dial-tick manifesto-dial-tick-a" />
          <span class="manifesto-dial-tick manifesto-dial-tick-b" />
          <span class="manifesto-dial-tick manifesto-dial-tick-c" />
        </div>
      </div>

      <div
        class="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col justify-between px-6 py-24 sm:px-10 lg:px-24 lg:py-20"
      >
        <header
          class="manifesto-kicker flex items-center justify-between border-b border-white/10 pb-5 font-mono text-[0.6rem] uppercase tracking-[0.34em] text-white/40"
        >
          <span>Services / 01–03</span>
          <span class="hidden sm:block">From first idea to always online</span>
          <span>Full service</span>
        </header>

        <div
          class="my-auto grid items-end gap-14 py-16 lg:grid-cols-[1fr_0.32fr]"
        >
          <h2
            class="max-w-6xl font-display text-[clamp(4rem,10vw,10.5rem)] font-medium leading-[0.79] tracking-[-0.075em] text-[#eeeae2]"
          >
            <span class="manifesto-line block overflow-hidden pb-[0.12em]">
              <span class="manifesto-word block">We build.</span>
            </span>
            <span class="manifesto-line block overflow-hidden pb-[0.12em]">
              <span class="manifesto-word block">
                We keep it
                <em class="font-serif font-light text-[#aaa397]">live.</em>
              </span>
            </span>
          </h2>

          <div class="manifesto-copy max-w-sm border-l border-white/15 pl-6">
            <span class="mb-5 block h-2 w-2 rounded-full bg-[#ddd6ca]" />
            <p class="text-base leading-relaxed text-white/55 sm:text-lg">
              One team for the website, hosting, and domain. No handoffs, no
              fragmented setup, and no wondering who keeps everything running
              after launch.
            </p>
          </div>
        </div>

        <footer
          class="grid border-t border-white/10 md:grid-cols-3 md:divide-x md:divide-white/10"
        >
          <NuxtLink
            v-for="service in services"
            :key="service.number"
            :to="service.link"
            class="manifesto-principle service-card group relative flex min-h-40 flex-col justify-between overflow-hidden border-b border-white/10 py-6 transition-colors md:border-b-0 md:px-7 md:first:pl-0"
          >
            <span
              class="service-card-glow absolute inset-0 opacity-0 transition-opacity"
            />
            <span
              class="relative flex items-center justify-between font-mono text-[0.56rem] uppercase tracking-[0.3em] text-white/30"
            >
              {{ service.number }}
              <span class="service-arrow text-base text-white/45">↗</span>
            </span>
            <span class="relative mt-8">
              <strong
                class="block font-display text-xl font-medium tracking-[-0.03em] text-white/80 transition-colors group-hover:text-white"
              >
                {{ service.title }}
              </strong>
              <span
                class="mt-2 block max-w-xs text-xs leading-relaxed text-white/40"
              >
                {{ service.description }}
              </span>
              <span
                class="mt-4 block font-mono text-[0.52rem] uppercase tracking-[0.22em] text-white/35 transition-colors group-hover:text-white/70"
              >
                {{ service.action }}
              </span>
            </span>
          </NuxtLink>
        </footer>
      </div>

      <div class="absolute top-0 right-5 z-20 h-full w-px bg-white/10">
        <div
          ref="progress"
          class="h-full w-px origin-top scale-y-0 bg-[#e7e1d7]"
        />
      </div>

      <div
        ref="topShutter"
        class="manifesto-shutter absolute inset-x-0 top-0 z-30 h-1/2 origin-top"
      />
      <div
        ref="bottomShutter"
        class="manifesto-shutter absolute inset-x-0 bottom-0 z-30 h-1/2 origin-bottom"
      />
      <p
        ref="transitionLabel"
        class="absolute top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[0.58rem] uppercase tracking-[0.46em] text-white/55"
      >
        What we do
      </p>
      <div
        ref="aperture"
        class="manifesto-aperture pointer-events-none absolute top-1/2 left-1/2 z-40 aspect-square w-[22vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        aria-hidden="true"
      />
    </div>
  </section>
</template>

<style scoped>
.manifesto-shell {
  min-height: 140vh;
  margin-top: -8vh;
  padding-top: 8vh;
}

.manifesto-stage {
  --spot-x: 70%;
  --spot-y: 42%;
  background: #080808;
  transform-origin: center center;
}

.manifesto-shutter {
  background: #0d0c0b;
}

.manifesto-aurora {
  background:
    radial-gradient(
      circle at 76% 38%,
      rgba(142, 151, 160, 0.12),
      transparent 28%
    ),
    radial-gradient(circle at 23% 72%, rgba(111, 101, 88, 0.1), transparent 30%);
}

.manifesto-spotlight {
  z-index: 2;
  background: radial-gradient(
    circle 24rem at var(--spot-x) var(--spot-y),
    rgba(230, 225, 215, 0.11),
    rgba(157, 166, 174, 0.035) 35%,
    transparent 70%
  );
  mix-blend-mode: screen;
}

.manifesto-aperture {
  border: 1px solid rgba(238, 234, 226, 0.8);
  box-shadow:
    0 0 0 1.8vmin rgba(238, 234, 226, 0.08),
    0 0 0 4.5vmin rgba(238, 234, 226, 0.04),
    0 0 80px rgba(238, 234, 226, 0.18);
}

.manifesto-dial {
  opacity: 0.36;
}

.manifesto-dial-spinner {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0.16) 0deg 0.16deg,
    transparent 0.16deg 6deg
  );
  mask: radial-gradient(
    circle,
    transparent 0 46%,
    #000 46.2% 50%,
    transparent 50.2%
  );
  animation: manifesto-dial-spin 38s linear infinite;
  will-change: transform;
}

@keyframes manifesto-dial-spin {
  to {
    transform: rotate(360deg);
  }
}

.manifesto-dial-ring {
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.manifesto-dial-tick {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44%;
  height: 1px;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.3), transparent);
}

.manifesto-dial-tick-a {
  transform: rotate(18deg);
}

.manifesto-dial-tick-b {
  transform: rotate(143deg);
}

.manifesto-dial-tick-c {
  transform: rotate(258deg);
}

.service-card {
  isolation: isolate;
}

.service-card-glow {
  background:
    radial-gradient(
      circle at 75% 15%,
      rgba(232, 226, 216, 0.11),
      transparent 42%
    ),
    linear-gradient(135deg, rgba(255, 255, 255, 0.045), transparent 65%);
}

.service-card:hover .service-card-glow {
  opacity: 1;
}

.service-arrow {
  transform: translate(-0.2rem, 0.2rem);
  transition:
    color 300ms ease,
    transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
}

.service-card:hover .service-arrow {
  color: rgba(255, 255, 255, 0.9);
  transform: translate(0, 0);
}

.service-card::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: linear-gradient(90deg, #e7e1d7, transparent);
  content: "";
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}

.service-card:hover::after {
  transform: scaleX(1);
}

.manifesto-grain {
  opacity: 0.13;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
  mix-blend-mode: soft-light;
}

@media (prefers-reduced-motion: reduce) {
  .manifesto-shell {
    min-height: 100vh;
    margin-top: 0;
    padding-top: 0;
  }

  .manifesto-shutter,
  .manifesto-stage > p {
    display: none;
  }

  .manifesto-dial-spinner {
    animation: none;
  }
}
</style>
