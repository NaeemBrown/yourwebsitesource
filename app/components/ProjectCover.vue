<script setup lang="ts">
import type { Project } from "~~/shared/site";

const props = defineProps<{ project: Project }>();

const style = computed(() => ({
  backgroundImage: `linear-gradient(135deg, ${props.project.gradient[0]}, ${props.project.gradient[1]})`,
}));
</script>

<template>
  <div
    class="relative aspect-[16/10] w-full overflow-hidden rounded-xl"
    :style="style"
  >
    <!-- sheen -->
    <div class="cover-sheen absolute inset-0 opacity-60" />

    <!-- faux browser window -->
    <div
      class="absolute inset-x-5 bottom-0 top-7 rounded-t-lg bg-ink-900/85 backdrop-blur-sm ring-1 ring-white/10"
    >
      <div class="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span class="h-2 w-2 rounded-full bg-white/30" />
        <span class="h-2 w-2 rounded-full bg-white/20" />
        <span class="h-2 w-2 rounded-full bg-white/20" />
        <div class="ml-2 h-3 flex-1 rounded bg-white/5" />
      </div>
      <div class="space-y-2 p-3">
        <div class="flex items-center gap-2">
          <div
            class="h-7 w-7 rounded-md"
            :style="{ background: project.gradient[0] }"
          />
          <div class="h-2.5 w-20 rounded bg-white/15" />
          <div class="ml-auto h-2.5 w-10 rounded bg-white/10" />
        </div>
        <div class="h-2 w-3/4 rounded bg-white/10" />
        <div class="grid grid-cols-3 gap-2 pt-1">
          <div class="h-9 rounded-md bg-white/[0.07]" />
          <div class="h-9 rounded-md bg-white/[0.07]" />
          <div class="h-9 rounded-md bg-white/[0.07]" />
        </div>
      </div>
    </div>

    <!-- name watermark -->
    <span
      class="absolute left-4 top-2 text-xs font-semibold uppercase tracking-widest text-white/80"
    >
      {{ project.name }}
    </span>
  </div>
</template>

<style scoped>
/* In CSS (not an inline style attribute): prettier reflows long inline styles
   across lines, and the reformatted whitespace triggers SSR hydration
   style-mismatch warnings. */
.cover-sheen {
  background: radial-gradient(
    120% 80% at 20% 0%,
    rgba(255, 255, 255, 0.35),
    transparent 55%
  );
}
</style>
