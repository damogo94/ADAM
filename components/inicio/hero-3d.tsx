'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';

/**
 * Hero3D — escena "confluencia" re-tonada al re-skin de precisión.
 *
 * Anillos MONOCROMOS (ink, diferenciados por OPACIDAD y orientación, no por
 * hue) que orbitan un núcleo común con un halo de puntos. El `progress`
 * (MotionValue 0→1, scrub del scroll del hero-arc) lleva la escena de
 * DIFUSO/ruido → RESUELTO:
 *   - difuso (0): anillos tenues + giro inquieto, grupo expandido, halo disperso,
 *     núcleo apagado.
 *   - resuelto (1): anillos nítidos + giro calmo, grupo compacto, halo condensado,
 *     núcleo brillante con el acento de marca (la "señal" que emerge).
 *
 * Honestidad: es un motivo ABSTRACTO ruido→señal, NO un análisis fingido. Sin
 * `progress` → resolución plena (idle resuelto, p.ej. en reduced-motion no se monta).
 *
 * accent único #5B8AF0 reservado al núcleo resuelto; nada más compite con él
 * (firewall: nada de emerald/rose/amber aquí). Canvas transparente (alpha),
 * materiales `basic` + blending aditivo (glow barato). dynamic(ssr:false) →
 * three/R3F solo se descargan en /inicio.
 */

const INK = '#f5f5f7';
const ACCENT = '#5b8af0';

// 4 anillos: A1·A2·A3 + Estructura (el 4º, más tenue). Diferenciados por
// opacidad base y orientación — NO por color (tipográfica-no-cromática).
const RINGS: { axis: 'x' | 'y' | 'z'; speed: number; tilt: [number, number, number]; base: number }[] = [
  { axis: 'y', speed: 0.3, tilt: [0, 0, 0], base: 0.6 },
  { axis: 'x', speed: 0.26, tilt: [Math.PI / 2.4, 0, 0], base: 0.46 },
  { axis: 'z', speed: 0.22, tilt: [0, Math.PI / 2.6, Math.PI / 3], base: 0.34 },
  { axis: 'y', speed: 0.16, tilt: [Math.PI / 3.5, Math.PI / 4, 0], base: 0.22 },
];

/** Lee el progreso (0→1) defensivamente; sin MotionValue → 1 (resuelto). */
function read(progress: MotionValue<number> | undefined): number {
  if (!progress) return 1;
  const v = progress.get();
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

function Ring({
  index,
  progress,
}: {
  index: number;
  progress?: MotionValue<number>;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const cfg = RINGS[index]!;
  useFrame((_, delta) => {
    const m = ref.current;
    if (!m) return;
    const p = read(progress);
    // giro: más rápido/inquieto cuando difuso, calmo al resolverse
    m.rotation[cfg.axis] += delta * cfg.speed * (1 + (1 - p) * 1.8);
    const mat = m.material as THREE.MeshBasicMaterial;
    // opacidad: el anillo aparece al resolverse
    mat.opacity = cfg.base * (0.16 + 0.84 * p);
  });
  return (
    <mesh ref={ref} rotation={cfg.tilt}>
      <torusGeometry args={[1.5, 0.012, 16, 140]} />
      <meshBasicMaterial
        color={INK}
        transparent
        opacity={cfg.base}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Core({ progress }: { progress?: MotionValue<number> }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(INK), []);
  const accent = useMemo(() => new THREE.Color(ACCENT), []);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const p = read(progress);
    const pulse = 0.42 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04;
    m.scale.setScalar(pulse * (0.7 + 0.3 * p)); // crece al resolverse
    m.rotation.y += 0.01;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 + 0.55 * p; // brilla al resolverse
    // color: ink (difuso) → acento de marca (resuelto) = la señal que emerge
    mat.color.copy(color).lerp(accent, p);
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color={INK} wireframe transparent opacity={0.5} />
    </mesh>
  );
}

function Halo({ progress }: { progress?: MotionValue<number> }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const N = 500;
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const r = 2.5 + ((i * 17) % 9) * 0.06;
      arr[i * 3] = Math.cos(theta) * ring * r;
      arr[i * 3 + 1] = y * r;
      arr[i * 3 + 2] = Math.sin(theta) * ring * r;
    }
    return arr;
  }, []);
  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const p = read(progress);
    pts.rotation.y -= delta * 0.05;
    // disperso/ruidoso cuando difuso → condensado y tenue al resolverse
    pts.scale.setScalar(1.4 - 0.4 * p);
    const mat = pts.material as THREE.PointsMaterial;
    mat.opacity = 0.5 - 0.22 * p;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={INK} size={0.02} sizeAttenuation transparent opacity={0.45} depthWrite={false} />
    </points>
  );
}

function Scene({ progress }: { progress?: MotionValue<number> }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const p = read(progress);
    // parallax suave hacia el puntero
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, state.pointer.y * 0.3, 0.04);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.pointer.x * 0.3, 0.04);
    // grupo expandido (difuso) → compacto (resuelto)
    const s = 1.32 - 0.32 * p;
    g.scale.setScalar(s);
  });
  return (
    <group ref={group}>
      {RINGS.map((_, i) => (
        <Ring key={i} index={i} progress={progress} />
      ))}
      <Core progress={progress} />
      <Halo progress={progress} />
    </group>
  );
}

export function Hero3D({ progress }: { progress?: MotionValue<number> }) {
  return (
    <Canvas
      style={{ touchAction: 'pan-y' }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 5.5], fov: 45 }}
    >
      <Scene progress={progress} />
    </Canvas>
  );
}
