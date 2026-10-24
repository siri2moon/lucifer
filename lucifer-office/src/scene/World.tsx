import { Environment, Lightformer, OrbitControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useLocalize } from "../i18n";
import { useOffice } from "../state/office";
import { AgentAvatar } from "./AgentAvatar";
import { agentAnchors, LabelProjector } from "./labels";
import { Beach, Pergola } from "./Beach";
import { Beachgoers } from "./Beachgoers";
import { BreakTime } from "./BreakTime";
import { computeLayout, sandHeight, YACHT_POS } from "./layout";
import { Ocean } from "./Ocean";
import { Yacht, ZoneMat } from "./Yacht";

const SUN = new THREE.Vector3(70, 45, 55);
const HOME_TARGET = new THREE.Vector3(3, 2, 11);
const HOME_CAMERA = new THREE.Vector3(26, 20, 58);

export function World() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: HOME_CAMERA.toArray(), fov: 38, near: 0.5, far: 900 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => useOffice.getState().selectAgent(null)}
    >
      <color attach="background" args={["#9fd6f5"]} />
      <fog attach="fog" args={["#cfe9f7", 120, 420]} />
      <Sky distance={4500} sunPosition={SUN.toArray()} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      {/* Soft reflections for skin, hair and glossy swimwear; built locally, no HDR download. */}
      <Environment resolution={128} environmentIntensity={0.45}>
        <Lightformer form="rect" intensity={2.2} color="#fff4e0" position={[6, 8, 6]} scale={[10, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#bfe6ff" position={[-8, 5, -4]} scale={[12, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.8} color="#f2d38b" position={[0, -6, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
      </Environment>
      <hemisphereLight args={["#dff3ff", "#f2d38b", 0.75]} />
      <directionalLight
        position={SUN.toArray()}
        intensity={2.6}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={10}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
      />
      <Suspense fallback={null}>
        <Ocean sunDirection={SUN} />
        <Beach />
        <Office />
        <Beachgoers />
        <Seagulls />
        <Sailboat />
      </Suspense>
      <CameraRig />
      <LabelProjector />
    </Canvas>
  );
}

/** The yacht and its work zones, built from the company data. */
function Office() {
  const company = useOffice((s) => s.company);
  const localize = useLocalize();
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.agentOrder);
  const list = useMemo(() => order.map((id) => agents[id]!).filter(Boolean), [order, agents]);
  // The layout depends only on the org structure, not on work status.
  const structureKey = list.map((a) => `${a.id}:${a.departmentId}:${a.managerId}`).join("|");
  const layout = useMemo(
    () => computeLayout(company?.departments ?? [], list),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [company, structureKey],
  );

  const departments = company?.departments ?? [];
  const zonesInUse = departments
    .map((d) => ({ dept: d, zone: layout.zoneByDepartment[d.id] }))
    .filter((z): z is { dept: (typeof departments)[number]; zone: NonNullable<typeof z.zone> } => Boolean(z.zone));

  const onYacht = list.filter((a) => layout.seats[a.id]?.zone.onYacht);
  const onBeach = list.filter((a) => layout.seats[a.id] && !layout.seats[a.id]!.zone.onYacht);

  return (
    <>
      <Yacht position={YACHT_POS}>
        {zonesInUse
          .filter(({ zone }) => zone.onYacht)
          .map(({ dept, zone }) => (
            <ZoneMat key={dept.id} center={zone.center} size={zone.size} color={dept.color} label={localize(dept, "name")} />
          ))}
        {onYacht.map((a) => (
          <AgentAvatar key={a.id} agent={a} seat={layout.seats[a.id]!} />
        ))}
      </Yacht>
      {zonesInUse
        .filter(({ zone }) => !zone.onYacht)
        .map(({ dept, zone }) => (
          <Pergola key={dept.id} position={[zone.center[0], sandHeight(zone.center[0], zone.center[2]), zone.center[2]]} size={zone.size} label={localize(dept, "name")} />
        ))}
      {onBeach.map((a) => (
        <AgentAvatar key={a.id} agent={a} seat={layout.seats[a.id]!} />
      ))}
      <BreakTime agents={list.filter((a) => layout.seats[a.id])} />
    </>
  );
}

/** Fly the camera to the selected agent; back to the overview when deselected. */
function CameraRig() {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const selected = useOffice((s) => s.selectedAgentId);
  const { camera } = useThree();
  const flying = useRef(false);
  const goal = useMemo(() => ({ target: HOME_TARGET.clone(), camera: HOME_CAMERA.clone() }), []);
  const lastSelected = useRef<string | null>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      flying.current = true;
      const anchor = selected ? agentAnchors.get(selected) : undefined;
      if (anchor) {
        anchor.getWorldPosition(tmp);
        goal.target.copy(tmp).add(new THREE.Vector3(0, 1.2, 0));
        goal.camera.copy(tmp).add(new THREE.Vector3(7, 6, 11));
      } else {
        goal.target.copy(HOME_TARGET);
        goal.camera.copy(HOME_CAMERA);
      }
    }
    if (flying.current) {
      c.target.lerp(goal.target, 1 - Math.exp(-dt * 3));
      camera.position.lerp(goal.camera, 1 - Math.exp(-dt * 3));
      if (camera.position.distanceTo(goal.camera) < 0.05) flying.current = false;
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      target={HOME_TARGET.toArray()}
      enableDamping
      dampingFactor={0.08}
      minDistance={6}
      maxDistance={140}
      maxPolarAngle={Math.PI / 2.15}
      onStart={() => {
        flying.current = false;
      }}
    />
  );
}

function Seagulls() {
  const group = useRef<THREE.Group>(null);
  const birds = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ r: 18 + i * 4, h: 16 + (i % 3) * 3, speed: 0.12 + i * 0.015, phase: i * 1.7 })), []);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.children.forEach((bird, i) => {
      const b = birds[i]!;
      const a = t * b.speed + b.phase;
      bird.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 0.8 + i) * 1.2, 4 + Math.sin(a) * b.r * 0.6);
      bird.rotation.y = -a;
      const flap = Math.sin(t * 6 + i) * 0.5;
      bird.children[0]!.rotation.z = -0.25 - flap;
      bird.children[1]!.rotation.z = 0.25 + flap;
    });
  });
  return (
    <group ref={group}>
      {birds.map((_, i) => (
        <group key={i}>
          {/* Two wing joints first (children[0], [1]), then the body */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.45, 0, 0]}>
                <boxGeometry args={[0.9, 0.02, 0.22]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            </group>
          ))}
          <mesh>
            <boxGeometry args={[0.12, 0.1, 0.45]} />
            <meshStandardMaterial color="#f1f1f1" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Sailboat() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.set(-80 + ((t * 1.2) % 160), Math.sin(t) * 0.15, -70);
    g.rotation.z = Math.sin(t * 0.9) * 0.04;
  });
  return (
    <group ref={ref}>
      <mesh castShadow>
        <boxGeometry args={[5, 0.8, 1.6]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 5.6, 5]} />
        <meshStandardMaterial color="#d9d9d9" />
      </mesh>
      <mesh position={[0.9, 3.2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <shapeGeometry args={[sailShape()]} />
        <meshStandardMaterial color="#fff6e8" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function sailShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -2.4);
  s.lineTo(0, 2.6);
  s.lineTo(-2.2, -2.4);
  s.closePath();
  return s;
}
