import { useFrame } from "@react-three/fiber";
import { type ReactNode, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  BRIDGE,
  buildHull,
  buildTransom,
  DECK_Y,
  extrudePlan,
  HARDTOP,
  HULL_PAINT,
  hullLine,
  insetPlan,
  MAIN_HOUSE,
  mainDeckShape,
  onHull,
  type Plan,
  planOutline,
  type Rake,
  ribbon,
  sheerLine,
  SKY_DECK,
  SKY_Y,
  STERN_X,
  UPPER_DECK,
  UPPER_Y,
} from "./hull";

// ---------- Materials ----------

const hullMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.16,
  metalness: 0.25,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  envMapIntensity: 1.6,
  side: THREE.DoubleSide,
});
const transomMat = new THREE.MeshPhysicalMaterial({ color: HULL_PAINT, roughness: 0.16, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide });
const whiteMat = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.1 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: "#16263a", roughness: 0.03, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 });
const railGlassMat = new THREE.MeshPhysicalMaterial({
  color: "#d4ecf7",
  roughness: 0.04,
  metalness: 0.1,
  transparent: true,
  opacity: 0.22,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const chromeMat = new THREE.MeshStandardMaterial({ color: "#eef1f5", metalness: 1, roughness: 0.14 });
export const brassMat = new THREE.MeshStandardMaterial({ color: "#d9ad55", metalness: 1, roughness: 0.24 });
const cushionMat = new THREE.MeshPhysicalMaterial({ color: "#f6f1e6", roughness: 0.9, sheen: 1, sheenColor: new THREE.Color("#ffffff") });
const pipingMat = new THREE.MeshStandardMaterial({ color: "#0c1a2e", roughness: 0.6 });
const poolMat = new THREE.MeshPhysicalMaterial({ color: "#3fd6ec", emissive: "#13a9c9", emissiveIntensity: 0.55, roughness: 0.05, clearcoat: 1 });
const underwaterMat = new THREE.MeshBasicMaterial({ color: "#7ff0ff", toneMapped: false });

// ---------- Textures ----------

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A deterministic pseudo-random sequence, so the planks look the same on every load. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Teak planks with black caulking, running bow to stern. One tile covers 2 x 2 units. */
let teakCache: THREE.CanvasTexture | null = null;
export function teakTexture(): THREE.CanvasTexture {
  if (teakCache) return teakCache;
  const rand = seeded(7);
  const size = 1024;
  const planks = 16;
  const ph = size / planks;
  teakCache = canvasTexture(size, size, (ctx) => {
    for (let p = 0; p < planks; p++) {
      const y = p * ph;
      let x = -rand() * 400;
      while (x < size) {
        const len = 380 + rand() * 420;
        const tone = 0.86 + rand() * 0.22;
        ctx.fillStyle = `rgb(${Math.round(176 * tone)}, ${Math.round(118 * tone)}, ${Math.round(68 * tone)})`;
        ctx.fillRect(x, y, len, ph);
        // Grain: faint lines along the plank.
        for (let g = 0; g < 7; g++) {
          ctx.strokeStyle = `rgba(${rand() < 0.5 ? "90,52,24" : "222,170,112"}, ${0.08 + rand() * 0.12})`;
          ctx.lineWidth = 0.8 + rand() * 1.4;
          const gy = y + 4 + rand() * (ph - 8);
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + len * 0.3, gy + (rand() - 0.5) * 6, x + len * 0.7, gy + (rand() - 0.5) * 6, x + len, gy);
          ctx.stroke();
        }
        // Butt joint at the plank's end.
        ctx.fillStyle = "#24170e";
        ctx.fillRect(x + len - 2, y, 3, ph);
        x += len;
      }
      // Caulking seam between planks.
      ctx.fillStyle = "#1e140c";
      ctx.fillRect(0, y + ph - 4, size, 4);
    }
  });
  teakCache.wrapS = teakCache.wrapT = THREE.RepeatWrapping;
  teakCache.repeat.set(0.5, 0.5);
  return teakCache;
}
const teakMat = new THREE.MeshPhysicalMaterial({ roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5 });

function goldGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#fff1c1");
  g.addColorStop(0.45, "#e2b65a");
  g.addColorStop(0.55, "#b8862f");
  g.addColorStop(1, "#f3d58a");
  return g;
}

/** The yacht's name in gilded serif capitals with six stars beneath. */
function nameTexture(): THREE.CanvasTexture {
  return canvasTexture(2048, 320, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 176px 'Didot', 'Bodoni 72', 'Playfair Display', Georgia, serif";
    ctx.letterSpacing = "38px";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = goldGradient(ctx, 40, 220);
    ctx.fillText("LUCIFER", 1024 + 19, 128);
    ctx.letterSpacing = "26px";
    ctx.font = "64px Georgia, serif";
    ctx.fillStyle = goldGradient(ctx, 240, 300);
    ctx.fillText("✦ ✦ ✦ ✦ ✦ ✦", 1024 + 13, 268);
  });
}

function transomTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 256, (ctx) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 104px 'Didot', 'Bodoni 72', Georgia, serif";
    ctx.letterSpacing = "22px";
    ctx.fillStyle = goldGradient(ctx, 40, 150);
    ctx.fillText("LUCIFER", 512 + 11, 96);
    ctx.font = "italic 40px Georgia, serif";
    ctx.letterSpacing = "10px";
    ctx.fillStyle = "#e2c27a";
    ctx.fillText("GEORGE TOWN", 512 + 5, 196);
  });
}

/** A run of elongated hull windows: dark glass with a sky reflection along the top. */
function hullWindowTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 96, (ctx) => {
    const g = ctx.createLinearGradient(0, 8, 0, 88);
    g.addColorStop(0, "#4b6a86");
    g.addColorStop(0.35, "#101c2a");
    g.addColorStop(1, "#04080e");
    ctx.fillStyle = "#c9a65a";
    ctx.beginPath();
    ctx.roundRect(2, 2, 508, 92, 46);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 80, 40);
    ctx.fill();
  });
}

function flagTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#0c1a2e";
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = "#e2b65a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "30px Georgia, serif";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText("✦", 128 + Math.cos(a) * 46, 80 + Math.sin(a) * 46);
    }
    ctx.font = "bold 40px Georgia, serif";
    ctx.fillText("L", 128, 82);
  });
}

// ---------- Pieces ----------

function tube(points: THREE.Vector3[], radius: number, closed = false): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), radius, 8, closed);
}

/** Glass panels with a stainless top rail, along a closed or open path at fixed height. */
function DeckRail({ path, height = 0.85, closed = true }: { path: THREE.Vector3[]; height?: number; closed?: boolean }) {
  const geo = useMemo(() => {
    const loop = closed ? [...path, path[0]!] : path;
    const top = loop.map((p) => p.clone().setY(p.y + height));
    return { glass: ribbon(loop, top), rail: tube(top, 0.035, false) };
  }, [path, height, closed]);
  return (
    <>
      <mesh geometry={geo.glass} material={railGlassMat} renderOrder={2} />
      <mesh geometry={geo.rail} material={chromeMat} />
    </>
  );
}

/** One deckhouse level: white walls, a wraparound band of dark glass, raked at the front. */
function Deckhouse({ plan, base, height, rake, windows }: { plan: Plan; base: number; height: number; rake: number; windows: [number, number] }) {
  const geo = useMemo(() => {
    const r: Rake = { pivot: plan.fwd - plan.nose - 1.2, fwd: plan.fwd, amount: rake, height };
    // Proud of the walls' bevel, so the glass reads as a continuous band.
    const glassPlan = { ...plan, half: plan.half + 0.1, aft: plan.aft - 0.1, fwd: plan.fwd + 0.1 };
    return {
      walls: extrudePlan(plan, height, { bevel: 0.08, rake: r }),
      glass: extrudePlan(glassPlan, windows[1] - windows[0], { bevel: 0.02, rake: r, y0: windows[0] }),
    };
  }, [plan, height, rake, windows]);
  return (
    <group position={[0, base, 0]}>
      <mesh geometry={geo.walls} material={whiteMat} castShadow receiveShadow />
      <mesh geometry={geo.glass} material={glassMat} position={[0, windows[0], 0]} castShadow />
    </group>
  );
}

/** A deck slab: white edge, teak on top, with its top surface at `top`. */
function DeckSlab({ plan, top, thickness = 0.26 }: { plan: Plan; top: number; thickness?: number }) {
  const geo = useMemo(
    () => ({ slab: extrudePlan(plan, thickness - 0.08, { bevel: 0.04 }), teak: extrudePlan(insetPlan(plan, 0.22), 0.03, { bevel: 0 }) }),
    [plan, thickness],
  );
  return (
    <group>
      <mesh geometry={geo.slab} material={whiteMat} position={[0, top - thickness + 0.04, 0]} castShadow receiveShadow />
      <mesh geometry={geo.teak} material={teakMat} position={[0, top - 0.02, 0]} receiveShadow />
    </group>
  );
}

/** A flat decal on the hull's outer skin, following its curve. */
function HullDecal({ x, y, width, height, map, side }: { x: number; y: number; width: number; height: number; map: THREE.Texture; side: 1 | -1 }) {
  const { position, rotationY } = onHull(x, y, side, 0.025);
  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={map} transparent metalness={0.4} roughness={0.25} />
    </mesh>
  );
}

function Flag() {
  const geo = useMemo(() => new THREE.PlaneGeometry(1.5, 0.95, 16, 6), []);
  const map = useMemo(flagTexture, []);
  const rest = useMemo(() => Float32Array.from(geo.attributes.position!.array), [geo]);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3]! + 0.75;
      pos.setZ(i, Math.sin(x * 4 - t * 5) * 0.09 * x);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <group position={[STERN_X - 0.35, DECK_Y + 0.2, 0]} rotation={[0, 0, 0.18]}>
      <mesh material={chromeMat} position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 2.6, 8]} />
      </mesh>
      <mesh material={brassMat} position={[0, 2.62, 0]}>
        <sphereGeometry args={[0.08, 12, 8]} />
      </mesh>
      <mesh geometry={geo} position={[-0.78, 2.1, 0]} rotation={[0, Math.PI, 0]}>
        <meshStandardMaterial map={map} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function SwimPlatform() {
  const teak = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-2.6, -4.6);
    s.lineTo(0.2, -4.6);
    s.lineTo(0.2, 4.6);
    s.lineTo(-2.6, 4.6);
    s.quadraticCurveTo(-3, 4.6, -3, 4.2);
    s.lineTo(-3, -4.2);
    s.quadraticCurveTo(-3, -4.6, -2.6, -4.6);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  return (
    <group position={[STERN_X, 0.42, 0]}>
      <mesh geometry={teak} material={teakMat} castShadow receiveShadow />
      {[1, -1].map((side) => (
        <group key={side} position={[-1.6, 0.22, side * 4.3]}>
          {/* Grab rails at the boarding steps */}
          <mesh material={chromeMat} position={[0, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.45, 0.03, 8, 20, Math.PI]} />
          </mesh>
        </group>
      ))}
      {/* Garage door in the transom */}
      <mesh position={[0.02, 1.25, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[5.2, 1.4]} />
        <meshPhysicalMaterial color="#13243d" roughness={0.2} clearcoat={1} />
      </mesh>
    </group>
  );
}

function BowLounge() {
  return (
    <group position={[0, DECK_Y, 0]}>
      {/* Jacuzzi: white shell, polished rim, glowing water */}
      <group position={[20.1, 0, 0]}>
        <mesh material={whiteMat} position={[0, 0.3, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.2, 1.3, 0.6, 40]} />
        </mesh>
        <mesh material={chromeMat} position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.15, 0.05, 10, 48]} />
        </mesh>
        <mesh material={poolMat} position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.1, 40]} />
        </mesh>
      </group>
      {/* A pair of sunpads facing the sea */}
      {[1, -1].map((side) => (
        <group key={side} position={[17.5, 0, side * 1.15]}>
          <mesh material={whiteMat} position={[0, 0.16, 0]} castShadow>
            <boxGeometry args={[1.9, 0.32, 1.05]} />
          </mesh>
          <mesh material={cushionMat} position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[1.85, 0.16, 1.0]} />
          </mesh>
          <mesh material={pipingMat} position={[0, 0.4, 0]}>
            <boxGeometry args={[1.87, 0.03, 1.02]} />
          </mesh>
          <mesh material={cushionMat} position={[-0.78, 0.55, 0]} rotation={[0, 0, -0.5]} castShadow>
            <boxGeometry args={[0.38, 0.14, 0.95]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Sky deck hardtop on raked struts, a swept-back mast with radar and satcom domes. */
function Hardtop() {
  const top = SKY_Y + 2.75;
  const geo = useMemo(() => {
    const fin = new THREE.Shape();
    // A slim fin swept aft, like a superyacht's mast.
    fin.moveTo(-0.5, 0);
    fin.lineTo(1.3, 0);
    fin.quadraticCurveTo(0.5, 0.5, -0.1, 1.35);
    fin.lineTo(-0.55, 1.35);
    fin.closePath();
    const mast = new THREE.ExtrudeGeometry(fin, { depth: 0.18, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    mast.translate(0, 0, -0.09);
    return { roof: extrudePlan(HARDTOP, 0.12, { bevel: 0.05 }), mast };
  }, []);
  return (
    <group>
      <mesh geometry={geo.roof} material={whiteMat} position={[0, top, 0]} castShadow />
      {/* Raked struts aft, slim posts forward */}
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh material={whiteMat} position={[0.15, SKY_Y + 1.38, side * 2.75]} rotation={[0, 0, -0.32]} castShadow>
            <boxGeometry args={[0.32, 2.9, 0.16]} />
          </mesh>
          <mesh material={chromeMat} position={[4.3, SKY_Y + 1.38, side * 2.3]}>
            <cylinderGeometry args={[0.045, 0.045, 2.75, 8]} />
          </mesh>
        </group>
      ))}
      <mesh geometry={geo.mast} material={whiteMat} position={[0.6, top + 0.15, 0]} castShadow />
      <Radar position={[0.25, top + 1.62, 0]} />
      <mesh material={brassMat} position={[-0.2, top + 1.82, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
      </mesh>
      {[1, -1].map((side) => (
        <group key={side} position={[1.4, top + 0.15, side * 1.6]}>
          <mesh material={whiteMat} position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.12, 0.17, 0.24, 12]} />
          </mesh>
          <mesh material={whiteMat} position={[0, 0.5, 0]} castShadow>
            <sphereGeometry args={[0.33, 24, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Radar({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.4;
  });
  return (
    <group ref={ref} position={position}>
      <mesh material={pipingMat}>
        <boxGeometry args={[1.5, 0.1, 0.14]} />
      </mesh>
    </group>
  );
}

/** The yacht bobbing on the waves; `children` (employees, desks) move with the hull. */
export function Yacht({ position, children }: { position: [number, number, number]; children?: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const geo = useMemo(() => {
    const deck = new THREE.ExtrudeGeometry(mainDeckShape(), { depth: 0.04, bevelEnabled: false });
    deck.rotateX(-Math.PI / 2);
    const sheerPort = sheerLine(-1, -0.01);
    const sheerStbd = sheerLine(1, -0.01);
    // The main deck rail rides on the bulwark: glass where the bulwark is low, a capping rail at the bow.
    const railPath = [...sheerLine(1, 0.07, STERN_X + 0.25), ...sheerLine(-1, 0.07, STERN_X + 0.25).reverse()];
    const railTop = railPath.map((p) => p.clone().setY(Math.max(p.y + 0.1, DECK_Y + 1.15)));
    return {
      hull: buildHull(),
      transom: buildTransom(),
      deck,
      sheerStripe: [tube(sheerStbd, 0.045), tube(sheerPort, 0.045)],
      bootStripe: [tube(hullLine(0.55, 1, 0.012), 0.05), tube(hullLine(0.55, -1, 0.012), 0.05)],
      railGlass: ribbon(railPath, railTop),
      railTop: tube(railTop, 0.035),
    };
  }, []);
  const textures = useMemo(() => ({ name: nameTexture(), transom: transomTexture(), windows: hullWindowTexture() }), []);
  teakMat.map = teakTexture();

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = position[1] + Math.sin(t * 0.8) * 0.1;
    g.rotation.z = Math.sin(t * 0.55) * 0.01;
    g.rotation.x = Math.sin(t * 0.7 + 1) * 0.008;
  });

  return (
    <group ref={group} position={position}>
      {/* Hull: deep navy lacquer, gold sheer and boot stripes, varnished cap rail */}
      <mesh geometry={geo.hull} material={hullMat} castShadow receiveShadow />
      <mesh geometry={geo.transom} material={transomMat} castShadow />
      {geo.sheerStripe.map((g, i) => (
        <mesh key={`s${i}`} geometry={g} material={brassMat} position={[0, -0.08, 0]} />
      ))}
      {geo.bootStripe.map((g, i) => (
        <mesh key={`b${i}`} geometry={g} material={brassMat} />
      ))}
      {[1, -1].map((side) => (
        <group key={side}>
          <HullDecal x={-14} y={2.15} width={8.4} height={1.3} map={textures.name} side={side as 1 | -1} />
          {[-4.2, -0.6, 3, 6.6].map((x) => (
            <HullDecal key={x} x={x} y={1.75} width={3.1} height={0.56} map={textures.windows} side={side as 1 | -1} />
          ))}
          {/* Underwater lights glowing through the shallows */}
          {[-20, -16.5, -13].map((x) => {
            const { position: p, rotationY } = onHull(x, -0.35, side as 1 | -1, 0.03);
            return (
              <mesh key={x} position={p} rotation={[0, rotationY, 0]} material={underwaterMat}>
                <circleGeometry args={[0.22, 16]} />
              </mesh>
            );
          })}
        </group>
      ))}
      <mesh position={[STERN_X - 0.03, 2.2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[5.6, 1.4]} />
        <meshStandardMaterial map={textures.transom} transparent metalness={0.4} roughness={0.25} />
      </mesh>

      {/* Main deck: teak, glass rail on the bulwark */}
      <mesh geometry={geo.deck} material={teakMat} position={[0, DECK_Y - 0.04, 0]} receiveShadow />
      <mesh geometry={geo.railGlass} material={railGlassMat} renderOrder={2} />
      <mesh geometry={geo.railTop} material={chromeMat} />
      <SwimPlatform />
      <Flag />
      <BowLounge />

      {/* Main deck saloon, its roof the upper deck */}
      <Deckhouse plan={MAIN_HOUSE} base={DECK_Y} height={UPPER_Y - DECK_Y - 0.22} rake={1.5} windows={[0.8, 1.8]} />
      <DeckSlab plan={UPPER_DECK} top={UPPER_Y + 0.03} />
      <DeckRail path={planOutline(insetPlan(UPPER_DECK, 0.12), UPPER_Y + 0.03)} />

      {/* Bridge, its roof the sky deck */}
      <Deckhouse plan={BRIDGE} base={UPPER_Y} height={SKY_Y - UPPER_Y - 0.22} rake={1.3} windows={[0.75, 1.7]} />
      <DeckSlab plan={SKY_DECK} top={SKY_Y + 0.03} />
      <DeckRail path={planOutline(insetPlan(SKY_DECK, 0.12), SKY_Y + 0.03)} height={0.8} />
      <Hardtop />

      {children}
    </group>
  );
}

// ---------- Work zones ----------

/** A woven rug in cream with a border in the department's color and a fine gold line. */
const rugCache = new Map<string, THREE.CanvasTexture>();
function rugTexture(color: string, w: number, d: number): THREE.CanvasTexture {
  const key = `${color}|${w}|${d}`;
  const cached = rugCache.get(key);
  if (cached) return cached;
  const W = 512;
  const H = Math.round((512 * d) / w);
  const tex = canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = "rgba(247, 241, 228, 0.94)";
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 28);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.roundRect(14, 14, W - 28, H - 28, 20);
    ctx.stroke();
    ctx.strokeStyle = "#c9a14e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(34, 34, W - 68, H - 68, 12);
    ctx.stroke();
    // A faint diamond weave.
    ctx.strokeStyle = "rgba(160, 130, 90, 0.08)";
    ctx.lineWidth = 2;
    for (let i = -H; i < W; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 40);
      ctx.lineTo(i + H, H - 40);
      ctx.moveTo(i + H, 40);
      ctx.lineTo(i, H - 40);
      ctx.stroke();
    }
  });
  rugCache.set(key, tex);
  return tex;
}

/** A navy plaque with the department's name in gold. */
const plaqueCache = new Map<string, THREE.CanvasTexture>();
function plaqueTexture(label: string, color: string): THREE.CanvasTexture {
  const key = `${label}|${color}`;
  const cached = plaqueCache.get(key);
  if (cached) return cached;
  const tex = canvasTexture(640, 128, (ctx) => {
    ctx.fillStyle = "#0c1a2e";
    ctx.beginPath();
    ctx.roundRect(4, 4, 632, 120, 22);
    ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, 4, 124);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(12, 12, 616, 104, 16);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(56, 64, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = goldGradient(ctx, 30, 100);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "600 50px 'Didot', 'Bodoni 72', Georgia, serif";
    ctx.letterSpacing = "6px";
    ctx.fillText(label.toUpperCase(), 340, 68, 520);
  });
  plaqueCache.set(key, tex);
  return tex;
}

/** A work zone's rug and its department plaque. */
export function ZoneMat({ center, size, color, label }: { center: [number, number, number]; size: [number, number]; color: string; label: string }) {
  const rug = useMemo(() => rugTexture(color, size[0], size[1]), [color, size]);
  const plaque = useMemo(() => plaqueTexture(label, color), [label, color]);
  return (
    <group position={center}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={size} />
        <meshStandardMaterial map={rug} transparent roughness={0.95} />
      </mesh>
      <group position={[-size[0] / 2 + 1.5, 0, size[1] / 2 + 0.05]}>
        <mesh material={brassMat} position={[0, 0.2, -0.04]}>
          <boxGeometry args={[0.05, 0.4, 0.05]} />
        </mesh>
        <mesh position={[0, 0.48, 0]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[2.5, 0.5]} />
          <meshStandardMaterial map={plaque} transparent metalness={0.3} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}
