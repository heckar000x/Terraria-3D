import * as THREE from 'three';
import { getBlockDef, isLiquidBlock, isSolidBlock } from '@/data/blocks';
import { getItemDef } from '@/data/items';
import { BlockId, CharacterSave, WORLD_HEIGHT } from '@/types/game';
import { ComputedPlayerStats } from '@/systems/InventorySystem';
import { WorldManager } from '@/world/WorldManager';

export interface PlayerInputState {
  forward: number; // -1..1
  strafe: number; // -1..1
  jumpHeld: boolean;
  jumpPressed: boolean;
  crouchHeld: boolean;
  dashPressed: boolean;
  grapplePressed: boolean;
  mountTogglePressed: boolean;
  yaw: number;
  pitch: number;
}

export class PlayerController {
  public position = new THREE.Vector3(0, 145, 0);
  public velocity = new THREE.Vector3(0, 0, 0);
  public readonly halfWidth = 0.36;
  public readonly height = 1.82;
  public readonly eyeHeight = 1.56;

  public grounded = false;
  public inWater = false;
  public inLava = false;
  public inHoney = false;
  public breath = 100; // 0..100
  public maxBreath = 100;
  public wingFuel = 0;
  public canDoubleJump = false;
  public dashTimer = 0;
  public dashCooldown = 0;
  public invulnTimer = 0;
  public activeMount: string | null = null;
  public hookAnchor: THREE.Vector3 | null = null;
  public fallStartY: number | null = null;
  public facingYaw = 0;

  public onTakeDamage?: (amount: number, source: string, knockDir?: THREE.Vector3) => void;
  public onSplash?: () => void;

  public update(
    dt: number,
    world: WorldManager,
    char: CharacterSave,
    stats: ComputedPlayerStats,
    input: PlayerInputState,
    autoJump: boolean,
    godmode = false
  ): void {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - clampedDt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - clampedDt);
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - clampedDt);

    // Mount Toggle
    if (input.mountTogglePressed) {
      const mountItem = char.equipment.mount ?? char.inventory.find((s) => s && getItemDef(s.itemId)?.mountId);
      if (this.activeMount) {
        this.activeMount = null;
      } else if (mountItem) {
        this.activeMount = getItemDef(mountItem.itemId)?.mountId ?? null;
      }
    }

    // Check liquid & hazard blocks around body
    const feetBlock = world.getBlock(this.position.x, this.position.y + 0.15, this.position.z);
    const bodyBlock = world.getBlock(this.position.x, this.position.y + 0.9, this.position.z);
    const headBlock = world.getBlock(this.position.x, this.position.y + this.eyeHeight, this.position.z);

    const wasInWater = this.inWater;
    this.inWater = feetBlock === BlockId.Water || bodyBlock === BlockId.Water || headBlock === BlockId.Water;
    this.inLava = feetBlock === BlockId.Lava || bodyBlock === BlockId.Lava || headBlock === BlockId.Lava;
    this.inHoney = feetBlock === BlockId.Honey || bodyBlock === BlockId.Honey || headBlock === BlockId.Honey;

    if (!wasInWater && this.inWater) this.onSplash?.();

    // Breath & drowning
    if (headBlock === BlockId.Water || headBlock === BlockId.Honey) {
      this.breath = Math.max(0, this.breath - clampedDt * 9);
      if (this.breath <= 0 && !godmode && this.invulnTimer <= 0) {
        this.onTakeDamage?.(15, 'Drowning');
        this.invulnTimer = 0.6;
      }
    } else {
      this.breath = Math.min(this.maxBreath, this.breath + clampedDt * 45);
    }

    // Lava & Spike damage
    if (!godmode && this.invulnTimer <= 0) {
      if (this.inLava && !stats.fireBlockImmune && !stats.lavaWalk) {
        this.onTakeDamage?.(45, 'Lava');
        this.invulnTimer = 0.5;
      } else {
        const bDef = getBlockDef(feetBlock);
        const underDef = getBlockDef(world.getBlock(this.position.x, this.position.y - 0.1, this.position.z));
        const touchDmg = bDef.damageOnTouch ?? underDef.damageOnTouch ?? 0;
        if (touchDmg > 0 && !(stats.fireBlockImmune && (feetBlock === BlockId.Hellstone || feetBlock === BlockId.Meteorite))) {
          this.onTakeDamage?.(touchDmg, bDef.name || 'Trap');
          this.invulnTimer = 0.5;
        }
      }
    }

    // Grappling Hook
    if (input.grapplePressed) {
      if (this.hookAnchor) {
        this.hookAnchor = null;
      } else {
        const hookStack = char.equipment.hook ?? char.inventory.find((s) => s && getItemDef(s.itemId)?.hookRange);
        const range = hookStack ? getItemDef(hookStack.itemId)?.hookRange ?? 20 : 0;
        if (range > 0) {
          const origin = new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
          const dir = new THREE.Vector3(
            -Math.sin(input.yaw) * Math.cos(input.pitch),
            Math.sin(input.pitch),
            -Math.cos(input.yaw) * Math.cos(input.pitch)
          ).normalize();
          const hit = world.raycastBlock(origin, dir, range);
          if (hit.hit) {
            this.hookAnchor = new THREE.Vector3(hit.bx + 0.5 + hit.nx * 0.6, hit.by + 0.5 + hit.ny * 0.6, hit.bz + 0.5 + hit.nz * 0.6);
            this.fallStartY = null;
          }
        }
      }
    }

    // Movement basis from camera yaw
    const sinY = Math.sin(input.yaw);
    const cosY = Math.cos(input.yaw);
    const moveDir = new THREE.Vector3(
      input.strafe * cosY - input.forward * sinY,
      0,
      -input.strafe * sinY - input.forward * cosY
    );
    const hasMoveInput = moveDir.lengthSq() > 0.001;
    if (hasMoveInput) {
      moveDir.normalize();
      this.facingYaw = Math.atan2(moveDir.x, moveDir.z);
    }

    // Space / High altitude gravity reduction
    const spaceGravityMult = this.position.y >= 210 ? 0.45 : 1.0;
    const isUfoMount = this.activeMount === 'ufo_mount';
    const isSlimeMount = this.activeMount === 'slime_mount';

    const baseSpeed = (isUfoMount ? 14 : 7.4) * stats.moveSpeedMult * (this.inHoney ? 0.45 : this.inWater ? 0.68 : 1.0);

    // Dash
    if (input.dashPressed && stats.dashEnabled && this.dashCooldown <= 0) {
      const dashDir = hasMoveInput
        ? moveDir
        : new THREE.Vector3(-sinY, 0, -cosY).normalize();
      this.velocity.x = dashDir.x * 20;
      this.velocity.z = dashDir.z * 20;
      this.dashTimer = 0.22;
      this.dashCooldown = 0.9;
    }

    if (this.hookAnchor) {
      const toHook = this.hookAnchor.clone().sub(this.position);
      const dist = toHook.length();
      if (dist < 1.35 || input.jumpPressed) {
        this.hookAnchor = null;
        if (input.jumpPressed) this.velocity.y = 10.5;
      } else {
        toHook.normalize().multiplyScalar(22);
        this.velocity.copy(toHook);
      }
    } else if (isUfoMount) {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * baseSpeed, 10 * clampedDt);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * baseSpeed, 10 * clampedDt);
      const targetVy = input.jumpHeld ? 10 : input.crouchHeld ? -10 : 0;
      this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetVy, 10 * clampedDt);
      this.fallStartY = null;
    } else {
      if (this.dashTimer <= 0) {
        const accel = this.grounded ? 18 : 10;
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveDir.x * baseSpeed, Math.min(1, accel * clampedDt));
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveDir.z * baseSpeed, Math.min(1, accel * clampedDt));
      }

      // Gravity + Swimming + Wings
      if (this.inWater || this.inHoney) {
        this.velocity.y -= 10 * clampedDt;
        if (input.jumpHeld) this.velocity.y = 6.2;
        this.velocity.y = Math.max(-6, Math.min(8, this.velocity.y));
        this.fallStartY = null;
      } else {
        this.velocity.y -= 26.5 * spaceGravityMult * clampedDt;

        const jumpSpeed = (isSlimeMount ? 14.5 : 10.4) * stats.jumpBoostMult;
        if (input.jumpPressed) {
          if (this.grounded) {
            this.velocity.y = jumpSpeed;
            this.grounded = false;
            this.fallStartY = null;
          } else if (this.canDoubleJump) {
            this.velocity.y = jumpSpeed * 0.96;
            this.canDoubleJump = false;
            this.fallStartY = null;
          }
        }

        // Wings Flight & Slow Glide
        if (!this.grounded && stats.wingFlightTicks > 0 && input.jumpHeld) {
          if (this.wingFuel > 0) {
            this.velocity.y = Math.min(11.5, this.velocity.y + 42 * clampedDt);
            this.wingFuel = Math.max(0, this.wingFuel - clampedDt * 60);
          } else if (this.velocity.y < -3.2) {
            this.velocity.y = -3.2; // Glide safely
          }
          this.fallStartY = null;
        }

        if (this.velocity.y < -28) this.velocity.y = -28;
      }
    }

    // Track fall height
    if (!this.grounded && this.velocity.y < 0 && this.fallStartY === null && !this.inWater) {
      this.fallStartY = this.position.y;
    }

    // Axis-separated voxel AABB collision
    const wasGrounded = this.grounded;
    this.moveAndCollide(world, clampedDt, input.crouchHeld, stats, autoJump);

    if (this.grounded) {
      this.wingFuel = stats.wingFlightTicks;
      this.canDoubleJump = stats.doubleJump;
      if (!wasGrounded && this.fallStartY !== null && !stats.noFallDamage && !godmode && !isSlimeMount) {
        const drop = this.fallStartY - this.position.y;
        if (drop > 11 && !this.inWater && !this.inHoney) {
          const dmg = Math.round((drop - 10) * 9);
          if (dmg > 0) this.onTakeDamage?.(dmg, 'Falling');
        }
      }
      this.fallStartY = null;
    }

    // World horizontal boundary clamp
    const bound = world.generator.layout.radius + 44;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -bound, bound);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bound, bound);
    this.position.y = THREE.MathUtils.clamp(this.position.y, 1.5, WORLD_HEIGHT - 2);
  }

  private collidesAt(world: WorldManager, x: number, y: number, z: number, dropThroughPlatforms: boolean, stats: ComputedPlayerStats): boolean {
    const minX = Math.floor(x - this.halfWidth);
    const maxX = Math.floor(x + this.halfWidth);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + this.height);
    const minZ = Math.floor(z - this.halfWidth);
    const maxZ = Math.floor(z + this.halfWidth);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          const b = world.getBlock(bx, by, bz);
          if (b === BlockId.Air) continue;
          if (b === BlockId.Water && stats.waterWalk && y >= by + 0.8) {
            return true;
          }
          if (b === BlockId.Lava && stats.lavaWalk && y >= by + 0.8) {
            return true;
          }
          if (b === BlockId.WoodPlatform) {
            if (dropThroughPlatforms) continue;
            // One-way platform from above
            if (y >= by + 0.72 && this.velocity.y <= 0) return true;
            continue;
          }
          if (isSolidBlock(b)) return true;
        }
      }
    }
    return false;
  }

  private moveAndCollide(
    world: WorldManager,
    dt: number,
    crouch: boolean,
    stats: ComputedPlayerStats,
    autoJump: boolean
  ): void {
    // X axis
    const nx = this.position.x + this.velocity.x * dt;
    if (!this.collidesAt(world, nx, this.position.y, this.position.z, crouch, stats)) {
      this.position.x = nx;
    } else if (this.grounded && autoJump && !this.collidesAt(world, nx, this.position.y + 1.05, this.position.z, crouch, stats)) {
      this.position.x = nx;
      this.position.y += 1.02;
    } else {
      this.velocity.x = 0;
    }

    // Z axis
    const nz = this.position.z + this.velocity.z * dt;
    if (!this.collidesAt(world, this.position.x, this.position.y, nz, crouch, stats)) {
      this.position.z = nz;
    } else if (this.grounded && autoJump && !this.collidesAt(world, this.position.x, this.position.y + 1.05, nz, crouch, stats)) {
      this.position.z = nz;
      this.position.y += 1.02;
    } else {
      this.velocity.z = 0;
    }

    // Y axis
    const ny = this.position.y + this.velocity.y * dt;
    if (!this.collidesAt(world, this.position.x, ny, this.position.z, crouch, stats)) {
      this.position.y = ny;
      this.grounded = false;
    } else {
      if (this.velocity.y < 0) {
        this.grounded = true;
        // Snap cleanly to top surface of supporting block
        this.position.y = Math.floor(ny) + 1.001;
        if (this.collidesAt(world, this.position.x, this.position.y, this.position.z, crouch, stats)) {
          this.position.y -= 1.001;
          this.position.y = Math.ceil(ny);
        }
      }
      this.velocity.y = 0;
    }
  }
}
