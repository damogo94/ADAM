'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Hero3D — escena "confluencia": tres anillos (A1 · A2 · A3) en orientaciones
 * distintas que rotan en torno a un núcleo común, con un halo de puntos tenue.
 * Es la tesis del producto hecha visual: tres lecturas convergiendo en una.
 *
 * Tintes índigo / violeta / teal que dialogan con la aurora del fondo; el
 * canvas es transparente (alpha) para que la aurora se vea a través. Materiales
 * `basic` con blending aditivo (glow barato, sin luces). dpr capado.
 *
 * Se carga vía dynamic(ssr:false) desde inicio-content → three/R3F solo se
 * descargan en /inicio.
 */

const HUES = ['#818cf8', '#c084fc', '#2dd4bf'] as const; // índigo · violeta · teal

function Ring({
  color,
  axis,
  speed,
  tilt,
}: {
  color: string;
  axis: 'x' | 'y' | 'z';
  speed: number;
  tilt: [number, number, number];
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation[axis] += delta * speed;
  });
  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[1.5, 0.012, 16, 140]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Core() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.scale.setScalar(0.42 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04);
    ref.current.rotation.y += 0.01;
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 0]} />
      <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.7} />
    </mesh>
  );
}

function Halo() {
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
    if (ref.current) ref.current.rotation.y -= delta * 0.05;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.02} sizeAttenuation transparent opacity={0.45} depthWrite={false} />
    </points>
  );
}

function Scene() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    // parallax suave hacia el puntero
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, state.pointer.y * 0.3, 0.04);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, state.pointer.x * 0.3, 0.04);
  });
  return (
    <group ref={group}>
      <Ring color={HUES[0]} axis="y" speed={0.35} tilt={[0, 0, 0]} />
      <Ring color={HUES[1]} axis="x" speed={0.3} tilt={[Math.PI / 2.4, 0, 0]} />
      <Ring color={HUES[2]} axis="z" speed={0.26} tilt={[0, Math.PI / 2.6, Math.PI / 3]} />
      <Core />
      <Halo />
    </group>
  );
}

export function Hero3D() {
  return (
    <Canvas
      style={{ touchAction: 'pan-y' }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 5.5], fov: 45 }}
    >
      <Scene />
    </Canvas>
  );
}
