import * as THREE from 'three';
import { WorldManager } from '@/world/WorldManager';

export class CameraController {
  public yaw = 0;
  public pitch = -0.22;
  public targetDistance = 7.2;
  public currentDistance = 7.2;
  public firstPerson = false;
  public shakeIntensity = 0;

  public readonly aimOrigin = new THREE.Vector3();
  public readonly aimDirection = new THREE.Vector3();

  private tmpAnchor = new THREE.Vector3();
  private tmpForward = new THREE.Vector3();
  private tmpCamBack = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpShoulder = new THREE.Vector3();
  private tmpLookTarget = new THREE.Vector3();

  public rotate(deltaX: number, deltaY: number, sensitivity = 1.0, invertY = false): void {
    const sens = 0.0028 * sensitivity;
    this.yaw -= deltaX * sens;
    this.pitch += (invertY ? deltaY : -deltaY) * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.46, Math.PI * 0.44);
  }

  public zoom(delta: number): void {
    if (this.firstPerson) {
      if (delta > 0) this.firstPerson = false;
      return;
    }
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + delta * 0.65, 2.5, 16);
  }

  public toggleFirstPerson(): void {
    this.firstPerson = !this.firstPerson;
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(1.4, Math.max(this.shakeIntensity, amount));
  }

  public update(dt: number, camera: THREE.PerspectiveCamera, playerPos: THREE.Vector3, eyeHeight: number, world: WorldManager): void {
    const anchor = this.tmpAnchor.set(playerPos.x, playerPos.y + eyeHeight, playerPos.z);

    // Direction camera looks FROM camera toward anchor/forward
    const forward = this.tmpForward.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    this.aimDirection.copy(forward);

    if (this.firstPerson) {
      camera.position.copy(anchor);
      this.aimOrigin.copy(anchor);
    } else {
      const camBackDir = this.tmpCamBack.copy(forward).negate();
      // Slight right shoulder offset for clean aiming visibility!
      const right = this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const shoulderAnchor = this.tmpShoulder.copy(anchor).addScaledVector(right, 0.35);
      shoulderAnchor.y += 0.25;

      const ray = world.raycastBlock(shoulderAnchor, camBackDir, this.targetDistance + 0.4, false);
      const allowedDist = ray.hit ? Math.max(1.2, ray.distance - 0.35) : this.targetDistance;

      this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, allowedDist, Math.min(1, dt * 16));
      camera.position.copy(shoulderAnchor).addScaledVector(camBackDir, this.currentDistance);
      this.aimOrigin.copy(shoulderAnchor);
    }

    if (this.shakeIntensity > 0.002) {
      camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.8);
    }

    const lookTarget = this.tmpLookTarget.copy(anchor).addScaledVector(forward, this.firstPerson ? 12 : 10);
    camera.lookAt(lookTarget);
  }
}
