import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { frame, HOME_CAMERA, HOME_TARGET } from "./framing";

describe("frame", () => {
  const home = HOME_CAMERA.distanceTo(HOME_TARGET);

  it("moves in close on a small group and keeps the overview's direction", () => {
    const pose = frame([new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0)], 38, 16 / 9)!;
    const distance = pose.camera.distanceTo(pose.target);
    expect(distance).toBeLessThan(home * 0.6);
    const dir = pose.camera.clone().sub(pose.target).normalize();
    expect(dir.dot(HOME_CAMERA.clone().sub(HOME_TARGET).normalize())).toBeCloseTo(1);
    expect(pose.target.x).toBeCloseTo(2);
  });

  it("never zooms out past the overview and needs at least one point", () => {
    const pose = frame([new THREE.Vector3(-80, 0, 0), new THREE.Vector3(80, 0, 0)], 38, 16 / 9)!;
    expect(pose.camera.distanceTo(pose.target)).toBeCloseTo(home);
    expect(frame([], 38, 1)).toBeNull();
  });
});
