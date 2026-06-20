'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Hero3D — escena monocroma "anomalía": icosaedro wireframe + halo de puntos
 * (esfera de Fibonacci) rotando lento, con leve parallax hacia el puntero.
 *
 * Se carga SIEMPRE vía dynamic(ssr:false) desde inicio-content, así el bundle
 * de three/R3F queda code-split en /inicio y nunca toca el resto de rutas.
 *
 * Barato a propósito: materiales `basic` (sin luces), dpr capado, fondo
 * transparente (alpha) para que se vea el `void` (#000) del body. Coherente
 * con el brand B&W: identidad por forma, no por color.
 */

function Anomaly() {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * 0.16;
    g.rotation.z += delta * 0.04;
    // parallax suave hacia el puntero (state.pointer ∈ [-1, 1])
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, state.pointer.y * 0.25, 0.04);
    g.position.x = THREE.MathUtils.lerp(g.position.x, state.pointer.x * 0.3, 0.04);
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.7, 1]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.5} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.2, 0]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function Halo() {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const N = 700;
    const arr = new Float32Array(N * 3);
    const golden = Math.PI * (3 - Math.sqrt(5)); // ángulo áureo → distribución uniforme
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; // -1..1
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const r = 2.6 + ((i * 17) % 9) * 0.06; // grosor sutil de la cáscara
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
      <pointsMaterial
        color="#ffffff"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

export function Hero3D() {
  return (
    <Canvas
      // touchAction pan-y: permite hacer scroll vertical de la página aunque el
      // gesto empiece sobre el canvas (R3F lo pondría en 'none' por defecto).
      style={{ touchAction: 'pan-y' }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 6], fov: 45 }}
    >
      <Anomaly />
      <Halo />
    </Canvas>
  );
}
