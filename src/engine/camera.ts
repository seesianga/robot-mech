import * as THREE from 'three';
import type { Mech } from '../sim/mech';
import type { MechVisual } from '../world/mechfactory';

const BASE_FOV = 68;
const ZOOM_FOV = 30;

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: 'cockpit' | 'chase' = 'cockpit';
  private shakeAmp = 0;
  private shakeT = 0;
  private zoomHeld = false;
  private zoomFrac = 0;
  private cockpitFrame: THREE.Group;
  private chasePos = new THREE.Vector3();
  private chaseFresh = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(68, aspect, 0.3, 4000);

    // minimal cockpit frame geometry attached to the camera
    this.cockpitFrame = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.9, metalness: 0.3 });
    const mkStrut = (w: number, h: number, x: number, y: number, rz: number) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), frameMat);
      s.position.set(x, y, -0.85);
      s.rotation.z = rz;
      this.cockpitFrame.add(s);
    };
    mkStrut(0.06, 1.4, -0.62, 0, 0.32);
    mkStrut(0.06, 1.4, 0.62, 0, -0.32);
    mkStrut(1.6, 0.05, 0, 0.52, 0);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 0.3), frameMat);
    dash.position.set(0, -0.52, -0.8);
    dash.rotation.x = 0.5;
    this.cockpitFrame.add(dash);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x53d7a8 });
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.01), lampMat.clone());
      lamp.position.set(-0.3 + i * 0.15, -0.42, -0.74);
      lamp.rotation.x = 0.5;
      lamp.name = `lamp${i}`;
      this.cockpitFrame.add(lamp);
    }
    this.camera.add(this.cockpitFrame);
  }

  /** Warning lamps that actually correspond to states. */
  setLamps(states: boolean[]): void {
    states.forEach((on, i) => {
      const lamp = this.cockpitFrame.getObjectByName(`lamp${i}`) as THREE.Mesh | undefined;
      if (lamp) (lamp.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff5533 : 0x53d7a8);
    });
  }

  addShake(amp: number): void {
    this.shakeAmp = Math.min(0.6, this.shakeAmp + amp);
  }

  /** Optics magnification — hold-to-zoom, eased in update(). */
  setZoom(held: boolean): void {
    this.zoomHeld = held;
  }

  toggleMode(): void {
    this.mode = this.mode === 'cockpit' ? 'chase' : 'cockpit';
    this.cockpitFrame.visible = this.mode === 'cockpit';
    if (this.mode === 'chase') this.chaseFresh = true;
  }

  update(dt: number, mech: Mech, visual: MechVisual, heightAt: (x: number, z: number) => number): void {
    this.shakeT += dt * 31;
    this.shakeAmp *= Math.pow(0.02, dt);

    // zoom ease (shake is damped at magnification so the view stays readable)
    const zoomTarget = this.zoomHeld ? 1 : 0;
    if (Math.abs(this.zoomFrac - zoomTarget) > 0.001) {
      this.zoomFrac += THREE.MathUtils.clamp(zoomTarget - this.zoomFrac, -dt * 6, dt * 6);
      this.camera.fov = THREE.MathUtils.lerp(BASE_FOV, ZOOM_FOV, this.zoomFrac);
      this.camera.updateProjectionMatrix();
    }
    this.shakeAmp *= 1 - this.zoomFrac * 0.6;
    const sx = Math.sin(this.shakeT * 1.13) * this.shakeAmp * 0.02;
    const sy = Math.cos(this.shakeT * 1.71) * this.shakeAmp * 0.02;

    if (this.mode === 'cockpit') {
      const headPos = new THREE.Vector3();
      visual.headNode.getWorldPosition(headPos);
      this.camera.position.copy(headPos);
      this.camera.position.y += visual.unit * 0.1;
      const yaw = mech.legYaw + mech.torsoYaw;
      this.camera.rotation.order = 'YXZ';
      // three cameras look down -Z; the mech faces +Z at yaw 0, hence the +PI
      this.camera.rotation.y = yaw + Math.PI + sx;
      this.camera.rotation.x = mech.torsoPitch + sy;
      this.camera.rotation.z = visual.root.rotation.z * 0.6;
    } else {
      const yaw = mech.legYaw + mech.torsoYaw;
      const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-visual.unit * 14);
      const want = mech.pos.clone().add(back);
      want.y = Math.max(mech.pos.y + visual.unit * 9, heightAt(want.x, want.z) + 4);
      if (this.chaseFresh) {
        this.chasePos.copy(want);
        this.chaseFresh = false;
      } else {
        this.chasePos.lerp(want, 1 - Math.pow(0.001, dt));
      }
      this.camera.position.copy(this.chasePos).add(new THREE.Vector3(sx * 8, sy * 8, 0));
      const lookAt = mech.pos.clone().add(new THREE.Vector3(0, visual.unit * 5, 0));
      this.camera.lookAt(lookAt);
    }
  }
}
