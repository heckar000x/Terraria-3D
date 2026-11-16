import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  gravity: number;
  size: number;
}

export interface FloatingNumber {
  text: string;
  x: number;
  y: number;
  z: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  crit: boolean;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  public floatingNumbers: FloatingNumber[] = [];
  private maxParticles = 600;
  private mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private colorObj = new THREE.Color();
  public densityScale = 1.0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  public spawnBurst(
    x: number,
    y: number,
    z: number,
    colorHex: string,
    count = 10,
    speed = 4.5,
    gravity = 16,
    life = 0.55,
    size = 1.0
  ): void {
    const scaledCount = Math.max(1, Math.round(count * this.densityScale));
    this.colorObj.set(colorHex);
    for (let i = 0; i < scaledCount; i++) {
      if (this.particles.length >= this.maxParticles) this.particles.shift();
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.85) * speed;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + (Math.random() - 0.5) * 0.4,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(ang) * spd,
        vy: (Math.random() * 0.9 + 0.2) * spd,
        vz: Math.sin(ang) * spd,
        r: this.colorObj.r,
        g: this.colorObj.g,
        b: this.colorObj.b,
        life,
        maxLife: life,
        gravity,
        size: size * (0.7 + Math.random() * 0.6),
      });
    }
  }

  public spawnFloatingNumber(x: number, y: number, z: number, text: string, color = '#ffffff', crit = false): void {
    this.floatingNumbers.push({
      text,
      x: x + (Math.random() - 0.5) * 0.4,
      y,
      z: z + (Math.random() - 0.5) * 0.4,
      vy: crit ? 2.8 : 2.1,
      color,
      life: crit ? 1.15 : 0.85,
      maxLife: crit ? 1.15 : 0.85,
      crit,
    });
    if (this.floatingNumbers.length > 40) this.floatingNumbers.shift();
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }

    const count = Math.min(this.maxParticles, this.particles.length);
    this.mesh.count = count;
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const p = this.particles[i];
        const s = p.size * (p.life / p.maxLife);
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.scale.set(s, s, s);
        this.dummy.rotation.set(p.life * 6, p.life * 4, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        this.colorObj.setRGB(p.r, p.g, p.b);
        this.mesh.setColorAt(i, this.colorObj);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    for (let i = this.floatingNumbers.length - 1; i >= 0; i--) {
      const f = this.floatingNumbers[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floatingNumbers.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
  }
}
