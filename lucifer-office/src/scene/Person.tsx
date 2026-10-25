import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import { type AngelLook, goldMat, Halo, Stole, TunicBelt, TunicSkirt, Wings } from "./Angel";

export type Pose = "sit" | "stand" | "walk" | "lie" | "swim" | "wave" | "fly" | "sip";

export interface Outfit {
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun" | "ponytail";
  /** Top: "shirt" is a short-sleeved tee, "tunic" the angel's robe with a skirt, "bikini" a bandeau, null bare-chested. */
  top: { style: "shirt" | "tunic" | "bikini"; color: string } | null;
  bottom: { style: "pants" | "shorts" | "bikini" | "skirt"; color: string };
  /** A curvier torso under clothes (bikini tops always use it). */
  curvy?: boolean;
  /** Leg length relative to the default, for taller characters. */
  legs?: number;
  hat?: string;
  sunglasses?: boolean;
  /** Gold sandals instead of shoes. */
  goldSandals?: boolean;
  /** When set, the character is an angel: wings, halo and stole. */
  angel?: AngelLook;
}

interface Props {
  outfit: Outfit;
  pose: Pose;
  /** Motion intensity for the pose, e.g. typing speed while working. */
  energy?: number;
  /** Phase offset so people don't move in sync. */
  phase?: number;
  /** Item held in the right hand: a coffee cup, or a serving tray carried at chest height. */
  prop?: "cup" | "tray";
}

const THIGH = 0.44;
const SHIN = 0.44;
const UPPER_ARM = 0.3;
const FOREARM = 0.27;
const HIP_Y = 0.9;
const SIT_HIP_Y = 0.52;
const HEAD_Y = 0.77;
const HEAD_R = 0.17;
/** The body has an elliptical cross-section, flattened front to back. */
const BODY_DEPTH = 0.74;

// ---------- Geometry ----------

/** Build a smooth lathe surface from a few control points (x = radius, y = height). */
function lathe(points: [number, number][], segments = 28): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.LatheGeometry(curve.getPoints(36), segments);
  g.computeVertexNormals();
  return g;
}

/** Take a slice of the body profile and grow it slightly, for close-fitting clothes. */
function band(points: [number, number][], from: number, to: number, grow = 0.007): THREE.LatheGeometry {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const slice = curve
    .getPoints(80)
    .filter((p) => p.y >= from && p.y <= to)
    .map((p) => new THREE.Vector2(p.x > 0.001 ? p.x + grow : 0, p.y));
  const g = new THREE.LatheGeometry(slice, 28);
  g.computeVertexNormals();
  return g;
}

/** An open fabric tube (sleeve, shorts leg): rooted at the joint, running along -y, hem slightly tucked in. */
function tube(len: number, r0: number, r1: number): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(r0 * 0.9, 0.03),
    new THREE.Vector2(r0, -0.02),
    new THREE.Vector2(r1, -len),
    new THREE.Vector2(r1 * 1.02, -len - 0.008),
    new THREE.Vector2(r1 * 0.9, -len - 0.014),
  ];
  // Lathe profiles must run bottom to top so the normals face outward.
  const g = new THREE.LatheGeometry(pts.reverse(), 24);
  g.computeVertexNormals();
  return g;
}

/** A limb tapering down from the joint: rooted at the joint, running along -y. */
function limb(len: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(r0, len, 8, 18);
  g.translate(0, -len / 2, 0);
  const pos = g.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(-pos.getY(i) / len, 0, 1);
    const k = THREE.MathUtils.lerp(1, r1 / r0, t);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const PELVIS: [number, number][] = [
  [0, -0.17],
  [0.1, -0.155],
  [0.158, -0.1],
  [0.17, -0.03],
  [0.155, 0.03],
  [0.132, 0.08],
  [0, 0.09],
];
const TORSO_STRAIGHT: [number, number][] = [
  [0, 0.0],
  [0.152, 0.03],
  [0.15, 0.12],
  [0.163, 0.24],
  [0.188, 0.36],
  [0.198, 0.45],
  [0.168, 0.53],
  [0.075, 0.585],
  [0, 0.595],
];
const TORSO_CURVY: [number, number][] = [
  [0, 0.0],
  [0.155, 0.03],
  [0.128, 0.15],
  [0.15, 0.26],
  [0.178, 0.35],
  [0.176, 0.44],
  [0.15, 0.53],
  [0.07, 0.585],
  [0, 0.595],
];

const geo = {
  pelvis: lathe(PELVIS),
  torsoStraight: lathe(TORSO_STRAIGHT),
  torsoCurvy: lathe(TORSO_CURVY),
  bikiniTop: band(TORSO_CURVY, 0.3, 0.42, 0.008),
  bikiniBottom: band(PELVIS, -0.2, 0.0, 0.012),
  shirtHem: band(TORSO_STRAIGHT, 0.0, 0.1, 0.022),
  neck: new THREE.CylinderGeometry(0.052, 0.06, 0.14, 16),
  collar: new THREE.TorusGeometry(0.068, 0.018, 10, 24),
  head: new THREE.SphereGeometry(HEAD_R, 40, 28),
  ear: new THREE.SphereGeometry(0.035, 14, 10),
  nose: new THREE.SphereGeometry(0.02, 12, 8),
  eye: new THREE.SphereGeometry(0.024, 16, 12),
  sparkle: new THREE.SphereGeometry(0.0075, 8, 6),
  brow: new THREE.CapsuleGeometry(0.007, 0.04, 4, 8),
  blush: new THREE.CircleGeometry(0.03, 20),
  smile: new THREE.TorusGeometry(0.032, 0.0065, 8, 20, Math.PI),
  lens: new THREE.CylinderGeometry(0.043, 0.043, 0.012, 24),
  bridge: new THREE.CapsuleGeometry(0.006, 0.03, 4, 8),
  hairCap: new THREE.SphereGeometry(HEAD_R + 0.014, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56),
  hairFringe: new THREE.SphereGeometry(0.1, 24, 14),
  hairLong: new THREE.CapsuleGeometry(0.13, 0.24, 10, 24),
  hairTail: limb(0.24, 0.058, 0.022),
  bun: new THREE.SphereGeometry(0.075, 20, 14),
  hairTie: new THREE.TorusGeometry(0.045, 0.012, 8, 20),
  hat: lathe(
    [
      [0, 0.17],
      [0.11, 0.165],
      [0.15, 0.13],
      [0.16, 0.04],
      [0.2, 0.012],
      [0.33, -0.012],
      [0.34, -0.03],
      [0.0, -0.005],
    ],
    40,
  ),
  hatBand: new THREE.TorusGeometry(0.158, 0.014, 8, 32),
  thigh: limb(THIGH, 0.096, 0.07),
  shin: limb(SHIN, 0.07, 0.05),
  upperArm: limb(UPPER_ARM, 0.063, 0.05),
  forearm: limb(FOREARM, 0.05, 0.04),
  sleeve: tube(0.14, 0.074, 0.066),
  shortsLeg: tube(0.2, 0.104, 0.09),
  hand: new THREE.SphereGeometry(0.052, 16, 12),
  // A pencil skirt from the waist to the knee, flaring just enough to clear the legs.
  skirt: (() => {
    const g = new THREE.LatheGeometry(
      [
        [0.188, -0.42],
        [0.2, -0.3],
        [0.198, -0.15],
        [0.178, -0.02],
        [0.165, 0.06],
        [0.15, 0.1],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      32,
    );
    g.computeVertexNormals();
    return g;
  })(),
  tray: new THREE.CylinderGeometry(0.2, 0.19, 0.02, 32),
  shoe: new THREE.CapsuleGeometry(0.055, 0.13, 8, 16),
  cup: new THREE.CylinderGeometry(0.05, 0.04, 0.11, 20),
  coffee: new THREE.CircleGeometry(0.045, 20).rotateX(-Math.PI / 2),
};

// ---------- Materials ----------

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();
type Finish = "skin" | "fabric" | "gloss" | "hair" | "matte";
const FINISH: Record<Finish, THREE.MeshPhysicalMaterialParameters> = {
  // Skin with a slight red sheen at grazing angles, like soft vinyl.
  skin: { roughness: 0.5, sheen: 0.5, sheenRoughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.5 },
  fabric: { roughness: 0.85, sheen: 0.8, sheenRoughness: 0.8 },
  gloss: { roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  hair: { roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.35 },
  matte: { roughness: 0.9 },
};

function mat(color: string, finish: Finish): THREE.MeshPhysicalMaterial {
  const key = `${color}:${finish}`;
  let m = materialCache.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshPhysicalMaterial({ color: c, ...FINISH[finish] });
    if (finish === "skin") m.sheenColor = c.clone().lerp(new THREE.Color("#ff8a80"), 0.55);
    if (finish === "fabric") m.sheenColor = c.clone().lerp(new THREE.Color("#ffffff"), 0.4);
    materialCache.set(key, m);
  }
  return m;
}
const eyeMat = new THREE.MeshPhysicalMaterial({ color: "#1d1a24", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
const sparkleMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const smileMat = new THREE.MeshStandardMaterial({ color: "#7a3b3b", roughness: 0.6 });
const blushMat = new THREE.MeshBasicMaterial({ color: "#ff7b8a", transparent: true, opacity: 0.32, depthWrite: false });
const trayMat = new THREE.MeshStandardMaterial({ color: "#f2f4f7", metalness: 0.55, roughness: 0.3 });
const cupMat = new THREE.MeshPhysicalMaterial({ color: "#fffaf0", roughness: 0.25, clearcoat: 0.8 });
const coffeeMat = new THREE.MeshStandardMaterial({ color: "#6b3f22", roughness: 0.4 });
const lensMat = new THREE.MeshPhysicalMaterial({ color: "#14121c", roughness: 0.05, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 });

// ---------- Character ----------

export function Person({ outfit, pose, energy = 1, phase = 0, prop }: Props) {
  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const shoulderL = useRef<THREE.Group>(null);
  const shoulderR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);

  const look = useMemo(() => {
    const skin = mat(outfit.skin, "skin");
    const shirt = outfit.top?.style === "shirt" || outfit.top?.style === "tunic" ? mat(outfit.top.color, "fabric") : null;
    const swim = outfit.bottom.style === "bikini";
    const bottom = swim ? mat(outfit.bottom.color, "gloss") : mat(outfit.bottom.color, "fabric");
    return {
      skin,
      shirt,
      hair: mat(outfit.hair, "hair"),
      curvy: outfit.top?.style === "bikini" || Boolean(outfit.curvy),
      skirt: outfit.bottom.style === "skirt" ? bottom : null,
      bikiniTop: outfit.top?.style === "bikini" ? mat(outfit.top.color, "gloss") : null,
      bikiniBottom: swim ? bottom : null,
      pelvis: swim ? skin : bottom,
      thigh: outfit.bottom.style === "pants" ? bottom : skin,
      shortsLeg: outfit.bottom.style === "shorts" ? bottom : null,
      shin: outfit.bottom.style === "pants" ? bottom : skin,
      // Barefoot in swimwear, white sneakers with shorts, brown shoes with trousers.
      shoe: outfit.goldSandals
        ? goldMat
        : swim
          ? skin
          : mat(outfit.bottom.style === "shorts" ? "#f4f1ea" : outfit.bottom.style === "skirt" ? "#141a2c" : "#4a3a30", outfit.bottom.style === "skirt" ? "gloss" : "matte"),
      hat: outfit.hat ? mat(outfit.hat, "fabric") : null,
      hatBand: outfit.hat ? mat(outfit.top?.color ?? "#e85a9b", "gloss") : null,
      brow: mat(outfit.hair, "matte"),
    };
  }, [outfit]);
  const tunic = outfit.top?.style === "tunic";
  const legs = outfit.legs ?? 1;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const r = root.current;
    const h = hips.current;
    const tor = torso.current;
    const hd = head.current;
    if (!r || !h || !tor || !hd) return;
    const sL = shoulderL.current!, sR = shoulderR.current!, eL = elbowL.current!, eR = elbowR.current!;
    const hL = hipL.current!, hR = hipR.current!, kL = kneeL.current!, kR = kneeR.current!;

    // Default: standing upright, breathing gently.
    r.rotation.set(0, 0, 0);
    r.position.y = 0;
    h.position.y = HIP_Y * legs;
    tor.rotation.set(0, 0, 0);
    tor.scale.set(1, 1 + Math.sin(t * 1.6) * 0.012, 1);
    hd.rotation.set(0, Math.sin(t * 0.4) * 0.15, Math.sin(t * 0.33) * 0.04);
    sL.rotation.set(0, 0, 0.14);
    sR.rotation.set(0, 0, -0.14);
    eL.rotation.set(-0.15, 0, 0);
    eR.rotation.set(-0.15, 0, 0);
    hL.rotation.set(0, 0, 0);
    hR.rotation.set(0, 0, 0);
    kL.rotation.set(0, 0, 0);
    kR.rotation.set(0, 0, 0);

    // Blink every few seconds.
    if (eyes.current) eyes.current.scale.y = (t * 0.27) % 1 < 0.035 ? 0.12 : 1;

    switch (pose) {
      case "sit": {
        h.position.y = SIT_HIP_Y;
        hL.rotation.x = hR.rotation.x = -Math.PI / 2;
        kL.rotation.x = kR.rotation.x = Math.PI / 2;
        hL.rotation.z = -0.05;
        hR.rotation.z = 0.05;
        const type = Math.sin(t * 14 * energy) * 0.08 * energy;
        sL.rotation.set(-0.75 + type, 0, 0.18);
        sR.rotation.set(-0.75 - type, 0, -0.18);
        eL.rotation.x = eR.rotation.x = -0.75;
        tor.rotation.x = 0.08 + Math.sin(t * 1.3) * 0.02;
        hd.rotation.set(0.12 + Math.sin(t * 0.7) * 0.05 * energy, Math.sin(t * 0.5) * 0.2 * (1 - energy * 0.6), 0);
        break;
      }
      case "walk": {
        const s = Math.sin(t * 5);
        hL.rotation.x = s * 0.5;
        hR.rotation.x = -s * 0.5;
        kL.rotation.x = Math.max(0, -s) * 0.7;
        kR.rotation.x = Math.max(0, s) * 0.7;
        sL.rotation.x = -s * 0.45;
        sR.rotation.x = s * 0.45;
        tor.rotation.y = s * 0.08;
        r.position.y = Math.abs(Math.cos(t * 5)) * 0.04;
        break;
      }
      case "wave": {
        sR.rotation.set(0, 0, -2.6);
        eR.rotation.set(0, 0, Math.sin(t * 6) * 0.5);
        hd.rotation.z = -0.12;
        r.rotation.y = Math.sin(t * 0.8) * 0.1;
        break;
      }
      case "lie": {
        r.rotation.x = -Math.PI / 2;
        r.position.y = 0.15;
        sL.rotation.set(0, 0, 0.5);
        sR.rotation.set(0, 0, -0.5);
        hL.rotation.z = 0.06;
        kR.rotation.x = 0.6 + Math.sin(t * 0.5) * 0.1;
        hR.rotation.x = -0.4 - Math.sin(t * 0.5) * 0.05;
        hd.rotation.set(0, Math.sin(t * 0.25) * 0.25, 0);
        break;
      }
      case "swim": {
        r.rotation.x = Math.PI / 2.3;
        // Head above the water, body under the waves.
        r.position.y = -0.32 + Math.sin(t * 1.8) * 0.05;
        const stroke = t * 3;
        sL.rotation.set(-stroke, 0, 0.2);
        sR.rotation.set(-stroke - Math.PI, 0, -0.2);
        hL.rotation.x = Math.sin(t * 9) * 0.3;
        hR.rotation.x = -Math.sin(t * 9) * 0.3;
        hd.rotation.set(-0.5, Math.sin(t * 1.5) * 0.4, 0);
        break;
      }
      case "fly": {
        // Superhero flight: body leaning forward, arms reaching ahead, legs stretched back.
        r.rotation.x = 1.25 + Math.sin(t * 2) * 0.05;
        r.position.y = 0.55 + Math.sin(t * 2.4) * 0.06;
        sL.rotation.set(-2.75, 0, 0.22);
        sR.rotation.set(-2.75, 0, -0.22);
        eL.rotation.x = eR.rotation.x = -0.1;
        hL.rotation.x = 0.12 + Math.sin(t * 3) * 0.12;
        hR.rotation.x = 0.12 - Math.sin(t * 3) * 0.12;
        kL.rotation.x = 0.25;
        kR.rotation.x = 0.15;
        hd.rotation.set(-0.9, 0, 0);
        break;
      }
      case "sip": {
        // Raise the cup for a sip now and then.
        const sip = Math.max(0, Math.sin(t * 0.7)) ** 3;
        sR.rotation.set(-0.5 - sip * 0.9, 0, -0.25);
        eR.rotation.set(-1.3 - sip * 0.5, 0, 0);
        hd.rotation.set(-sip * 0.25, Math.sin(t * 0.4) * 0.2 * (1 - sip), 0);
        r.rotation.y = Math.sin(t * 0.25) * 0.15;
        break;
      }
      case "stand":
        r.rotation.y = Math.sin(t * 0.3) * 0.08;
        sL.rotation.z = 0.14 + Math.sin(t * 1.1) * 0.03;
        break;
    }

    // Carrying a tray: the right forearm level and forward, the tray flat on the palm, held steady.
    if (prop === "tray") {
      sR.rotation.set(-0.3, 0, -0.32);
      eR.rotation.set(-1.27, 0.25, 0);
      tor.rotation.y = 0;
    }
  });

  return (
    <group ref={root}>
      <group ref={hips} position={[0, HIP_Y, 0]}>
        <mesh geometry={geo.pelvis} material={look.pelvis} scale={[1, 1, BODY_DEPTH]} castShadow />
        {look.bikiniBottom && <mesh geometry={geo.bikiniBottom} material={look.bikiniBottom} scale={[1, 1, BODY_DEPTH]} castShadow />}
        {look.skirt && <mesh geometry={geo.skirt} material={look.skirt} scale={[1, 1, 0.86]} castShadow />}
        {tunic && look.shirt && (
          <>
            <TunicSkirt cloth={look.shirt} sitting={pose === "sit"} depth={BODY_DEPTH} />
            <TunicBelt depth={BODY_DEPTH} />
          </>
        )}

        <group ref={torso}>
          <mesh
            geometry={look.curvy ? geo.torsoCurvy : geo.torsoStraight}
            material={look.shirt ?? look.skin}
            scale={[1, 1, BODY_DEPTH]}
            castShadow
          />
          {look.shirt && !tunic && <mesh geometry={geo.shirtHem} material={look.shirt} scale={[1, 1, BODY_DEPTH]} />}
          {outfit.angel && tunic && <Stole color={outfit.angel.tint} torso={TORSO_STRAIGHT} depth={BODY_DEPTH} sitting={pose === "sit"} />}
          {outfit.angel && <Wings look={outfit.angel} pose={pose} energy={energy} phase={phase} />}
          {look.bikiniTop && <mesh geometry={geo.bikiniTop} material={look.bikiniTop} scale={[1, 1, BODY_DEPTH]} castShadow />}
          <mesh geometry={geo.neck} material={look.skin} position={[0, 0.62, 0]} castShadow />
          {look.shirt && <mesh geometry={geo.collar} material={tunic ? goldMat : look.shirt} position={[0, 0.575, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.85, 1]} />}

          <group ref={head} position={[0, HEAD_Y, 0]}>
            <Head outfit={outfit} look={look} eyes={eyes} />
            {outfit.angel && <Halo seraph={outfit.angel.seraph} energy={energy} phase={phase} />}
          </group>

          <Arm side={-1} shoulder={shoulderL} elbow={elbowL} skin={look.skin} sleeve={look.shirt} />
          <Arm side={1} shoulder={shoulderR} elbow={elbowR} skin={look.skin} sleeve={look.shirt} prop={prop} />
        </group>

        <Leg side={-1} hip={hipL} knee={kneeL} look={look} length={legs} />
        <Leg side={1} hip={hipR} knee={kneeR} look={look} length={legs} />
      </group>
    </group>
  );
}

type Look = {
  skin: THREE.Material;
  hair: THREE.Material;
  brow: THREE.Material;
  hat: THREE.Material | null;
  hatBand: THREE.Material | null;
  thigh: THREE.Material;
  shortsLeg: THREE.Material | null;
  shin: THREE.Material;
  shoe: THREE.Material;
};

/** A point on the head sphere in direction (x, y), seen from the front. */
function onFace(x: number, y: number, lift = 0): [number, number, number] {
  const r = HEAD_R + lift;
  return [x, y, Math.sqrt(Math.max(0, r * r - x * x - y * y)) * 0.96];
}

function Head({ outfit, look, eyes }: { outfit: Outfit; look: Look; eyes: RefObject<THREE.Group | null> }) {
  return (
    <>
      <mesh geometry={geo.head} material={look.skin} scale={[1, 1.02, 0.96]} castShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.ear} material={look.skin} position={[s * 0.163, -0.01, -0.005]} scale={[0.55, 1, 0.8]} />
      ))}
      <mesh geometry={geo.nose} material={look.skin} position={onFace(0, -0.025, 0.004)} scale={[1, 0.8, 0.9]} />

      {/* Eyes, brows, blush, smile */}
      {outfit.sunglasses ? (
        <group position={[0, 0.012, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} geometry={geo.lens} material={lensMat} position={onFace(s * 0.06, 0, 0.012)} rotation={[Math.PI / 2, s * 0.35, 0]} />
          ))}
          <mesh geometry={geo.bridge} material={lensMat} position={onFace(0, 0.008, 0.016)} rotation={[0, 0, Math.PI / 2]} />
        </group>
      ) : (
        <group ref={eyes} position={[0, 0.01, 0]}>
          {[-1, 1].map((s) => (
            <group key={s} position={onFace(s * 0.06, 0, -0.008)} rotation={[0, s * 0.35, 0]}>
              <mesh geometry={geo.eye} material={eyeMat} scale={[0.82, 1.18, 0.5]} />
              <mesh geometry={geo.sparkle} material={sparkleMat} position={[0.007, 0.01, 0.011]} />
            </group>
          ))}
        </group>
      )}
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={geo.brow}
          material={look.brow}
          position={onFace(s * 0.062, 0.062, 0.002)}
          rotation={[0, s * 0.35, Math.PI / 2 + s * 0.12]}
        />
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={geo.blush} material={blushMat} position={onFace(s * 0.095, -0.04, 0.003)} rotation={[0, s * 0.62, 0]} scale={[1, 0.65, 1]} />
      ))}
      <mesh geometry={geo.smile} material={smileMat} position={onFace(0, -0.06, -0.004)} rotation={[0.25, 0, Math.PI]} />

      <Hair style={outfit.hairStyle} material={look.hair} />
      {look.hat && (
        <group position={[0, 0.115, -0.01]} rotation={[-0.12, 0, 0]}>
          <mesh geometry={geo.hat} material={look.hat} castShadow />
          {look.hatBand && <mesh geometry={geo.hatBand} material={look.hatBand} position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} />}
        </group>
      )}
    </>
  );
}

function Hair({ style, material }: { style: Outfit["hairStyle"]; material: THREE.Material }) {
  return (
    <>
      <mesh geometry={geo.hairCap} material={material} position={[0, 0.012, -0.012]} rotation={[-0.32, 0, 0]} scale={[1.02, 1, 1]} castShadow />
      {/* Side-swept fringe over the forehead */}
      <mesh geometry={geo.hairFringe} material={material} position={[0.035, 0.105, 0.085]} rotation={[0.5, 0, -0.35]} scale={[1.25, 0.42, 0.75]} />
      {style === "long" && (
        <mesh geometry={geo.hairLong} material={material} position={[0, -0.13, -0.075]} scale={[1.28, 1, 0.62]} castShadow />
      )}
      {style === "ponytail" && (
        <group position={[0, 0.05, -0.165]} rotation={[0.45, 0, 0]}>
          <mesh geometry={geo.hairTie} material={material} rotation={[Math.PI / 2, 0, 0]} scale={0.8} />
          <mesh geometry={geo.hairTail} material={material} castShadow />
        </group>
      )}
      {style === "bun" && (
        <group position={[0, 0.135, -0.1]}>
          <mesh geometry={geo.bun} material={material} castShadow />
          <mesh geometry={geo.hairTie} material={material} position={[0, -0.05, 0.02]} rotation={[Math.PI / 2 - 0.5, 0, 0]} scale={0.9} />
        </group>
      )}
    </>
  );
}

function Arm({
  side,
  shoulder,
  elbow,
  skin,
  sleeve,
  prop,
}: {
  prop?: Props["prop"];
  side: -1 | 1;
  shoulder: RefObject<THREE.Group | null>;
  elbow: RefObject<THREE.Group | null>;
  skin: THREE.Material;
  sleeve: THREE.Material | null;
}) {
  return (
    <group ref={shoulder} position={[side * 0.225, 0.51, 0]}>
      <mesh geometry={geo.upperArm} material={skin} castShadow />
      {sleeve && <mesh geometry={geo.sleeve} material={sleeve} position={[0, 0.02, 0]} castShadow />}
      <group ref={elbow} position={[0, -UPPER_ARM - 0.01, 0]}>
        <mesh geometry={geo.forearm} material={skin} castShadow />
        <mesh geometry={geo.hand} material={skin} position={[0, -FOREARM - 0.035, 0.005]} scale={[0.8, 1.05, 0.62]} castShadow />
        {prop === "tray" && (
          // With the forearm level, the hand's +z points up: the tray lies flat on the palm.
          <group position={[0, -FOREARM - 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={geo.tray} material={trayMat} castShadow />
            {[-0.08, 0.08].map((x) => (
              <group key={x} position={[x, 0.065, x * 0.4]}>
                <mesh geometry={geo.cup} material={cupMat} castShadow />
                <mesh geometry={geo.coffee} material={coffeeMat} position={[0, 0.052, 0]} />
              </group>
            ))}
          </group>
        )}
        {prop === "cup" && (
          <group position={[0, -FOREARM - 0.05, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={geo.cup} material={cupMat} castShadow />
            <mesh geometry={geo.coffee} material={coffeeMat} position={[0, 0.052, 0]} />
          </group>
        )}
      </group>
    </group>
  );
}

function Leg({
  side,
  hip,
  knee,
  look,
  length = 1,
}: {
  side: -1 | 1;
  hip: RefObject<THREE.Group | null>;
  knee: RefObject<THREE.Group | null>;
  look: Look;
  length?: number;
}) {
  return (
    <group ref={hip} position={[side * 0.088, -0.06, 0]} scale={[1, length, 1]}>
      <mesh geometry={geo.thigh} material={look.thigh} castShadow />
      {look.shortsLeg && <mesh geometry={geo.shortsLeg} material={look.shortsLeg} position={[0, 0.03, 0]} castShadow />}
      <group ref={knee} position={[0, -THIGH - 0.01, 0]}>
        <mesh geometry={geo.shin} material={look.shin} castShadow />
        <mesh geometry={geo.shoe} material={look.shoe} position={[0, -SHIN - 0.05, 0.055]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.72]} castShadow />
      </group>
    </group>
  );
}
