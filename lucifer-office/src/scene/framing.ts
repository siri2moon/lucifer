import * as THREE from "three";

export const HOME_TARGET = new THREE.Vector3(3, 2, 11);
export const HOME_CAMERA = new THREE.Vector3(26, 20, 58);
/** The overview's viewing direction; close-ups keep it so the scene never feels rotated. */
const VIEW_DIR = HOME_CAMERA.clone().sub(HOME_TARGET).normalize();
const HOME_DISTANCE = HOME_CAMERA.distanceTo(HOME_TARGET);
/** Closest a group shot gets; a single angel is framed from about this far. */
const MIN_DISTANCE = 18;
/** The side panels cover part of the width, so frame as if the view were this much narrower. */
const VISIBLE_WIDTH = 0.6;
const PADDING = 1.5;
/** The mission dock and assign bar cover the bottom, so aim a little low to lift the group up the screen. */
const LIFT = 0.18;

/**
 * A camera pose that fits every point on screen, looking from the overview's direction.
 * Returns null for no points. Never zooms out past the overview.
 */
export function frame(points: THREE.Vector3[], fovDeg: number, aspect: number): { target: THREE.Vector3; camera: THREE.Vector3 } | null {
  if (points.length === 0) return null;
  const box = new THREE.Box3().setFromPoints(points);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(2.5, sphere.radius);
  const vfov = THREE.MathUtils.degToRad(fovDeg);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect * VISIBLE_WIDTH);
  const distance = THREE.MathUtils.clamp((radius * PADDING) / Math.sin(Math.min(vfov, hfov) / 2), MIN_DISTANCE, HOME_DISTANCE);
  const target = sphere.center.clone().add(new THREE.Vector3(0, 1 - distance * Math.tan(vfov / 2) * LIFT, 0));
  return { target, camera: target.clone().addScaledVector(VIEW_DIR, distance) };
}
