import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { type Outfit, type Pose, Person } from "./Person";

/** Character preview page (open `/?lineup`) for tuning the looks. */
const angel = (tint: string, hair: string, hairStyle: Outfit["hairStyle"], skin: string, seraph = false): Outfit => ({
  skin,
  hair,
  hairStyle,
  top: { style: "tunic", color: "#fbf6ec" },
  bottom: { style: "pants", color: "#f3ead8" },
  goldSandals: true,
  angel: { tint, seraph },
});

const CAST: { outfit: Outfit; pose: Pose }[] = [
  { pose: "stand", outfit: angel("#f59e0b", "#f0c869", "long", "#f6d7bf", true) },
  { pose: "stand", outfit: angel("#3b82f6", "#d8d8e2", "short", "#c68b62") },
  { pose: "sit", outfit: angel("#ec4899", "#1f1a17", "ponytail", "#e0ac83") },
  { pose: "wave", outfit: { skin: "#e0ac83", hair: "#d9b36c", hairStyle: "long", top: { style: "bikini", color: "#ff4d6d" }, bottom: { style: "bikini", color: "#ff4d6d" }, sunglasses: true } },
  { pose: "stand", outfit: { skin: "#f5d6bd", hair: "#6b4423", hairStyle: "bun", top: { style: "bikini", color: "#3a86ff" }, bottom: { style: "bikini", color: "#3a86ff" }, hat: "#f4e1b5" } },
];

export function Lineup() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#bfe3f5" }}>
      <Canvas shadows camera={{ position: [0, 1.5, 6.4], fov: 35 }} gl={{ toneMapping: THREE.ACESFilmicToneMapping }}>
        <color attach="background" args={["#bfe3f5"]} />
        <Environment resolution={128} environmentIntensity={0.45}>
          <Lightformer form="rect" intensity={2.2} color="#fff4e0" position={[6, 8, 6]} scale={[10, 6, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.2} color="#bfe6ff" position={[-8, 5, -4]} scale={[12, 5, 1]} target={[0, 0, 0]} />
        </Environment>
        <hemisphereLight args={["#dff3ff", "#f2d38b", 0.75]} />
        <directionalLight position={[5, 6, 5]} intensity={2.6} color="#fff1d6" castShadow />
        {CAST.map((c, i) => (
          <group key={i} position={[(i - (CAST.length - 1) / 2) * 1.5, 0, 0]}>
            {c.pose === "sit" && (
              <mesh position={[0, 0.3, -0.05]} scale={[0.25, 0.17, 0.2]} castShadow>
                <sphereGeometry args={[1, 24, 16]} />
                <meshStandardMaterial color="#ffffff" />
              </mesh>
            )}
            <Person outfit={c.outfit} pose={c.pose} phase={i * 1.7} />
          </group>
        ))}
        <ContactShadows position={[0, 0.001, 0]} opacity={0.4} blur={2.5} far={3} />
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#efd9a7" />
        </mesh>
        <OrbitControls target={[0, 0.9, 0]} />
      </Canvas>
    </div>
  );
}
