<script setup lang="ts">
/**
 * Clean minimal sphere — a smooth, frosted "moon": soft cool gradient, one
 * gentle highlight, strong rim light. No noise, no displacement, nothing
 * organic. Calm + premium. Cursor tilts it slightly for a touch of life.
 * Normal `.vue` (renders an empty div on SSR; Three.js loaded via dynamic import).
 */
import type { ShaderMaterialParameters } from "three";

const host = ref<HTMLDivElement | null>(null);
let cleanup: (() => void) | null = null;
let disposed = false;

onBeforeUnmount(() => {
  disposed = true;
  cleanup?.();
});

onMounted(async () => {
  const el = host.value;
  if (!el) return;
  const THREE = await import("three");
  if (disposed || !host.value) return;

  const reduced = shouldReduceMotion();
  const tier = getDeviceTier();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5.4;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(cappedPixelRatio(2, tier));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, {
    width: "100%",
    height: "100%",
    display: "block",
  });

  const uniforms = {
    uLight: { value: new THREE.Vector3(-0.45, 0.7, 0.55).normalize() },
    uTop: { value: new THREE.Color("#e9e9e9") }, // bright highlight
    uBottom: { value: new THREE.Color("#1a1a1a") }, // deep neutral gray
    uRim: { value: new THREE.Color("#dadada") }, // bright silver rim
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    // 'derivatives' was dropped from three's extensions typings (WebGL2 always
    // has it); keep the runtime value as-is and just satisfy the type.
    extensions: {
      derivatives: true,
    } as unknown as ShaderMaterialParameters["extensions"],
    vertexShader: /* glsl */ `
      varying vec3 vViewPos;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uRim;
      varying vec3 vViewPos;

      // silver 'sky' each facet reflects
      vec3 envIcy(vec3 d){
        float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 deep = vec3(0.08);
        vec3 mid  = vec3(0.58);
        vec3 ice  = vec3(0.97);
        return mix(mix(deep, mid, t), ice, smoothstep(0.55, 1.0, t));
      }

      void main(){
        // flat per-facet normal from screen-space derivatives → faceted gem
        vec3 N = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
        vec3 V = normalize(-vViewPos);
        if (dot(N, V) < 0.0) N = -N;
        vec3 L = normalize(vec3(-0.4, 0.55, 0.85));

        float diff = clamp(dot(N, L), 0.0, 1.0);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);

        // each facet catches a different part of the icy sky → gem sparkle
        vec3 env = envIcy(reflect(-V, N));

        vec3 base = mix(uBottom, uTop, diff);
        vec3 col = mix(base, env, 0.5);
        col += pow(diff, 80.0) * vec3(1.0);   // sharp facet glint
        col += fres * uRim * 0.8;             // crystalline rim

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  // lower detail = larger, more dramatic facets (a cut crystal, not a ball)
  const geometry = new THREE.IcosahedronGeometry(1.5, 2);
  const orb = new THREE.Mesh(geometry, material);
  scene.add(orb);

  // soft atmospheric glow halo ringing the sphere (brighter on the lit side)
  const haloMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color("#c6c6c6") },
      uLight: uniforms.uLight,
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position * 1.16, 1.0);
        vV = -mv.xyz;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uLight;
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec3 N = normalize(vN);
        vec3 V = normalize(vV);
        float f = pow(1.0 - abs(dot(N, V)), 3.0);
        float lit = 0.45 + 0.55 * smoothstep(-0.2, 0.85, dot(N, normalize(uLight)));
        gl_FragColor = vec4(uColor, f * 0.55 * lit);
      }
    `,
  });
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, tier === "low" ? 24 : 48),
    haloMat,
  );
  scene.add(halo);

  // ── cursor influence (gentle tilt) ─────────────────────────────────────────
  const target = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    target.x = e.clientX / window.innerWidth - 0.5;
    target.y = e.clientY / window.innerHeight - 0.5;
  };
  window.addEventListener("pointermove", onMove, { passive: true });

  // ── render loop ────────────────────────────────────────────────────────────
  let raf = 0;
  let started = false;

  const render = () => {
    // slow continuous spin so facets catch the light + sparkle as it turns
    orb.rotation.y += 0.0026;
    orb.rotation.x = THREE.MathUtils.lerp(orb.rotation.x, target.y * 0.3, 0.05);
    orb.rotation.z = THREE.MathUtils.lerp(
      orb.rotation.z,
      -target.x * 0.25,
      0.05,
    );
    renderer.render(scene, camera);
  };
  const loop = () => {
    render();
    raf = requestAnimationFrame(loop);
  };
  const play = () => {
    if (started && !raf) loop();
  };
  const pause = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tryStart = () => {
    if (started || !el.clientWidth || !el.clientHeight) return;
    started = true;
    resize();
    if (reduced) render();
    else loop();
  };
  const ro = new ResizeObserver(() => {
    resize();
    tryStart();
  });
  ro.observe(el);
  requestAnimationFrame(tryStart);

  const io = new IntersectionObserver(
    ([entry]) => {
      if (reduced || !started || !entry) return;
      if (entry.isIntersecting) play();
      else pause();
    },
    { threshold: 0.01 },
  );
  io.observe(el);

  const onVisibility = () => (document.hidden ? pause() : play());
  document.addEventListener("visibilitychange", onVisibility);

  cleanup = () => {
    pause();
    io.disconnect();
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointermove", onMove);
    geometry.dispose();
    material.dispose();
    halo.geometry.dispose();
    (halo.material as { dispose(): void }).dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
});
</script>

<template>
  <div ref="host" class="h-full w-full" aria-hidden="true" />
</template>
