import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { SHORE_Z } from "./layout";

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uShore;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  // One sine wave: returns its height and adds its derivative to grad.
  float wave(vec2 p, vec2 dir, float freq, float amp, float speed, inout vec2 grad) {
    float phase = dot(normalize(dir), p) * freq + uTime * speed;
    grad += normalize(dir) * freq * amp * cos(phase);
    return amp * sin(phase);
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 p = world.xz;
    vec2 grad = vec2(0.0);
    // Waves grow near the shore, then die out at the sand.
    float toShore = uShore - p.y;
    float shoal = mix(1.0, 1.6, smoothstep(40.0, 6.0, toShore)) * smoothstep(-1.0, 4.0, toShore);
    float h = 0.0;
    h += wave(p, vec2(0.15, 1.0), 0.16, 0.32 * shoal, -1.25, grad);
    h += wave(p, vec2(-0.35, 1.0), 0.27, 0.14 * shoal, -1.7, grad);
    h += wave(p, vec2(1.0, 0.25), 0.42, 0.06, 1.3, grad);
    h += wave(p, vec2(-0.8, -0.6), 0.75, 0.03, 2.1, grad);
    h += wave(p, vec2(0.5, 0.9), 1.3, 0.015, -2.8, grad);
    world.y += h;
    vWorld = world.xyz;
    vNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
    vCrest = h;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uShore;
  uniform vec3 uSunDir;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uFoam;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { return noise(p) * 0.6 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.1; }

  void main() {
    vec3 N = normalize(vNormal + vec3(noise(vWorld.xz * 2.0 + uTime) - 0.5, 0.0, noise(vWorld.zx * 2.0 - uTime) - 0.5) * 0.08);
    vec3 V = normalize(cameraPosition - vWorld);
    float toShore = uShore - vWorld.z;

    // Color by depth: turquoise in the shallows, deep blue offshore.
    float depth = smoothstep(0.0, 55.0, toShore);
    vec3 col = mix(uShallow, uDeep, depth);
    col = mix(col, uShallow * 1.15, smoothstep(0.35, 0.0, depth) * 0.35);

    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    col = mix(col, uSky, fresnel * 0.55);
    vec3 H = normalize(uSunDir + V);
    col += vec3(1.0, 0.92, 0.75) * pow(max(dot(N, H), 0.0), 220.0) * 2.2;
    col += vec3(1.0, 0.9, 0.7) * pow(max(dot(N, H), 0.0), 18.0) * 0.08;

    // Shore foam: the waterline rises and recedes rhythmically.
    float wash = sin(uTime * 0.55) * 1.4 + sin(uTime * 0.23 + vWorld.x * 0.05) * 0.6;
    float n = fbm(vWorld.xz * 1.2 + vec2(0.0, uTime * 0.4));
    float edge = toShore + wash;
    float foam = smoothstep(2.2, 0.2, edge + n * 1.2) * smoothstep(-1.5, 0.3, edge);
    // A band of foam riding each incoming wave.
    float band = sin(vWorld.z * 0.16 + uTime * 1.25) * 0.5 + 0.5;
    foam += smoothstep(0.82, 1.0, band) * smoothstep(14.0, 2.0, toShore) * smoothstep(0.35, 0.75, n) * 0.8;
    // Whitecaps on offshore crests.
    foam += smoothstep(0.32, 0.5, vCrest) * smoothstep(0.55, 0.8, n) * 0.6;
    col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

    float alpha = mix(0.72, 0.96, depth);
    alpha = max(alpha, clamp(foam, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function Ocean({ sunDirection }: { sunDirection: THREE.Vector3 }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uShore: { value: SHORE_Z },
          uSunDir: { value: sunDirection.clone().normalize() },
          uDeep: { value: new THREE.Color("#0b4f8a") },
          uShallow: { value: new THREE.Color("#2fd3c6") },
          uSky: { value: new THREE.Color("#bfe6ff") },
          uFoam: { value: new THREE.Color("#ffffff") },
        },
      }),
    [sunDirection],
  );

  useFrame(({ clock }) => {
    material.uniforms.uTime!.value = clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]} material={material} renderOrder={1}>
      {/* A dense mesh near the shore and the yacht for smooth waves; the far sea fades into fog. */}
      <planeGeometry args={[420, 200, 320, 200]} />
    </mesh>
  );
}
