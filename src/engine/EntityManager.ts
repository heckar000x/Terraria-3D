import * as THREE from 'three';
import { isSolidBlock } from '@/data/blocks';
import { BOSSES, getBossDef } from '@/data/bosses';
import { ENEMIES, getEnemyDef } from '@/data/enemies';
import { getItemDef } from '@/data/items';
import { NPCS, NPC_MAP } from '@/data/npcs';
import {
  BiomeId,
  BlockId,
  BossDef,
  CharacterSave,
  EnemyDef,
  EventId,
  GameDifficulty,
  ItemStack,
  NpcDef,
  WorldMeta,
} from '@/types/game';
import { HousingSystem } from '@/systems/HousingSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { WorldManager } from '@/world/WorldManager';
import { ParticleSystem } from './ParticleSystem';

export interface DroppedItemEntity {
  id: number;
  stack: ItemStack;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  mesh?: THREE.Mesh;
}

export interface ProjectileEntity {
  id: number;
  kind: string;
  fromPlayer: boolean;
  damage: number;
  damageType: 'melee' | 'ranged' | 'magic' | 'summon' | 'true';
  knockback: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  life: number;
  maxLife: number;
  pierce: number;
  bounces: number;
  homing: boolean;
  boomerangReturn: boolean;
  explosiveRadius?: number;
  inflictsDebuff?: 'on_fire' | 'poisoned' | 'ichor' | 'cursed_inferno' | 'frostburn';
  hitIds: Set<number>;
  mesh?: THREE.Object3D;
}

export interface EnemyEntity {
  id: number;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
  aiTimer: number;
  attackCooldown: number;
  hurtFlash: number;
  phaseAngle: number;
  wormSegments: THREE.Vector3[];
  mesh?: THREE.Group;
}

export interface BossEntity {
  id: number;
  def: BossDef;
  hp: number;
  maxHp: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number; // 1 or 2
  aiState: 'chase' | 'dash' | 'hover' | 'spin' | 'teleport';
  aiTimer: number;
  attackTimer: number;
  hurtFlash: number;
  subParts: THREE.Vector3[]; // hands or worm segments
  mesh?: THREE.Group;
  partMeshes: THREE.Object3D[];
}

export interface MinionEntity {
  id: number;
  kind: string;
  damage: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  attackCooldown: number;
  mesh?: THREE.Group;
}

export interface NpcEntity {
  id: string;
  def: NpcDef;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  homePos: THREE.Vector3;
  wanderTimer: number;
  attackTimer: number;
  mesh?: THREE.Group;
}

export interface BossHudInfo {
  id: string;
  name: string;
  title: string;
  hp: number;
  maxHp: number;
}

export class EntityManager {
  private scene: THREE.Scene | null = null;
  private nextId = 1;
  private tmpVec1 = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();
  private tmpVec3 = new THREE.Vector3();

  public drops: DroppedItemEntity[] = [];
  public projectiles: ProjectileEntity[] = [];
  public enemies: EnemyEntity[] = [];
  public bosses: BossEntity[] = [];
  public minions: MinionEntity[] = [];
  public npcs: NpcEntity[] = [];

  private spawnTimer = 0;

  public onPlayerHit?: (damage: number, source: string, knockDir: THREE.Vector3) => void;
  public onItemPickedUp?: (itemId: string, count: number) => void;
  public onBossDefeated?: (boss: BossDef, pos: THREE.Vector3) => void;
  public onEnemyDefeated?: (enemy: EnemyDef, pos: THREE.Vector3) => void;
  public onAnnouncement?: (text: string, color?: string) => void;

  public initScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  public getDifficultyMultipliers(diff: GameDifficulty): { hp: number; dmg: number } {
    switch (diff) {
      case 'expert': return { hp: 1.65, dmg: 1.5 };
      case 'master': return { hp: 2.3, dmg: 2.0 };
      case 'journey': return { hp: 0.75, dmg: 0.75 };
      default: return { hp: 1.0, dmg: 1.0 };
    }
  }

  public spawnDrop(x: number, y: number, z: number, stack: ItemStack): void {
    if (!stack.itemId || stack.count <= 0) return;
    const def = getItemDef(stack.itemId);
    const drop: DroppedItemEntity = {
      id: this.nextId++,
      stack: { ...stack },
      position: new THREE.Vector3(x, y + 0.35, z),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 3.5, 4.2 + Math.random() * 1.5, (Math.random() - 0.5) * 3.5),
      age: 0,
    };

    if (this.scene) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.38, 0.38),
        new THREE.MeshLambertMaterial({
          color: def?.iconColor ?? '#ffd740',
          emissive: def?.holdLight ? def.iconColor : '#111111',
          emissiveIntensity: 0.35,
        })
      );
      mesh.position.copy(drop.position);
      this.scene.add(mesh);
      drop.mesh = mesh;
    }

    this.drops.push(drop);
    if (this.drops.length > 180) {
      const oldest = this.drops.shift();
      if (oldest?.mesh && this.scene) this.scene.remove(oldest.mesh);
    }
  }

  public spawnProjectile(cfg: Omit<ProjectileEntity, 'id' | 'hitIds' | 'mesh'>): ProjectileEntity {
    const p: ProjectileEntity = {
      ...cfg,
      id: this.nextId++,
      hitIds: new Set(),
    };

    if (this.scene) {
      let color = '#ffee58';
      let scale: [number, number, number] = [0.22, 0.22, 0.55];
      if (cfg.kind.includes('arrow')) {
        color = cfg.kind.includes('flaming') || cfg.kind.includes('hellfire') ? '#ff6d00' : cfg.kind.includes('holy') ? '#ff80ab' : '#bcaaa4';
        scale = [0.14, 0.14, 0.72];
      } else if (cfg.kind.includes('bullet')) {
        color = cfg.kind.includes('chlorophyte') ? '#76ff03' : cfg.kind.includes('crystal') ? '#e040fb' : '#ffd740';
        scale = [0.14, 0.14, 0.35];
      } else if (cfg.kind.includes('water_bolt')) {
        color = '#29b6f6';
        scale = [0.38, 0.38, 0.38];
      } else if (cfg.kind.includes('terra') || cfg.kind.includes('zenith') || cfg.kind.includes('enchanted')) {
        color = cfg.kind.includes('terra') ? '#00e676' : cfg.kind.includes('zenith') ? '#00e5ff' : '#448aff';
        scale = [0.65, 0.16, 0.9];
      } else if (cfg.kind.includes('prism')) {
        color = '#ff80ab';
        scale = [0.45, 0.45, 2.4];
      } else if (!cfg.fromPlayer) {
        color = cfg.kind.includes('laser') ? '#ff1744' : cfg.kind.includes('ichor') ? '#ffea00' : cfg.kind.includes('cursed') ? '#76ff03' : '#ff5722';
        scale = [0.34, 0.34, 0.55];
      }

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(scale[0], scale[1], scale[2]),
        new THREE.MeshBasicMaterial({ color })
      );
      mesh.position.copy(p.position);
      if (p.velocity.lengthSq() > 0.01) {
        mesh.lookAt(p.position.clone().add(p.velocity));
      }
      this.scene.add(mesh);
      p.mesh = mesh;
    }

    this.projectiles.push(p);
    return p;
  }

  public syncMinions(playerPos: THREE.Vector3, char: CharacterSave, maxMinions: number): void {
    // Check equipped or hotbar minion summon count target
    const activeKinds = this.minions.map((m) => m.kind);
    if (this.minions.length > maxMinions) {
      while (this.minions.length > maxMinions) {
        const rem = this.minions.pop();
        if (rem?.mesh && this.scene) this.scene.remove(rem.mesh);
      }
    }
    void activeKinds;
    void char;
    void playerPos;
  }

  public summonMinion(kind: string, damage: number, playerPos: THREE.Vector3, maxMinions: number): void {
    while (this.minions.length >= maxMinions) {
      const rem = this.minions.shift();
      if (rem?.mesh && this.scene) this.scene.remove(rem.mesh);
    }

    const pos = playerPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 2.2, (Math.random() - 0.5) * 2));
    const minion: MinionEntity = {
      id: this.nextId++,
      kind,
      damage,
      position: pos,
      velocity: new THREE.Vector3(),
      attackCooldown: 0.2,
    };

    if (this.scene) {
      const g = new THREE.Group();
      const color =
        kind.includes('slime') ? '#4fc3f7' :
        kind.includes('hornet') ? '#ffca28' :
        kind.includes('imp') ? '#ff5722' :
        kind.includes('stardust') ? '#40c4ff' :
        kind.includes('twins') ? '#ef5350' : '#d7ccc8';
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      wingL.position.set(-0.35, 0.18, 0);
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      wingR.position.set(0.35, 0.18, 0);
      g.add(body, wingL, wingR);
      g.position.copy(pos);
      this.scene.add(g);
      minion.mesh = g;
    }

    this.minions.push(minion);
  }

  public spawnEnemy(enemyId: string, pos: THREE.Vector3, difficulty: GameDifficulty): EnemyEntity | null {
    const def = getEnemyDef(enemyId);
    if (!def) return null;
    const mult = this.getDifficultyMultipliers(difficulty);
    const maxHp = Math.max(10, Math.round(def.maxHp * mult.hp));

    const wormSegments: THREE.Vector3[] = [];
    if (def.aiType === 'worm') {
      for (let i = 0; i < 8; i++) {
        wormSegments.push(pos.clone().add(new THREE.Vector3(0, 0, -i * 1.1)));
      }
    }

    const enemy: EnemyEntity = {
      id: this.nextId++,
      def,
      hp: maxHp,
      maxHp,
      position: pos.clone(),
      velocity: new THREE.Vector3(),
      grounded: false,
      aiTimer: Math.random() * 2,
      attackCooldown: 1 + Math.random(),
      hurtFlash: 0,
      phaseAngle: Math.random() * Math.PI * 2,
      wormSegments,
    };

    if (this.scene) {
      enemy.mesh = this.buildEnemyMesh(def, wormSegments.length);
      enemy.mesh.position.copy(pos);
      this.scene.add(enemy.mesh);
    }

    this.enemies.push(enemy);
    return enemy;
  }

  private buildEnemyMesh(def: EnemyDef, segCount: number): THREE.Group {
    const g = new THREE.Group();
    const [w, h, d] = def.size;
    const primMat = new THREE.MeshLambertMaterial({
      color: def.colorPrimary,
      transparent: def.aiType === 'slime',
      opacity: def.aiType === 'slime' ? 0.82 : 1.0,
      emissive: def.emissiveColor ?? '#000000',
      emissiveIntensity: def.emissiveColor ? 0.45 : 0,
    });
    const secMat = new THREE.MeshLambertMaterial({ color: def.colorSecondary });

    if (def.aiType === 'slime') {
      const dome = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.85, d), primMat);
      dome.position.y = h * 0.425;
      dome.castShadow = true;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.22, d * 0.72), primMat);
      crown.position.y = h * 0.92;
      const core = new THREE.Mesh(new THREE.BoxGeometry(w * 0.44, h * 0.42, d * 0.44), secMat);
      core.position.y = h * 0.42;
      const eyeWMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      const eyeBMat = new THREE.MeshBasicMaterial({ color: '#111827' });
      const lEye = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, h * 0.16, 0.04), eyeWMat);
      lEye.position.set(-w * 0.19, h * 0.54, d * 0.5);
      const rEye = new THREE.Mesh(new THREE.BoxGeometry(w * 0.14, h * 0.16, 0.04), eyeWMat);
      rEye.position.set(w * 0.19, h * 0.54, d * 0.5);
      const lPup = new THREE.Mesh(new THREE.BoxGeometry(w * 0.07, h * 0.09, 0.05), eyeBMat);
      lPup.position.set(-w * 0.19, h * 0.53, d * 0.51);
      const rPup = new THREE.Mesh(new THREE.BoxGeometry(w * 0.07, h * 0.09, 0.05), eyeBMat);
      rPup.position.set(w * 0.19, h * 0.53, d * 0.51);
      g.add(dome, crown, core, lEye, rEye, lPup, rPup);
    } else if (def.aiType === 'fighter' || def.aiType === 'caster') {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, h * 0.38, d * 0.45), secMat);
      torso.position.y = h * 0.55;
      torso.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h * 0.28, d * 0.55), primMat);
      head.position.y = h * 0.86;
      head.castShadow = true;
      const eyeMat = new THREE.MeshBasicMaterial({ color: def.emissiveColor ?? '#ff5252' });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, h * 0.06, 0.04), eyeMat);
      eyeL.position.set(-w * 0.12, h * 0.87, d * 0.28);
      const eyeR = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, h * 0.06, 0.04), eyeMat);
      eyeR.position.set(w * 0.12, h * 0.87, d * 0.28);
      const lArm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.35, d * 0.22), primMat);
      lArm.position.set(-w * 0.44, h * 0.6, d * 0.22);
      lArm.rotation.x = -Math.PI * 0.45;
      const rArm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.35, d * 0.22), primMat);
      rArm.position.set(w * 0.44, h * 0.6, d * 0.22);
      rArm.rotation.x = -Math.PI * 0.45;
      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, h * 0.36, d * 0.28), secMat);
      lLeg.position.set(-w * 0.18, h * 0.18, 0);
      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.25, h * 0.36, d * 0.28), secMat);
      rLeg.position.set(w * 0.18, h * 0.18, 0);
      g.add(torso, head, eyeL, eyeR, lArm, rArm, lLeg, rLeg);
    } else if (def.aiType === 'flying') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), primMat);
      const iris = new THREE.Mesh(new THREE.BoxGeometry(w * 0.45, h * 0.45, 0.08), secMat);
      iris.position.set(0, 0, d * 0.52);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.1, d * 0.45), new THREE.MeshLambertMaterial({ color: def.colorSecondary, transparent: true, opacity: 0.78 }));
      wingL.position.set(-w * 0.75, h * 0.2, 0);
      const wingR = wingL.clone();
      wingR.position.set(w * 0.75, h * 0.2, 0);
      g.add(body, iris, wingL, wingR);
    } else if (def.aiType === 'worm') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), secMat);
      g.add(head);
      for (let i = 1; i < segCount; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, h * 0.88, w * 0.88), primMat);
        g.add(seg);
      }
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), primMat);
      body.position.y = h * 0.5;
      const accent = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.3, d * 0.6), secMat);
      accent.position.set(0, h * 0.85, d * 0.25);
      g.add(body, accent);
    }
    return g;
  }

  public spawnBoss(bossId: string, nearPos: THREE.Vector3, difficulty: GameDifficulty): BossEntity | null {
    const def = getBossDef(bossId);
    if (!def) return null;
    const mult = this.getDifficultyMultipliers(difficulty);
    const maxHp = Math.round(def.maxHp * mult.hp);

    const startPos = nearPos.clone().add(new THREE.Vector3(16, bossId === 'king_slime' || bossId === 'wall_of_flesh' ? 2 : 12, 12));
    if (bossId === 'wall_of_flesh') {
      startPos.set(nearPos.x - 28, Math.min(20, nearPos.y), nearPos.z);
    }

    const subParts: THREE.Vector3[] = [];
    if (bossId === 'eater_of_worlds' || bossId === 'the_destroyer') {
      for (let i = 0; i < 16; i++) subParts.push(startPos.clone().add(new THREE.Vector3(-i * 2.2, 0, 0)));
    } else if (bossId === 'skeletron') {
      subParts.push(startPos.clone().add(new THREE.Vector3(-4, -2, 0)), startPos.clone().add(new THREE.Vector3(4, -2, 0)));
    } else if (bossId === 'skeletron_prime') {
      for (let i = 0; i < 4; i++) subParts.push(startPos.clone().add(new THREE.Vector3((i % 2 ? 4.5 : -4.5), i < 2 ? 1.5 : -2.5, 0)));
    } else if (bossId === 'the_twins') {
      // Second twin offset (Retinazer + Spazmatism!)
      subParts.push(startPos.clone().add(new THREE.Vector3(-12, 4, -8)));
    } else if (bossId === 'golem' || bossId === 'moon_lord') {
      subParts.push(startPos.clone().add(new THREE.Vector3(-4.5, 0, 0)), startPos.clone().add(new THREE.Vector3(4.5, 0, 0)));
    }

    const boss: BossEntity = {
      id: this.nextId++,
      def,
      hp: maxHp,
      maxHp,
      position: startPos,
      velocity: new THREE.Vector3(),
      phase: 1,
      aiState: 'chase',
      aiTimer: 0,
      attackTimer: 1.5,
      hurtFlash: 0,
      subParts,
      partMeshes: [],
    };

    if (this.scene) {
      this.buildBossMesh(boss);
      this.scene.add(boss.mesh!);
      for (const pm of boss.partMeshes) {
        this.scene.add(pm);
      }
    }

    this.bosses.push(boss);
    this.onAnnouncement?.(`${def.name} has awoken!`, '#d580ff');
    return boss;
  }

  private buildBossMesh(boss: BossEntity): void {
    const def = boss.def;
    const s = def.scale;
    const g = new THREE.Group();
    const pMat = new THREE.MeshLambertMaterial({ color: def.colorPrimary, emissive: def.colorPrimary, emissiveIntensity: 0.15 });
    const sMat = new THREE.MeshLambertMaterial({ color: def.colorSecondary, emissive: def.colorSecondary, emissiveIntensity: 0.35 });

    if (def.id === 'king_slime' || def.id === 'queen_slime') {
      const gelMat = new THREE.MeshLambertMaterial({ color: def.colorPrimary, transparent: true, opacity: 0.78 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s * 1.1, s * 1.4), gelMat);
      body.position.y = s * 0.55;
      const core = new THREE.Mesh(new THREE.BoxGeometry(s * 0.45, s * 0.65, s * 0.45), new THREE.MeshLambertMaterial({ color: def.id === 'king_slime' ? '#212121' : '#84ffff' }));
      core.position.y = s * 0.5;
      const crown = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, s * 0.35, s * 0.6), sMat);
      crown.position.y = s * 1.25;
      g.add(body, core, crown);
    } else if (def.id === 'wall_of_flesh') {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 22, 26), pMat);
      const eyeTop = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 12), sMat);
      eyeTop.position.set(1.5, 6, 0);
      const eyeBot = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 12), sMat);
      eyeBot.position.set(1.5, -6, 0);
      const maw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 5), new THREE.MeshLambertMaterial({ color: '#3b0606' }));
      maw.position.set(1.2, 0, 0);
      g.add(wall, eyeTop, eyeBot, maw);
    } else if (def.id === 'eye_of_cthulhu' || def.id === 'the_twins') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(s * 0.65, 16, 16), pMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(s * 0.32, 12, 12), sMat);
      pupil.position.z = s * 0.48;
      g.add(orb, pupil);
    } else if (def.id === 'skeletron' || def.id === 'skeletron_prime') {
      const skull = new THREE.Mesh(new THREE.BoxGeometry(s * 0.9, s * 1.0, s * 0.9), pMat);
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(s * 0.22, s * 0.22, 0.2), sMat);
      eyeL.position.set(-s * 0.22, s * 0.12, s * 0.46);
      const eyeR = eyeL.clone();
      eyeR.position.x = s * 0.22;
      g.add(skull, eyeL, eyeR);
    } else {
      const main = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), pMat);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(s * 0.55, s * 0.55, s * 1.15), sMat);
      g.add(main, crest);
    }

    g.position.copy(boss.position);
    boss.mesh = g;

    // Build independent articulated limbs / worm segments / twin eye
    for (let i = 0; i < boss.subParts.length; i++) {
      const sz = def.id === 'the_twins' ? s * 0.65 : s * 0.55;
      const pm = new THREE.Mesh(
        def.id === 'the_twins' || def.id === 'the_destroyer' || def.id === 'eater_of_worlds'
          ? new THREE.SphereGeometry(sz, 12, 12)
          : new THREE.BoxGeometry(sz, sz, sz),
        i === 0 && def.id === 'the_twins'
          ? new THREE.MeshLambertMaterial({ color: '#76ff03', emissive: '#76ff03', emissiveIntensity: 0.4 })
          : pMat
      );
      pm.position.copy(boss.subParts[i]);
      boss.partMeshes.push(pm);
    }
  }

  public syncTownNpcs(world: WorldManager, meta: WorldMeta, char: CharacterSave, spawnPos: THREE.Vector3): void {
    const unlocked = HousingSystem.evaluateUnlockedNpcs(meta, char);
    for (const npcId of unlocked) {
      if (this.npcs.some((n) => n.id === npcId)) continue;
      const def = NPC_MAP[npcId];
      if (!def) continue;
      const house = meta.npcHouses.find((h) => h.npcId === npcId);
      const base = house
        ? new THREE.Vector3(house.x, house.y + 0.5, house.z)
        : spawnPos.clone().add(new THREE.Vector3((this.npcs.length - 1) * 3, 1, 4));
      const safeY = house ? house.y : world.findSafeSpawnY(base.x, base.z);
      const pos = new THREE.Vector3(base.x, safeY, base.z);
      const npc: NpcEntity = {
        id: npcId,
        def,
        position: pos.clone(),
        velocity: new THREE.Vector3(),
        homePos: pos.clone(),
        wanderTimer: 1 + Math.random() * 3,
        attackTimer: 1.0,
      };
      if (this.scene) {
        npc.mesh = this.buildNpcMesh(def);
        npc.mesh.position.copy(pos);
        this.scene.add(npc.mesh);
      }
      this.npcs.push(npc);
    }
  }

  private buildNpcMesh(def: NpcDef): THREE.Group {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: def.colorShirt });
    const skin = new THREE.MeshLambertMaterial({ color: def.colorSkin });
    const hair = new THREE.MeshLambertMaterial({ color: def.colorHair });
    const legs = new THREE.MeshLambertMaterial({ color: '#37474f' });

    const legM = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.26), legs);
    legM.position.y = 0.325;
    const torsoM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirt);
    torsoM.position.y = 0.96;
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    headM.position.y = 1.48;
    const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), hair);
    hairM.position.y = 1.72;
    g.add(legM, torsoM, headM, hairM);
    return g;
  }

  public getActiveBossHud(): BossHudInfo | null {
    if (this.bosses.length === 0) return null;
    const b = this.bosses[0];
    return { id: b.def.id, name: b.def.name, title: b.def.title, hp: Math.max(0, b.hp), maxHp: b.maxHp };
  }

  public update(
    dt: number,
    world: WorldManager,
    char: CharacterSave,
    playerPos: THREE.Vector3,
    isDay: boolean,
    particles: ParticleSystem,
    spawnRateMult = 1.0
  ): void {
    const clampedDt = Math.min(0.05, dt);
    const playerCenter = this.tmpVec1.set(playerPos.x, playerPos.y + 0.9, playerPos.z);

    // 1. Update Drops + Magnetic Pickup
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += clampedDt;
      const distToPlayer = d.position.distanceTo(playerCenter);
      if (d.age > 0.35 && distToPlayer < 3.4) {
        this.tmpVec2.copy(playerCenter).sub(d.position).normalize().multiplyScalar(14);
        d.position.addScaledVector(this.tmpVec2, clampedDt);
      } else {
        d.velocity.y -= 20 * clampedDt;
        const ny = d.position.y + d.velocity.y * clampedDt;
        if (isSolidBlock(world.getBlock(d.position.x, ny - 0.2, d.position.z))) {
          d.velocity.y = 0;
          d.velocity.x *= 0.7;
          d.velocity.z *= 0.7;
        } else {
          d.position.y = ny;
        }
        d.position.x += d.velocity.x * clampedDt;
        d.position.z += d.velocity.z * clampedDt;
      }

      if (d.mesh) {
        d.mesh.position.copy(d.position);
        d.mesh.position.y += Math.sin(d.age * 4) * 0.08;
        d.mesh.rotation.y += clampedDt * 2.5;
      }

      if (d.age > 0.25 && distToPlayer < 1.3) {
        const added = InventorySystem.addItem(char, d.stack.itemId, d.stack.count, d.stack.modifier);
        if (added > 0) {
          this.onItemPickedUp?.(d.stack.itemId, added);
          if (added >= d.stack.count) {
            if (d.mesh && this.scene) this.scene.remove(d.mesh);
            this.drops.splice(i, 1);
          } else {
            d.stack.count -= added;
          }
        }
      }
    }

    // 2. Spawning Director (Biome, Depth, Day/Night, Events, Hardmode)
    this.spawnTimer += clampedDt * spawnRateMult;
    const maxEnemies = world.meta.activeEvent ? 14 : 9;
    if (this.spawnTimer >= (world.meta.activeEvent ? 1.4 : 3.2) && this.enemies.length < maxEnemies && spawnRateMult > 0) {
      this.spawnTimer = 0;
      this.trySpawnBiomeEnemy(world, playerPos, isDay);
    }

    // 3. Update Minions
    for (let i = 0; i < this.minions.length; i++) {
      const m = this.minions[i];
      m.attackCooldown = Math.max(0, m.attackCooldown - clampedDt);
      const target = this.findNearestTarget(m.position, 22);
      const desired = target
        ? target.pos.clone().add(new THREE.Vector3(0, 1.5, 0))
        : playerPos.clone().add(new THREE.Vector3(Math.cos(i * 2.1 + performance.now() * 0.002) * 2.2, 2.3, Math.sin(i * 2.1 + performance.now() * 0.002) * 2.2));

      const dir = desired.clone().sub(m.position);
      const dist = dir.length();
      if (dist > 1.2) {
        dir.normalize().multiplyScalar(Math.min(13, 5 + dist));
        m.velocity.lerp(dir, 6 * clampedDt);
        m.position.addScaledVector(m.velocity, clampedDt);
      }
      if (target && m.attackCooldown <= 0 && dist < 18) {
        m.attackCooldown = 0.75;
        if (m.kind.includes('imp') || m.kind.includes('hornet') || m.kind.includes('twins')) {
          const pDir = target.pos.clone().sub(m.position).normalize().multiplyScalar(28);
          this.spawnProjectile({
            kind: m.kind.includes('imp') ? 'fire_bolt' : 'stinger_friendly',
            fromPlayer: true,
            damage: m.damage,
            damageType: 'summon',
            knockback: 2,
            position: m.position.clone(),
            velocity: pDir,
            gravity: 0,
            life: 1.5,
            maxLife: 1.5,
            pierce: 1,
            bounces: 0,
            homing: false,
            boomerangReturn: false,
          });
        } else if (dist < 2.2) {
          this.damageTarget(target.ref, m.damage, m.velocity.clone().normalize(), 2, false, particles);
        }
      }
      if (m.mesh) m.mesh.position.copy(m.position);
    }

    // 4. Update Town NPCs
    for (const npc of this.npcs) {
      npc.wanderTimer -= clampedDt;
      npc.attackTimer = Math.max(0, npc.attackTimer - clampedDt);
      if (npc.wanderTimer <= 0) {
        npc.wanderTimer = 2 + Math.random() * 4;
        const ang = Math.random() * Math.PI * 2;
        const distFromHome = npc.position.distanceTo(npc.homePos);
        if (distFromHome > 10) {
          const back = npc.homePos.clone().sub(npc.position).setY(0).normalize();
          npc.velocity.x = back.x * 2.5;
          npc.velocity.z = back.z * 2.5;
        } else {
          npc.velocity.x = Math.cos(ang) * (Math.random() < 0.5 ? 2.0 : 0);
          npc.velocity.z = Math.sin(ang) * (Math.random() < 0.5 ? 2.0 : 0);
        }
      }

      // Gravity + step
      npc.velocity.y -= 24 * clampedDt;
      const nx = npc.position.x + npc.velocity.x * clampedDt;
      const nz = npc.position.z + npc.velocity.z * clampedDt;
      if (!isSolidBlock(world.getBlock(nx, npc.position.y + 0.5, npc.position.z))) npc.position.x = nx;
      else npc.velocity.x *= -1;
      if (!isSolidBlock(world.getBlock(npc.position.x, npc.position.y + 0.5, nz))) npc.position.z = nz;
      else npc.velocity.z *= -1;

      const ny = npc.position.y + npc.velocity.y * clampedDt;
      if (isSolidBlock(world.getBlock(npc.position.x, ny, npc.position.z))) {
        npc.position.y = Math.floor(ny) + 1.001;
        npc.velocity.y = 0;
      } else {
        npc.position.y = ny;
      }

      // NPC self-defense against nearby hostile enemies
      if (npc.attackTimer <= 0) {
        const threat = this.findNearestTarget(npc.position, 12);
        if (threat) {
          npc.attackTimer = 1.1;
          const dir = threat.pos.clone().sub(npc.position.clone().add(new THREE.Vector3(0, 1.2, 0))).normalize().multiplyScalar(22);
          this.spawnProjectile({
            kind: 'arrow_wood',
            fromPlayer: true,
            damage: 14,
            damageType: 'ranged',
            knockback: 3,
            position: npc.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
            velocity: dir,
            gravity: 6,
            life: 1.5,
            maxLife: 1.5,
            pierce: 1,
            bounces: 0,
            homing: false,
            boomerangReturn: false,
          });
        }
      }

      if (npc.mesh) {
        npc.mesh.position.copy(npc.position);
        if (Math.hypot(npc.velocity.x, npc.velocity.z) > 0.2) {
          npc.mesh.rotation.y = Math.atan2(npc.velocity.x, npc.velocity.z);
        }
      }
    }

    // 5. Update Enemies
    const dmgMult = this.getDifficultyMultipliers(world.meta.difficulty).dmg;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.position.distanceTo(playerPos) > 78) {
        if (e.mesh && this.scene) this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
        continue;
      }
      this.updateEnemyAI(e, clampedDt, world, playerPos, dmgMult);

      // Contact hit player
      const dist = e.position.distanceTo(playerCenter);
      if (dist < (e.def.size[0] * 0.5 + 0.65)) {
        const kDir = this.tmpVec2.copy(playerPos).sub(e.position).setY(0.3).normalize();
        this.onPlayerHit?.(Math.round(e.def.damage * dmgMult), e.def.name, kDir);
      }
    }

    // 6. Update Bosses
    for (let i = this.bosses.length - 1; i >= 0; i--) {
      const b = this.bosses[i];
      this.updateBossAI(b, clampedDt, world, playerPos, dmgMult, particles);
      const hitRadius = b.def.scale * 0.55 + 0.7;
      if (b.position.distanceTo(playerCenter) < hitRadius) {
        const kDir = this.tmpVec2.copy(playerPos).sub(b.position).setY(0.35).normalize();
        this.onPlayerHit?.(Math.round(b.def.damage * dmgMult), b.def.name, kDir);
      }
    }

    // 7. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= clampedDt;
      if (p.life <= 0) {
        this.removeProjectile(i, particles);
        continue;
      }

      if (p.boomerangReturn && p.life < p.maxLife * 0.55) {
        const back = this.tmpVec2.set(playerPos.x, playerPos.y + 1.1, playerPos.z).sub(p.position);
        if (back.length() < 1.2) {
          this.removeProjectile(i, particles);
          continue;
        }
        p.velocity.lerp(back.normalize().multiplyScalar(32), 8 * clampedDt);
      } else if (p.homing && p.fromPlayer) {
        const target = this.findNearestTarget(p.position, 22);
        if (target) {
          const desired = this.tmpVec2.copy(target.pos).sub(p.position).normalize().multiplyScalar(p.velocity.length());
          p.velocity.lerp(desired, 7 * clampedDt);
        }
      }

      p.velocity.y -= p.gravity * clampedDt;
      const nextPos = this.tmpVec2.copy(p.position).addScaledVector(p.velocity, clampedDt);

      // Block bounce / collision
      if (!p.boomerangReturn && !p.kind.includes('zenith') && !p.kind.includes('prism') && isSolidBlock(world.getBlock(nextPos.x, nextPos.y, nextPos.z))) {
        if (p.bounces > 0) {
          p.bounces--;
          if (isSolidBlock(world.getBlock(nextPos.x, p.position.y, p.position.z))) p.velocity.x *= -1;
          if (isSolidBlock(world.getBlock(p.position.x, nextPos.y, p.position.z))) p.velocity.y *= -1;
          if (isSolidBlock(world.getBlock(p.position.x, p.position.y, nextPos.z))) p.velocity.z *= -1;
        } else {
          if (p.explosiveRadius) {
            world.detonateTNT(Math.floor(p.position.x), Math.floor(p.position.y), Math.floor(p.position.z), p.explosiveRadius);
            particles.spawnBurst(p.position.x, p.position.y, p.position.z, '#ff6d00', 22, 9);
          }
          this.removeProjectile(i, particles);
          continue;
        }
      } else {
        p.position.copy(nextPos);
      }

      if (p.mesh) {
        p.mesh.position.copy(p.position);
        if (p.velocity.lengthSq() > 0.01) {
          this.tmpVec3.copy(p.position).add(p.velocity);
          p.mesh.lookAt(this.tmpVec3);
        }
      }

      // Hit checks
      if (p.fromPlayer) {
        let hitConsumed = false;
        for (const e of this.enemies) {
          if (p.hitIds.has(e.id)) continue;
          this.tmpVec3.set(e.position.x, e.position.y + e.def.size[1] * 0.5, e.position.z);
          if (this.tmpVec3.distanceTo(p.position) < e.def.size[0] * 0.65 + 0.5) {
            p.hitIds.add(e.id);
            this.damageTarget(e, p.damage, this.tmpVec3.copy(p.velocity).normalize(), p.knockback, Math.random() < 0.08, particles);
            p.pierce--;
            if (p.pierce <= 0) { hitConsumed = true; break; }
          }
        }
        if (!hitConsumed) {
          for (const b of this.bosses) {
            if (p.hitIds.has(b.id)) continue;
            if (b.position.distanceTo(p.position) < b.def.scale * 0.65 + 0.6) {
              p.hitIds.add(b.id);
              this.damageTarget(b, p.damage, this.tmpVec3.copy(p.velocity).normalize(), 0, Math.random() < 0.08, particles);
              p.pierce--;
              if (p.pierce <= 0) { hitConsumed = true; break; }
            }
          }
        }
        if (hitConsumed) {
          this.removeProjectile(i, particles);
          continue;
        }
      } else {
        if (p.position.distanceTo(playerCenter) < 0.85) {
          const kDir = this.tmpVec3.copy(p.velocity).setY(0.2).normalize();
          this.onPlayerHit?.(p.damage, p.kind, kDir);
          this.removeProjectile(i, particles);
        }
      }
    }
  }

  private removeProjectile(idx: number, particles: ParticleSystem): void {
    const p = this.projectiles[idx];
    particles.spawnBurst(p.position.x, p.position.y, p.position.z, p.fromPlayer ? '#ffe082' : '#ff5252', 4, 3);
    if (p.mesh && this.scene) this.scene.remove(p.mesh);
    this.projectiles.splice(idx, 1);
  }

  private findNearestTarget(from: THREE.Vector3, maxRange: number): { pos: THREE.Vector3; ref: EnemyEntity | BossEntity } | null {
    let best: { pos: THREE.Vector3; ref: EnemyEntity | BossEntity } | null = null;
    let bestD = maxRange;
    for (const b of this.bosses) {
      const d = b.position.distanceTo(from);
      if (d < bestD) { bestD = d; best = { pos: b.position, ref: b }; }
    }
    for (const e of this.enemies) {
      const d = e.position.distanceTo(from);
      if (d < bestD) { bestD = d; best = { pos: e.position.clone().add(new THREE.Vector3(0, e.def.size[1] * 0.5, 0)), ref: e }; }
    }
    return best;
  }

  public performMeleeSweep(
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    range: number,
    damage: number,
    knockback: number,
    critChance: number,
    particles: ParticleSystem
  ): boolean {
    let hitAny = false;
    const crit = Math.random() * 100 < critChance;
    const finalDmg = crit ? Math.round(damage * 2) : damage;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const toE = e.position.clone().add(new THREE.Vector3(0, e.def.size[1] * 0.5, 0)).sub(origin);
      const dist = toE.length();
      if (dist <= range + e.def.size[0] * 0.5) {
        const dot = toE.clone().normalize().dot(forward);
        if (dot > 0.1 || dist < 1.8) {
          this.damageTarget(e, finalDmg, forward.clone(), knockback, crit, particles);
          hitAny = true;
        }
      }
    }

    for (let i = this.bosses.length - 1; i >= 0; i--) {
      const b = this.bosses[i];
      const toB = b.position.clone().sub(origin);
      const dist = toB.length();
      if (dist <= range + b.def.scale * 0.7) {
        this.damageTarget(b, finalDmg, forward.clone(), 0, crit, particles);
        hitAny = true;
      }
    }

    return hitAny;
  }

  public damageTarget(
    target: EnemyEntity | BossEntity,
    rawDamage: number,
    knockDir: THREE.Vector3,
    knockback: number,
    crit: boolean,
    particles: ParticleSystem
  ): void {
    const def = target.def;
    const dmg = Math.max(1, Math.round(rawDamage - def.defense * 0.5));
    target.hp -= dmg;
    target.hurtFlash = 0.16;

    particles.spawnFloatingNumber(
      target.position.x,
      target.position.y + 1.4,
      target.position.z,
      String(dmg),
      crit ? '#ff9100' : '#ffffff',
      crit
    );
    particles.spawnBurst(target.position.x, target.position.y + 0.8, target.position.z, def.colorPrimary, 8, 4.5);

    if ('aiType' in def) {
      // Regular Enemy
      const e = target as EnemyEntity;
      const kScale = Math.max(0, 1 - def.knockbackResist) * knockback * 1.3;
      e.velocity.x += knockDir.x * kScale;
      e.velocity.z += knockDir.z * kScale;
      e.velocity.y = Math.max(e.velocity.y, Math.min(6, kScale * 0.55));
      if (e.hp <= 0) {
        this.killEnemy(e, particles);
      }
    } else {
      // Boss
      const b = target as BossEntity;
      if (b.hp <= 0) {
        this.killBoss(b, particles);
      }
    }
  }

  private killEnemy(e: EnemyEntity, particles: ParticleSystem): void {
    const idx = this.enemies.indexOf(e);
    if (idx !== -1) this.enemies.splice(idx, 1);
    if (e.mesh && this.scene) this.scene.remove(e.mesh);

    particles.spawnBurst(e.position.x, e.position.y + 0.8, e.position.z, e.def.colorPrimary, 16, 6);
    if (e.def.copperValue > 0) {
      this.spawnDrop(e.position.x, e.position.y, e.position.z, { itemId: 'copper_coin', count: e.def.copperValue });
    }
    for (const d of e.def.drops) {
      if (Math.random() <= d.chance) {
        const count = d.minCount + Math.floor(Math.random() * (d.maxCount - d.minCount + 1));
        if (count > 0) this.spawnDrop(e.position.x, e.position.y, e.position.z, { itemId: d.itemId, count });
      }
    }
    this.onEnemyDefeated?.(e.def, e.position);
  }

  private killBoss(b: BossEntity, particles: ParticleSystem): void {
    const idx = this.bosses.indexOf(b);
    if (idx !== -1) this.bosses.splice(idx, 1);
    if (b.mesh && this.scene) this.scene.remove(b.mesh);
    for (const pm of b.partMeshes) {
      if (this.scene) this.scene.remove(pm);
    }

    particles.spawnBurst(b.position.x, b.position.y, b.position.z, b.def.colorSecondary, 36, 9, 12, 1.0, 1.8);
    this.onAnnouncement?.(`${b.def.name} has been defeated!`, '#69f0ae');

    for (const d of b.def.drops) {
      if (Math.random() <= d.chance) {
        const count = d.minCount + Math.floor(Math.random() * (d.maxCount - d.minCount + 1));
        if (count > 0) this.spawnDrop(b.position.x, b.position.y + 0.5, b.position.z, { itemId: d.itemId, count });
      }
    }
    this.onBossDefeated?.(b.def, b.position);
  }

  private trySpawnBiomeEnemy(world: WorldManager, playerPos: THREE.Vector3, isDay: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 14;
    const sx = playerPos.x + Math.cos(angle) * dist;
    const sz = playerPos.z + Math.sin(angle) * dist;
    let sy = playerPos.y;

    // Find valid air above solid ground near player altitude
    let found = false;
    for (let dy = 8; dy >= -10; dy--) {
      const y = Math.floor(playerPos.y + dy);
      if (y < 2 || y > 248) continue;
      const below = world.getBlock(sx, y - 1, sz);
      const at = world.getBlock(sx, y, sz);
      const above = world.getBlock(sx, y + 1, sz);
      if (isSolidBlock(below) && at === BlockId.Air && above === BlockId.Air) {
        sy = y;
        found = true;
        break;
      }
    }
    if (!found) sy = playerPos.y + 5;

    const biome: BiomeId = world.getBiomeAt(sx, sy, sz);
    const activeEv: EventId | null = world.meta.activeEvent;

    const candidates = ENEMIES.filter((e) => {
      if (e.hardmodeOnly && !world.meta.isHardmode) return false;
      if (e.postPlanteraOnly && !world.meta.defeatedBosses.includes('plantera')) return false;
      if (e.eventOnly) return e.eventOnly === activeEv;
      if (activeEv && Math.random() < 0.65) return false; // Favor event enemies during invasions
      if (e.timeRule === 'day' && !isDay) return false;
      if (e.timeRule === 'night' && isDay) return false;
      return e.biomes.includes(biome);
    });

    if (candidates.length === 0) return;
    const totalW = candidates.reduce((s, c) => s + c.rarityWeight, 0);
    let r = Math.random() * totalW;
    let pick = candidates[0];
    for (const c of candidates) {
      r -= c.rarityWeight;
      if (r <= 0) { pick = c; break; }
    }
    this.spawnEnemy(pick.id, new THREE.Vector3(sx, sy + 0.5, sz), world.meta.difficulty);
  }

  private updateEnemyAI(e: EnemyEntity, dt: number, world: WorldManager, playerPos: THREE.Vector3, dmgMult: number): void {
    e.aiTimer += dt;
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    const toPlayer = playerPos.clone().sub(e.position);
    const flatDir = new THREE.Vector3(toPlayer.x, 0, toPlayer.z);
    const flatDist = flatDir.length();
    if (flatDist > 0.01) flatDir.normalize();

    const ai = e.def.aiType;
    if (ai === 'slime') {
      e.velocity.y -= 24 * dt;
      if (e.grounded && e.aiTimer >= 1.1) {
        e.aiTimer = 0;
        e.velocity.y = e.def.jumpForce ?? 9;
        e.velocity.x = flatDir.x * e.def.speed;
        e.velocity.z = flatDir.z * e.def.speed;
        e.grounded = false;
      } else if (e.grounded) {
        e.velocity.x *= 0.85;
        e.velocity.z *= 0.85;
      }
    } else if (ai === 'flying' || ai === 'aquatic') {
      const desired = playerPos.clone().add(new THREE.Vector3(0, 1.3 + Math.sin(e.aiTimer * 2.5 + e.phaseAngle) * 1.1, 0)).sub(e.position);
      if (desired.lengthSq() > 0.1) desired.normalize().multiplyScalar(e.def.speed);
      e.velocity.lerp(desired, 4 * dt);
    } else if (ai === 'worm') {
      const target = playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
      const desired = target.sub(e.position).normalize().multiplyScalar(e.def.speed);
      e.velocity.lerp(desired, 2.6 * dt);
      e.position.addScaledVector(e.velocity, dt);
      // Chain segments smoothly
      let prev = e.position;
      for (let s = 0; s < e.wormSegments.length; s++) {
        const seg = e.wormSegments[s];
        const delta = prev.clone().sub(seg);
        if (delta.length() > 1.1) {
          seg.copy(prev.clone().sub(delta.normalize().multiplyScalar(1.1)));
        }
        prev = seg;
      }
    } else if (ai === 'caster') {
      e.velocity.y -= 22 * dt;
      if (e.aiTimer > 4.2 && flatDist > 3) {
        e.aiTimer = 0;
        const ang = Math.random() * Math.PI * 2;
        e.position.set(playerPos.x + Math.cos(ang) * 9, playerPos.y + 2, playerPos.z + Math.sin(ang) * 9);
      }
    } else {
      // Fighter / Unicorn / Antlion
      e.velocity.y -= 24 * dt;
      e.velocity.x = THREE.MathUtils.lerp(e.velocity.x, flatDir.x * e.def.speed, 6 * dt);
      e.velocity.z = THREE.MathUtils.lerp(e.velocity.z, flatDir.z * e.def.speed, 6 * dt);
      // Jump over 1-block walls
      const aheadBlocked = isSolidBlock(world.getBlock(e.position.x + flatDir.x * 0.8, e.position.y + 0.5, e.position.z + flatDir.z * 0.8));
      if (e.grounded && aheadBlocked) {
        e.velocity.y = e.def.jumpForce ?? 9.2;
        e.grounded = false;
      }
    }

    // Ranged enemy projectiles
    if (e.def.rangedProjectile && e.attackCooldown <= 0 && flatDist < 24) {
      e.attackCooldown = e.def.rangedCooldown ?? 2.4;
      const pDir = playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(e.position.clone().add(new THREE.Vector3(0, 0.9, 0))).normalize().multiplyScalar(18);
      this.spawnProjectile({
        kind: e.def.rangedProjectile,
        fromPlayer: false,
        damage: Math.round(e.def.damage * 0.8 * dmgMult),
        damageType: 'true',
        knockback: 2,
        position: e.position.clone().add(new THREE.Vector3(0, 0.9, 0)),
        velocity: pDir,
        gravity: e.def.rangedProjectile === 'sand_ball' ? 12 : 0,
        life: 3.0,
        maxLife: 3.0,
        pierce: 1,
        bounces: 0,
        homing: false,
        boomerangReturn: false,
      });
    }

    // Collision (non-worm)
    if (ai !== 'worm') {
      const nx = e.position.x + e.velocity.x * dt;
      const nz = e.position.z + e.velocity.z * dt;
      if (ai === 'flying' || !isSolidBlock(world.getBlock(nx, e.position.y + 0.5, e.position.z))) e.position.x = nx;
      else e.velocity.x *= -0.5;
      if (ai === 'flying' || !isSolidBlock(world.getBlock(e.position.x, e.position.y + 0.5, nz))) e.position.z = nz;
      else e.velocity.z *= -0.5;

      const ny = e.position.y + e.velocity.y * dt;
      if (ai !== 'flying' && isSolidBlock(world.getBlock(e.position.x, ny, e.position.z))) {
        if (e.velocity.y < 0) {
          e.grounded = true;
          e.position.y = Math.floor(ny) + 1.001;
        }
        e.velocity.y = 0;
      } else {
        e.position.y = ny;
        e.grounded = false;
      }
    }

    if (e.mesh) {
      e.mesh.position.copy(e.position);
      if (flatDist > 0.1) e.mesh.rotation.y = Math.atan2(flatDir.x, flatDir.z);
      if (ai === 'slime') {
        const sq = e.grounded ? 1 : 1.18;
        e.mesh.scale.set(1 / sq, sq, 1 / sq);
      }
      if (e.hurtFlash > 0) {
        e.hurtFlash = Math.max(0, e.hurtFlash - dt);
        e.mesh.scale.multiplyScalar(e.hurtFlash > 0 ? 1.06 : 1);
      }
      if (ai === 'worm') {
        for (let s = 1; s < e.mesh.children.length; s++) {
          const seg = e.wormSegments[s - 1];
          if (seg) {
            e.mesh.children[s].position.copy(seg.clone().sub(e.position));
          }
        }
      }
    }
  }

  private updateBossAI(b: BossEntity, dt: number, world: WorldManager, playerPos: THREE.Vector3, dmgMult: number, particles: ParticleSystem): void {
    b.aiTimer += dt;
    b.attackTimer -= dt;
    if (b.hp < b.maxHp * 0.5 && b.phase === 1) {
      b.phase = 2;
      this.onAnnouncement?.(`${b.def.name} enters Phase 2!`, '#ff5252');
      particles.spawnBurst(b.position.x, b.position.y, b.position.z, '#ff1744', 24, 8);
    }

    const pCenter = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = pCenter.clone().sub(b.position);
    const dist = dir.length();
    const normDir = dist > 0.01 ? dir.clone().normalize() : new THREE.Vector3(0, 0, 1);

    if (b.def.id === 'wall_of_flesh') {
      // Advances steadily along +X across the Underworld!
      const speed = b.phase === 2 ? 7.2 : 5.0;
      b.position.x += speed * dt;
      b.position.y = THREE.MathUtils.lerp(b.position.y, pCenter.y, 2 * dt);
      b.position.z = THREE.MathUtils.lerp(b.position.z, pCenter.z, 2 * dt);
      if (b.attackTimer <= 0) {
        b.attackTimer = b.phase === 2 ? 0.75 : 1.25;
        this.spawnProjectile({
          kind: 'laser_eye',
          fromPlayer: false,
          damage: Math.round(b.def.damage * 0.85 * dmgMult),
          damageType: 'true',
          knockback: 2,
          position: b.position.clone().add(new THREE.Vector3(1.5, 4, 0)),
          velocity: normDir.multiplyScalar(28),
          gravity: 0,
          life: 2.5,
          maxLife: 2.5,
          pierce: 1,
          bounces: 0,
          homing: false,
          boomerangReturn: false,
        });
      }
    } else if (b.def.id === 'king_slime' || b.def.id === 'queen_slime') {
      b.velocity.y -= 24 * dt;
      if (b.def.id === 'queen_slime' && b.phase === 2) {
        // Winged flying phase!
        const target = pCenter.clone().add(new THREE.Vector3(0, 6, 0)).sub(b.position).normalize().multiplyScalar(11);
        b.velocity.lerp(target, 4 * dt);
        b.position.addScaledVector(b.velocity, dt);
      } else {
        if (b.aiTimer > 1.8) {
          b.aiTimer = 0;
          b.velocity.y = 14;
          b.velocity.x = normDir.x * 11;
          b.velocity.z = normDir.z * 11;
        }
        b.position.addScaledVector(b.velocity, dt);
        if (isSolidBlock(world.getBlock(b.position.x, b.position.y, b.position.z))) {
          b.position.y = Math.floor(b.position.y) + 1.01;
          b.velocity.y = 0;
        }
      }
      if (b.attackTimer <= 0) {
        b.attackTimer = b.phase === 2 ? 1.5 : 2.6;
        if (b.def.id === 'king_slime' && this.enemies.length < 10) {
          this.spawnEnemy('blue_slime', b.position.clone().add(new THREE.Vector3(1, 2, 1)), world.meta.difficulty);
        } else {
          this.spawnProjectile({
            kind: 'regal_gel',
            fromPlayer: false,
            damage: Math.round(b.def.damage * 0.7 * dmgMult),
            damageType: 'true',
            knockback: 2,
            position: b.position.clone().add(new THREE.Vector3(0, 2, 0)),
            velocity: normDir.multiplyScalar(22),
            gravity: 6,
            life: 2.5,
            maxLife: 2.5,
            pierce: 1,
            bounces: 1,
            homing: false,
            boomerangReturn: false,
          });
        }
      }
    } else if (b.def.id === 'eater_of_worlds' || b.def.id === 'the_destroyer') {
      const spd = b.phase === 2 ? 15 : 11.5;
      const diveTarget = pCenter.clone().add(new THREE.Vector3(Math.cos(b.aiTimer * 0.9) * 8, Math.sin(b.aiTimer * 1.4) * 5, Math.sin(b.aiTimer * 0.9) * 8));
      const dVec = diveTarget.sub(b.position).normalize().multiplyScalar(spd);
      b.velocity.lerp(dVec, 3 * dt);
      b.position.addScaledVector(b.velocity, dt);

      let prev = b.position;
      for (let i = 0; i < b.subParts.length; i++) {
        const seg = b.subParts[i];
        const delta = prev.clone().sub(seg);
        if (delta.length() > 2.2) {
          seg.copy(prev.clone().sub(delta.normalize().multiplyScalar(2.2)));
        }
        prev = seg;
        if (b.partMeshes[i]) b.partMeshes[i].position.copy(seg);
      }

      if (b.attackTimer <= 0) {
        b.attackTimer = b.phase === 2 ? 1.0 : 1.7;
        this.spawnProjectile({
          kind: b.def.id === 'the_destroyer' ? 'laser_red' : 'vile_spit',
          fromPlayer: false,
          damage: Math.round(b.def.damage * 0.75 * dmgMult),
          damageType: 'true',
          knockback: 2,
          position: b.position.clone(),
          velocity: normDir.multiplyScalar(25),
          gravity: 0,
          life: 2.5,
          maxLife: 2.5,
          pierce: 1,
          bounces: 0,
          homing: false,
          boomerangReturn: false,
        });
      }
    } else {
      // Airborne Multi-Phase Boss Pattern (Eye of Cthulhu, Twins, Queen Bee, Skeletron, Plantera, Golem, Fishron, Empress, Cultist, Moon Lord)
      const hoverSpot = pCenter.clone().add(new THREE.Vector3(Math.cos(b.aiTimer * 1.2) * 11, 5.5 + Math.sin(b.aiTimer * 2) * 2.5, Math.sin(b.aiTimer * 1.2) * 11));
      const isDashing = b.aiTimer % 5.0 > 3.6;
      const targetVel = isDashing
        ? normDir.clone().multiplyScalar(b.phase === 2 ? 22 : 15)
        : hoverSpot.sub(b.position).normalize().multiplyScalar(b.phase === 2 ? 14 : 9.5);
      b.velocity.lerp(targetVel, 3.8 * dt);
      b.position.addScaledVector(b.velocity, dt);

      // Update articulated hands / twin twin-eye
      for (let i = 0; i < b.subParts.length; i++) {
        if (b.def.id === 'the_twins') {
          const twinHover = pCenter.clone().add(new THREE.Vector3(-Math.cos(b.aiTimer * 1.2) * 10, 4, -Math.sin(b.aiTimer * 1.2) * 10));
          b.subParts[i].lerp(twinHover, 2.5 * dt);
        } else {
          const side = i % 2 === 0 ? -1 : 1;
          const row = i >= 2 ? -2.5 : 1.0;
          const handTarget = b.position.clone().add(new THREE.Vector3(side * 4.2 + Math.sin(b.aiTimer * 3 + i) * 2, row + Math.cos(b.aiTimer * 2.5 + i) * 1.5, 1.5));
          b.subParts[i].lerp(handTarget, 7 * dt);
        }
        if (b.partMeshes[i]) b.partMeshes[i].position.copy(b.subParts[i]);
      }

      // Boss Projectile Barrage
      if (b.attackTimer <= 0) {
        b.attackTimer = b.phase === 2 ? 0.9 : 1.65;
        const volley = b.def.id === 'empress_of_light' || b.def.id === 'moon_lord' ? 3 : 1;
        for (let k = 0; k < volley; k++) {
          const spread = (k - (volley - 1) / 2) * 0.25;
          const vDir = normDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread).multiplyScalar(26);
          this.spawnProjectile({
            kind: b.def.id.includes('moon') ? 'phantasmal_bolt' : b.def.id.includes('empress') ? 'prismatic_bolt' : 'boss_bolt',
            fromPlayer: false,
            damage: Math.round(b.def.damage * 0.78 * dmgMult),
            damageType: 'true',
            knockback: 2,
            position: b.position.clone(),
            velocity: vDir,
            gravity: 0,
            life: 3.0,
            maxLife: 3.0,
            pierce: 1,
            bounces: 0,
            homing: false,
            boomerangReturn: false,
          });
        }
      }
    }

    if (b.mesh) {
      b.mesh.position.copy(b.position);
      b.mesh.lookAt(pCenter);
      if (b.def.id.includes('skeletron') && b.phase === 2) {
        b.mesh.rotation.z += b.aiTimer * 8;
      }
    }
  }

  public dispose(): void {
    if (!this.scene) return;
    for (const d of this.drops) if (d.mesh) this.scene.remove(d.mesh);
    for (const p of this.projectiles) if (p.mesh) this.scene.remove(p.mesh);
    for (const e of this.enemies) if (e.mesh) this.scene.remove(e.mesh);
    for (const b of this.bosses) {
      if (b.mesh) this.scene.remove(b.mesh);
      for (const pm of b.partMeshes) this.scene.remove(pm);
    }
    for (const m of this.minions) if (m.mesh) this.scene.remove(m.mesh);
    for (const n of this.npcs) if (n.mesh) this.scene.remove(n.mesh);
  }
}
