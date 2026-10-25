import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useOffice } from "../state/office";
import { hash } from "./AgentAvatar";
import type { Seat, Zone } from "./layout";
import { type Outfit, Person } from "./Person";
import { brassMat } from "./Yacht";

/**
 * The yacht's interior crew: one stewardess per work zone on board. She waits at a coffee cart,
 * carries a tray to an angel's desk, serves, and walks back. Angels who are working get served first.
 */

const WALK_SPEED = 1.25;
const SERVE_MS = 2600;
const PREP_MS = 3500;

const CREW: Pick<Outfit, "skin" | "hair" | "hairStyle">[] = [
  { skin: "#f4d3b8", hair: "#1f1a17", hairStyle: "bun" },
  { skin: "#e9be98", hair: "#6b4423", hairStyle: "ponytail" },
  { skin: "#f6dcc6", hair: "#d9a94e", hairStyle: "bun" },
  { skin: "#c68b62", hair: "#1f1a17", hairStyle: "ponytail" },
];

/** Crew uniform: a white blouse, a navy pencil skirt and patent heels. */
function crewOutfit(i: number): Outfit {
  return {
    ...CREW[i % CREW.length]!,
    top: { style: "shirt", color: "#ffffff" },
    bottom: { style: "skirt", color: "#14213d" },
    curvy: true,
    legs: 1.1,
  };
}

interface Post {
  zone: Zone;
  /** Where the coffee cart stands, in the yacht's frame: just past the zone's end nearer midships. */
  cart: THREE.Vector3;
  /** Where she waits by the cart, and which way she faces there. */
  home: THREE.Vector3;
  homeFacing: number;
  /** z of the aisle in front of the desks. */
  aisle: number;
  seats: Seat[];
}

export function Stewards({ seats }: { seats: Seat[] }) {
  const posts = useMemo(() => {
    const byZone = new Map<string, Post>();
    for (const seat of seats) {
      const zone = seat.zone;
      if (!zone.onYacht) continue;
      let post = byZone.get(zone.id);
      if (!post) {
        const [cx, cy, cz] = zone.center;
        const [w, d] = zone.size;
        const aisle = cz + d / 2 - 0.35;
        const toward = cx > 0 ? -1 : 1;
        post = {
          zone,
          cart: new THREE.Vector3(cx + toward * (w / 2 + 0.5), cy, aisle - 0.3),
          home: new THREE.Vector3(cx + toward * (w / 2 - 0.15), cy, aisle),
          homeFacing: (toward * Math.PI) / 2,
          aisle,
          seats: [],
        };
        byZone.set(zone.id, post);
      }
      post.seats.push(seat);
    }
    return [...byZone.values()];
  }, [seats]);

  return (
    <>
      {posts.map((post, i) => (
        <Steward key={post.zone.id} post={post} index={i} />
      ))}
    </>
  );
}

function CoffeeCart({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[0.55, 0.06, 0.45]} />
        <meshPhysicalMaterial color="#4a2c1d" roughness={0.3} clearcoat={0.8} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[0.55, 0.05, 0.45]} />
        <meshPhysicalMaterial color="#4a2c1d" roughness={0.3} clearcoat={0.8} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} material={brassMat} position={[sx * 0.25, 0.45, sz * 0.2]}>
            <cylinderGeometry args={[0.018, 0.018, 0.9, 8]} />
          </mesh>
        )),
      )}
      {/* Espresso machine and cups */}
      <mesh material={brassMat} position={[-0.1, 1.03, 0]} castShadow>
        <boxGeometry args={[0.24, 0.24, 0.26]} />
      </mesh>
      {[0.12, 0.2].map((x) => (
        <mesh key={x} position={[x, 0.95, 0.08]}>
          <cylinderGeometry args={[0.04, 0.032, 0.08, 14]} />
          <meshPhysicalMaterial color="#fffaf0" roughness={0.25} clearcoat={0.8} />
        </mesh>
      ))}
    </group>
  );
}

type Phase = "prep" | "out" | "serve" | "back";

function Steward({ post, index }: { post: Post; index: number }) {
  const body = useRef<THREE.Group>(null);
  const outfit = useMemo(() => crewOutfit(index), [index]);
  const [pose, setPose] = useState<"stand" | "walk">("stand");
  const state = useRef({
    phase: "prep" as Phase,
    until: performance.now() + PREP_MS * (0.4 + index * 0.3),
    path: [] as THREE.Vector3[],
    facing: post.homeFacing,
    last: "",
  });
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const pickTarget = (): Seat | null => {
    const { agents, engine } = useOffice.getState();
    if (!engine?.running || post.seats.length === 0) return null;
    const s = state.current;
    const others = post.seats.length > 1 ? post.seats.filter((seat) => seat.agentId !== s.last) : post.seats;
    const busy = others.filter((seat) => {
      const status = agents[seat.agentId]?.status;
      return status === "working" || status === "thinking";
    });
    const pool = busy.length > 0 ? busy : others;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  };

  useFrame((_, dt) => {
    const g = body.current;
    if (!g) return;
    const s = state.current;
    const now = performance.now();
    const step = Math.min(dt, 0.1);

    if (s.phase === "prep" || s.phase === "serve") {
      if (now >= s.until) {
        if (s.phase === "serve") {
          // Back down the aisle to the cart.
          s.path = [new THREE.Vector3(g.position.x, g.position.y, post.aisle), post.home.clone()];
          s.phase = "back";
          setPose("walk");
        } else {
          const seat = pickTarget();
          if (!seat) {
            s.until = now + 1500;
          } else {
            s.last = seat.agentId;
            // Stand beside the desk, to the angel's right, facing them.
            const spot = new THREE.Vector3(seat.position[0] + 1.05, seat.position[1], seat.position[2] + 0.55);
            s.path = [new THREE.Vector3(g.position.x, g.position.y, post.aisle), new THREE.Vector3(spot.x, spot.y, post.aisle), spot];
            s.phase = "out";
            setPose("walk");
          }
        }
      }
    } else {
      const target = s.path[0];
      if (target) {
        tmp.copy(target).sub(g.position);
        tmp.y = 0;
        const dist = tmp.length();
        if (dist < 0.04) {
          g.position.x = target.x;
          g.position.z = target.z;
          s.path.shift();
        } else {
          g.position.addScaledVector(tmp.normalize(), Math.min(dist, WALK_SPEED * step));
          s.facing = Math.atan2(tmp.x, tmp.z);
        }
      }
      if (s.path.length === 0) {
        if (s.phase === "out") {
          s.phase = "serve";
          s.until = now + SERVE_MS;
          s.facing = -Math.PI / 2; // toward the angel at the desk
        } else {
          s.phase = "prep";
          s.until = now + PREP_MS;
          s.facing = post.homeFacing;
        }
        setPose("stand");
      }
    }

    // Turn smoothly toward the heading.
    const diff = Math.atan2(Math.sin(s.facing - g.rotation.y), Math.cos(s.facing - g.rotation.y));
    g.rotation.y += diff * Math.min(1, step * 8);
  });

  return (
    <>
      <CoffeeCart position={post.cart} />
      <group ref={body} position={post.home} rotation={[0, post.homeFacing, 0]}>
        <Person outfit={outfit} pose={pose} prop="tray" phase={hash(post.zone.id) % 50} energy={0.4} />
      </group>
    </>
  );
}
