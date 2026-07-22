/**
 * Lumina motion system — GSAP + ScrollTrigger + Lenis smooth scroll.
 *
 * Registers a small library of auto-available Vue directives so components stay
 * declarative:
 *   v-reveal               — fade/slide-in on scroll
 *   v-reveal:stagger       — stagger children in on scroll
 *   v-parallax="0.2"       — scrub-driven parallax (fraction of own height)
 *   v-magnetic             — retired (no-op); buttons are sharp/mechanical now
 *   v-tilt                 — 3D pointer tilt (great on cards)
 *   v-count                — count-up the numeric part of the element's text
 *   v-split="{ delay }"    — word/char rise-in reveal for headings
 *   v-lines="{ delay }"    — masked line-by-line rise reveal (editorial feel)
 *   v-spotlight            — cursor-tracking glow over a card
 *   v-skew                 — scroll-velocity shear (the "alive" feel)
 *   v-stack                — parallax-stacking recede as a section scrolls away
 *   v-bgmorph              — smooth dark↔light page-colour scrub for a section
 *
 * The plugin is universal so the directives resolve during SSR, but every hook
 * body runs client-only and bails out under `prefers-reduced-motion`.
 */
import type { Directive } from "vue";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RevealOpts, SplitOpts } from "~/types/motion";
import { shouldReduceMotion } from "~/utils/deviceTier";

// per-element teardown bag (keeps `el` free of ad-hoc props for TS' sake)
const cleanups = new WeakMap<HTMLElement, Array<() => void>>();
function onCleanup(el: HTMLElement, fn: () => void) {
  const arr = cleanups.get(el) ?? [];
  arr.push(fn);
  cleanups.set(el, arr);
}
function runCleanup(el: HTMLElement) {
  cleanups.get(el)?.forEach((fn) => fn());
  cleanups.delete(el);
}

// latest Lenis scroll velocity, shared with the v-skew directive and any
// component that wants to react to scroll speed (e.g. the logo marquee)
const velocity = { value: 0 };
export function scrollVelocity() {
  return velocity.value;
}

// Single shared per-frame loop. The v-skew / v-stack / v-bgmorph directives each
// used to register their own `gsap.ticker` callback (N function calls/frame).
// Consolidating them into one registry means a single ticker call per frame
// that iterates the active elements, regardless of how many opt in.
const frameCallbacks = new Set<() => void>();
let frameTickerAdded = false;
function runFrameCallbacks() {
  for (const fn of frameCallbacks) fn();
}
function addFrameCallback(fn: () => void) {
  frameCallbacks.add(fn);
  if (!frameTickerAdded) {
    gsap.ticker.add(runFrameCallbacks);
    frameTickerAdded = true;
  }
}
function removeFrameCallback(fn: () => void) {
  frameCallbacks.delete(fn);
}

// active Lenis instance + a helper for programmatic smooth scrolling (used by
// the hero's "scroll to explore" progress button)
let _lenis: {
  scrollTo: (t: number | HTMLElement, o?: Record<string, unknown>) => void;
} | null = null;
export function smoothScrollTo(
  target: number | HTMLElement,
  opts: { duration?: number; offset?: number } = {},
) {
  if (_lenis) {
    _lenis.scrollTo(target, {
      duration: opts.duration ?? 1.3,
      offset: opts.offset ?? 0,
    });
  } else if (import.meta.client) {
    const y =
      typeof target === "number"
        ? target
        : target.getBoundingClientRect().top +
          window.scrollY +
          (opts.offset ?? 0);
    window.scrollTo({ top: y, behavior: "smooth" });
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  // Disable expensive scroll/ticker-driven motion when the user asks for reduced
  // motion OR the device is low-end. Reveal directives use `gsap.from()`, so an
  // early return leaves elements at their natural visible state — content is
  // never hidden, only the animation is skipped.
  const reduced = import.meta.client && shouldReduceMotion();

  if (import.meta.client) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /** Register a scroll-driven tween and remember it for teardown. */
  function tracked(
    el: HTMLElement,
    vars: gsap.TweenVars,
    fromTo: "from" | "to",
  ) {
    const tween = fromTo === "from" ? gsap.from(el, vars) : gsap.to(el, vars);
    onCleanup(el, () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    return tween;
  }

  // ── v-reveal ──────────────────────────────────────────────────────────────
  const reveal: Directive<HTMLElement, RevealOpts | undefined> = {
    mounted(el, binding) {
      if (reduced) return;
      if (binding.arg === "stagger") return mountStagger(el, binding.value);
      const o = binding.value ?? {};
      const rect = el.getBoundingClientRect();
      const isInitiallyVisible =
        rect.top < window.innerHeight * 0.92 &&
        rect.bottom > -window.innerHeight * 0.1;
      const tween = gsap.from(el, {
        opacity: 0,
        y: o.y ?? 30,
        scale: o.scale ?? 0.99,
        duration: o.duration ?? 1.7,
        ease: o.ease ?? "expo.inOut",
        delay: o.delay ?? 0,
        scrollTrigger: isInitiallyVisible
          ? undefined
          : { trigger: el, start: o.start ?? "top 85%", once: true },
      });
      onCleanup(el, () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    },
    unmounted: runCleanup,
  };

  function mountStagger(el: HTMLElement, value?: RevealOpts) {
    const o = value ?? {};
    const targets = o.selector
      ? el.querySelectorAll<HTMLElement>(o.selector)
      : (el.children as unknown as HTMLElement[]);
    const rect = el.getBoundingClientRect();
    const isInitiallyVisible =
      rect.top < window.innerHeight * 0.9 &&
      rect.bottom > -window.innerHeight * 0.1;
    const tween = gsap.from(targets, {
      opacity: 0,
      y: o.y ?? 34,
      scale: o.scale ?? 0.99,
      duration: o.duration ?? 1.5,
      ease: o.ease ?? "expo.inOut",
      stagger: o.stagger ?? 0.16,
      scrollTrigger: isInitiallyVisible
        ? undefined
        : { trigger: el, start: o.start ?? "top 80%", once: true },
    });
    onCleanup(el, () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
  }

  // ── v-parallax ────────────────────────────────────────────────────────────
  const parallax: Directive<HTMLElement, number | undefined> = {
    mounted(el, binding) {
      if (reduced) return;
      const speed = binding.value ?? 0.2;
      tracked(
        el,
        {
          yPercent: -speed * 100,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        },
        "to",
      );
    },
    unmounted: runCleanup,
  };

  // ── v-magnetic (retired) ────────────────────────────────────────────────────
  // The brutalist direction wants razor-sharp, mechanical buttons — no jelly,
  // no pull. Kept registered as a no-op so existing usages don't warn; the
  // button feel now lives entirely in the sharp .btn-gradient / .btn-line CSS.
  const magnetic: Directive<HTMLElement, number | undefined> = {};

  // ── v-tilt ────────────────────────────────────────────────────────────────
  const tilt: Directive<HTMLElement, { max?: number } | undefined> = {
    mounted(el, binding) {
      if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
      const max = binding.value?.max ?? 9;
      gsap.set(el, {
        transformPerspective: 900,
        transformStyle: "preserve-3d",
      });
      const rx = gsap.quickTo(el, "rotationX", {
        duration: 0.5,
        ease: "power2",
      });
      const ry = gsap.quickTo(el, "rotationY", {
        duration: 0.5,
        ease: "power2",
      });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        ry(px * max * 2);
        rx(-py * max * 2);
      };
      const enter = () => gsap.to(el, { scale: 1.03, duration: 0.4 });
      const leave = () => {
        rx(0);
        ry(0);
        gsap.to(el, { scale: 1, duration: 0.5 });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      onCleanup(el, () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointerleave", leave);
      });
    },
    unmounted: runCleanup,
  };

  // ── v-count ───────────────────────────────────────────────────────────────
  const count: Directive<
    HTMLElement,
    { duration?: number; immediate?: boolean } | undefined
  > = {
    mounted(el, binding) {
      if (reduced) return;
      const raw = (el.textContent ?? "").trim();
      const m = raw.match(/^(\D*?)([\d.,]+)(.*)$/s);
      if (!m) return;
      const [, prefix, numStr = "", suffix] = m;
      const hasComma = numStr.includes(",");
      const decimals = (numStr.split(".")[1] ?? "").length;
      const target = parseFloat(numStr.replace(/,/g, ""));
      const fmt = (n: number) => {
        let s = n.toFixed(decimals);
        if (hasComma) {
          const [int, dec] = s.split(".");
          s = Number(int).toLocaleString("en-US") + (dec ? "." + dec : "");
        }
        return prefix + s + suffix;
      };
      const obj = { v: 0 };
      el.textContent = fmt(0);
      // `immediate` plays on mount (above-the-fold stats); otherwise on scroll-in
      const immediate = binding.value?.immediate ?? false;
      const tween = gsap.to(obj, {
        v: target,
        duration: binding.value?.duration ?? 1.8,
        ease: "power2.out",
        delay: immediate ? 0.35 : 0,
        scrollTrigger: immediate
          ? undefined
          : { trigger: el, start: "top 90%", once: true },
        onUpdate: () => (el.textContent = fmt(obj.v)),
      });
      onCleanup(el, () => {
        tween.scrollTrigger?.kill();
        tween.kill();
        el.textContent = raw;
      });
    },
    unmounted: runCleanup,
  };

  // ── v-split (word + char rise-in) ───────────────────────────────────────────
  const split: Directive<HTMLElement, SplitOpts | undefined> = {
    mounted(el, binding) {
      if (reduced) return;
      const text = (el.textContent ?? "").trim();
      if (!text) return;
      el.setAttribute("aria-label", text);
      el.textContent = "";
      const chars: HTMLElement[] = [];
      text.split(/(\s+)/).forEach((token) => {
        if (/^\s+$/.test(token)) {
          el.appendChild(document.createTextNode(" "));
          return;
        }
        const word = document.createElement("span");
        word.setAttribute("aria-hidden", "true");
        word.style.display = "inline-block";
        word.style.whiteSpace = "nowrap";
        for (const ch of token) {
          const c = document.createElement("span");
          c.textContent = ch;
          c.style.display = "inline-block";
          word.appendChild(c);
          chars.push(c);
        }
        el.appendChild(word);
      });
      const o = binding.value ?? {};
      const rect = el.getBoundingClientRect();
      const isInitiallyVisible =
        rect.top < window.innerHeight * 0.92 &&
        rect.bottom > -window.innerHeight * 0.1;
      const tween = gsap.from(chars, {
        yPercent: 115,
        opacity: 0,
        rotateZ: 3,
        duration: 1.1,
        ease: "expo.inOut",
        stagger: o.stagger ?? 0.02,
        delay: o.delay ?? 0,
        // Promote chars to their own layer only for the duration of the rise-in,
        // then release so they don't hold compositor memory (issues.md #9).
        onStart: () =>
          chars.forEach((c) => (c.style.willChange = "transform, opacity")),
        onComplete: () => chars.forEach((c) => (c.style.willChange = "auto")),
        scrollTrigger:
          o.scroll === false || isInitiallyVisible
            ? undefined
            : { trigger: el, start: o.start ?? "top 88%", once: true },
      });
      onCleanup(el, () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    },
    unmounted: runCleanup,
  };

  // ── v-lines (masked line-by-line rise — text emerges from slits in the page) ─
  const lines: Directive<HTMLElement, SplitOpts | undefined> = {
    mounted(el, binding) {
      if (reduced) return;
      const text = (el.textContent ?? "").trim();
      if (!text) return;
      el.setAttribute("aria-label", text);
      el.textContent = "";

      // lay words out normally first so we can read the line breaks the
      // browser actually produced, then regroup them into masked rows
      const words: HTMLElement[] = [];
      text.split(/\s+/).forEach((token) => {
        const w = document.createElement("span");
        w.textContent = token;
        w.style.display = "inline-block";
        el.appendChild(w);
        el.appendChild(document.createTextNode(" "));
        words.push(w);
      });
      const rows = new Map<number, HTMLElement[]>();
      words.forEach((w) => {
        const top = w.offsetTop;
        rows.set(top, [...(rows.get(top) ?? []), w]);
      });

      el.textContent = "";
      const inners: HTMLElement[] = [];
      rows.forEach((rowWords) => {
        const mask = document.createElement("span");
        mask.setAttribute("aria-hidden", "true");
        mask.style.cssText = "display:block;overflow:hidden;";
        const inner = document.createElement("span");
        inner.style.display = "block";
        inner.textContent = rowWords.map((w) => w.textContent).join(" ");
        mask.appendChild(inner);
        el.appendChild(mask);
        inners.push(inner);
      });

      const o = binding.value ?? {};
      const rect = el.getBoundingClientRect();
      const isInitiallyVisible =
        rect.top < window.innerHeight * 0.92 &&
        rect.bottom > -window.innerHeight * 0.1;
      const tween = gsap.from(inners, {
        yPercent: 112,
        duration: 1.7,
        ease: "expo.inOut",
        stagger: o.stagger ?? 0.14,
        delay: o.delay ?? 0,
        scrollTrigger:
          o.scroll === false || isInitiallyVisible
            ? undefined
            : { trigger: el, start: o.start ?? "top 86%", once: true },
      });
      onCleanup(el, () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      });
    },
    unmounted: runCleanup,
  };

  // ── v-spotlight (cursor-tracking glow over cards) ───────────────────────────
  const spotlight: Directive<HTMLElement, string | undefined> = {
    mounted(el, binding) {
      if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
      const color = binding.value ?? "rgba(255,255,255,0.16)";
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:absolute;inset:0;border-radius:inherit;pointer-events:none;" +
        "opacity:0;transition:opacity .35s ease;mix-blend-mode:screen;z-index:3;";
      if (getComputedStyle(el).position === "static")
        el.style.position = "relative";
      el.appendChild(overlay);
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        overlay.style.background = `radial-gradient(220px circle at ${e.clientX - r.left}px ${e.clientY - r.top}px, ${color}, transparent 60%)`;
      };
      const enter = () => (overlay.style.opacity = "1");
      const leave = () => (overlay.style.opacity = "0");
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerenter", enter);
      el.addEventListener("pointerleave", leave);
      onCleanup(el, () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerenter", enter);
        el.removeEventListener("pointerleave", leave);
        overlay.remove();
      });
    },
    unmounted: runCleanup,
  };

  // ── v-skew (scroll-velocity shear — the "alive" awwwards feel) ───────────────
  const skew: Directive<HTMLElement, number | undefined> = {
    mounted(el, binding) {
      if (reduced) return;
      const factor = binding.value ?? 0.18;
      const skewTo = gsap.quickTo(el, "skewY", {
        duration: 0.5,
        ease: "power3",
      });
      const tick = () => {
        skewTo(gsap.utils.clamp(-6, 6, velocity.value * factor));
      };
      addFrameCallback(tick);
      onCleanup(el, () => {
        removeFrameCallback(tick);
        gsap.set(el, { skewY: 0 });
      });
    },
    unmounted: runCleanup,
  };

  // ── v-stack (parallax stacking between sections) ────────────────────────────
  // As a section scrolls up and out the top it recedes: drifts slower than the
  // scroll (parallax), scales toward 0.95 and dims — while the next section
  // (higher z-index, solid bg, soft top shadow) glides up over it.
  // expo.inOut shapes the recede so the weight builds like a soft luxury glide.
  //
  // One-way lock on POSITION: the recede transform is monotonic — it only ever
  // advances as you scroll DOWN and holds at the furthest point reached, so a
  // section that has receded stays put on scroll-up (until a full reload). The
  // DIM, however, tracks the live position so it lifts back as you scroll up.
  let stackZ = 2;
  const stackEase = gsap.parseEase("expo.inOut");
  const stack: Directive<
    HTMLElement,
    { bg?: string; parallax?: number; dim?: number } | undefined
  > = {
    mounted(el, binding) {
      if (reduced) return;
      const o = binding.value ?? {};
      const parallax = o.parallax ?? 70;
      const dim = o.dim ?? 0.3;
      el.style.position = "relative";
      el.style.zIndex = String(stackZ++);
      el.style.backgroundColor = o.bg ?? "#121110";
      el.style.transformOrigin = "50% 0%";
      el.style.willChange = "transform, filter";
      // whisper-soft top shadow → the incoming section just barely casts over
      el.style.boxShadow = "0 -40px 120px -60px rgba(0, 0, 0, 0.55)";

      let maxP = 0;
      const update = () => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        // 0 while the section's top is at/below the viewport top; ramps to 1 as
        // it scrolls up by ~75% of a viewport
        const p = gsap.utils.clamp(0, 1, -r.top / (vh * 0.75));
        // position locks at the furthest recede; dim tracks live so it reverses
        if (p > maxP) maxP = p;
        const eLock = stackEase(maxP);
        const eLive = stackEase(p);
        const ty = (eLock * parallax).toFixed(1);
        const scale = (1 - eLock * 0.05).toFixed(3);
        el.style.transform = `translate3d(0, ${ty}px, 0) scale(${scale})`;
        el.style.filter = `brightness(${(1 - eLive * dim).toFixed(3)})`;
      };
      addFrameCallback(update);
      update();
      onCleanup(el, () => {
        removeFrameCallback(update);
        for (const prop of [
          "transform",
          "filter",
          "boxShadow",
          "zIndex",
          "backgroundColor",
          "willChange",
          "transformOrigin",
          "position",
        ] as const) {
          el.style[prop] = "";
        }
      });
    },
    unmounted: runCleanup,
  };

  // ── v-bgmorph (smooth dark→light page-colour scrub) ─────────────────────────
  // Incredibly subtle mood shift: scrubs the page background between two close
  // charcoals as this section nears centre — you barely register the colour
  // change, you just feel the mood lift. expo.inOut shaping.
  //
  // One-way lock: the morph is monotonic — it advances toward `to` as you reach
  // the section and holds there; scrolling back up keeps the lifted tint rather
  // than reversing it, so the upward experience is static.
  const bgmorph: Directive<
    HTMLElement,
    { from?: string; to?: string } | undefined
  > = {
    mounted(el, binding) {
      if (reduced) return;
      const from = binding.value?.from ?? "#0e0d0c";
      const to = binding.value?.to ?? "#26231f";
      const lerp = gsap.utils.interpolate(from, to);
      let maxP = 0;
      const update = () => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - vh / 2) / (vh * 0.9);
        const p = stackEase(gsap.utils.clamp(0, 1, 1 - dist));
        // monotonic — hold the lifted tint once reached (static on scroll-up)
        if (p > maxP) maxP = p;
        document.body.style.backgroundColor = lerp(maxP);
      };
      addFrameCallback(update);
      update();
      onCleanup(el, () => {
        removeFrameCallback(update);
        document.body.style.backgroundColor = "";
      });
    },
    unmounted: runCleanup,
  };

  const app = nuxtApp.vueApp;
  app.directive("reveal", reveal);
  app.directive("stack", stack);
  app.directive("bgmorph", bgmorph);
  app.directive("parallax", parallax);
  app.directive("magnetic", magnetic);
  app.directive("tilt", tilt);
  app.directive("count", count);
  app.directive("split", split);
  app.directive("lines", lines);
  app.directive("spotlight", spotlight);
  app.directive("skew", skew);

  // Recompute trigger positions once the first page has settled (fonts, images,
  // Lenis) so above-the-fold animations measure correctly on initial load.
  if (import.meta.client) {
    nuxtApp.hook("app:mounted", () => {
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    window.addEventListener("load", () => ScrollTrigger.refresh(), {
      once: true,
    });

    // v-stack hands out an ever-incrementing z-index as sections mount. Reset
    // the counter on each navigation so it can't grow unbounded across SPA
    // route changes.
    nuxtApp.hook("page:start", () => {
      stackZ = 2;
    });
  }

  // ── Lenis smooth scroll (client, motion-safe) ───────────────────────────────
  if (import.meta.client && !reduced) {
    import("lenis").then(({ default: Lenis }) => {
      const lenis = new Lenis({
        duration: 1.05,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      lenis.on("scroll", (e: { velocity: number }) => {
        ScrollTrigger.update();
        velocity.value = e.velocity;
      });
      const lenisRaf = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);
      _lenis = lenis;

      // On hot-module reload the plugin re-runs; without this teardown the old
      // Lenis instance's ticker callback would accumulate on every update.
      if (import.meta.hot) {
        import.meta.hot.dispose(() => {
          gsap.ticker.remove(lenisRaf);
          (lenis as unknown as { destroy?: () => void }).destroy?.();
          _lenis = null;
        });
      }

      // scroll reset + trigger refresh on route change. Refresh again after the
      // page-enter transition settles so above-the-fold reveals measure correctly
      // and actually fire (otherwise the new page can render blank).
      nuxtApp.hook("page:finish", () => {
        lenis.scrollTo(0, { immediate: true });
        requestAnimationFrame(() => ScrollTrigger.refresh());
        setTimeout(() => ScrollTrigger.refresh(), 300);
        setTimeout(() => ScrollTrigger.refresh(), 750);
      });
    });
  }
});
