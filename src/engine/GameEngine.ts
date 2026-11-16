import * as THREE from 'three';
import { AudioEngine } from '@/audio/AudioEngine';
import { getBlockDef, isLiquidBlock, isSolidBlock } from '@/data/blocks';
import { getBossDef } from '@/data/bosses';
import { EVENTS } from '@/data/events';
import { getItemDef } from '@/data/items';
import { BAG_LOOT_TABLES } from '@/data/lootTables';
import { MODIFIERS } from '@/data/modifiers';
import { FishingFarmingSystem } from '@/systems/FishingFarmingSystem';
import { HousingSystem } from '@/systems/HousingSystem';
import { ComputedPlayerStats, InventorySystem } from '@/systems/InventorySystem';
import { SaveManager } from '@/systems/SaveManager';
import {
  ActiveBuff,
  BiomeId,
  BlockId,
  CharacterSave,
  ChestContents,
  EventId,
  GameSettings,
  JourneyPowersState,
  NpcDef,
  WorldSave,
} from '@/types/game';
import { WorldManager } from '@/world/WorldManager';
import { CameraController } from './CameraController';
import { BossHudInfo, EntityManager } from './EntityManager';
import { EnvironmentSystem } from './EnvironmentSystem';
import { FloatingNumber, ParticleSystem } from './ParticleSystem';
import { PlayerController, PlayerInputState } from './PlayerController';
import { PlayerAnimState, PlayerModel } from './PlayerModel';

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  breath: number;
  maxBreath: number;
  defense: number;
  biomeName: string;
  clockText: string;
  dayCount: number;
  weather: string;
  activeEventName: string | null;
  eventProgress: number;
  eventTarget: number;
  bossHud: BossHudInfo | null;
  activeBuffs: ActiveBuff[];
  selectedHotbar: number;
  targetLabel: string | null;
  targetMiningProgress: number;
  fps: number;
  coords: [number, number, number];
  isDead: boolean;
  respawnTimer: number;
  deathMessage: string;
  isHardmode: boolean;
  floatingNumbers: { text: string; x: number; y: number; color: string; crit: boolean; alpha: number }[];
  notifications: { id: number; text: string; color: string }[];
  nearbyNpc: NpcDef | null;
  openChest: ChestContents | null;
  stats: ComputedPlayerStats;
}

export class GameEngine {
  public readonly container: HTMLElement;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;

  public world: WorldManager;
  public char: CharacterSave;
  public worldSave: WorldSave;
  public settings: GameSettings;
  public saveManager: SaveManager;
  public audio: AudioEngine;

  public player: PlayerController;
  public playerModel: PlayerModel;
  public cameraCtrl: CameraController;
  public env: EnvironmentSystem;
  public particles: ParticleSystem;
  public entities: EntityManager;

  public journeyPowers: JourneyPowersState = {
    godmode: false,
    timeFrozen: false,
    timeRate: 1,
    spawnRateMult: 1,
    placementRangeBoost: false,
    weatherLocked: 'none',
  };

  public selectedHotbar = 0;
  public activeBuffs: ActiveBuff[] = [];
  public isDead = false;
  public respawnTimer = 0;
  public deathMessage = '';
  public paused = false;

  // Input & Actions
  private keys = new Set<string>();
  public touchMove = { x: 0, y: 0 };
  public touchJumpHeld = false;
  private touchJumpQueued = false;
  public touchPrimaryHeld = false;
  private jumpQueued = false;
  private dashQueued = false;
  private grappleQueued = false;
  private mountQueued = false;
  private primaryHeld = false;
  private secondaryHeld = false;
  private secondaryQueued = false;
  private lastDirTap = { key: '', time: 0 };
  private isDraggingLook = false;
  private lastPointer = { x: 0, y: 0 };

  // Mining & Use cooldown
  private useCooldown = 0;
  private miningTargetKey = '';
  private miningProgress = 0;
  private targetHighlightMesh: THREE.LineSegments;
  private miningOverlayMesh: THREE.Mesh;
  private miningOverlayMat: THREE.MeshBasicMaterial;
  private hookLine: THREE.Line;
  private currentFov: number;
  private tmpVecA = new THREE.Vector3();
  private tmpVecB = new THREE.Vector3();

  // Interactive State
  public openChest: ChestContents | null = null;
  public activeNpcDialog: NpcDef | null = null;
  public notifications: { id: number; text: string; color: string; ttl: number }[] = [];
  private notifId = 1;

  private rafId = 0;
  private lastFrameMs = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private autoSaveTimer = 0;
  private hudEmitAccum = 0;
  private footstepTimer = 0;
  private disposed = false;

  public onHudUpdate?: (hud: HudSnapshot) => void;
  public onOpenInventory?: () => void;
  public onToggleMap?: () => void;
  public onTogglePause?: () => void;
  public onToggleBestiary?: () => void;
  public onToggleJourney?: () => void;

  constructor(
    container: HTMLElement,
    char: CharacterSave,
    worldSave: WorldSave,
    settings: GameSettings,
    saveManager: SaveManager,
    audio: AudioEngine
  ) {
    this.container = container;
    this.char = char;
    this.worldSave = worldSave;
    this.settings = settings;
    this.saveManager = saveManager;
    this.audio = audio;

    this.scene = new THREE.Scene();
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.currentFov = settings.fov;
    this.camera = new THREE.PerspectiveCamera(settings.fov, w / h, 0.15, 280);

    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.graphicsPreset === 'high',
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.computePixelRatio(settings));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.world = new WorldManager(
      worldSave.meta,
      worldSave.chunkDeltas,
      worldSave.chests,
      worldSave.exploredChunks
    );
    this.world.initRenderer(this.scene, settings.ambientOcclusion, settings.shadows);

    this.env = new EnvironmentSystem(this.scene, settings.shadows, settings.graphicsPreset === 'high');
    this.env.setRenderDistance(settings.renderDistance);
    this.particles = new ParticleSystem(this.scene);
    this.particles.densityScale = settings.particleDensity;
    this.entities = new EntityManager();
    this.entities.initScene(this.scene);

    this.player = new PlayerController();
    const savedPos = worldSave.playerPositionsByChar[char.id];
    if (savedPos) {
      this.player.position.set(savedPos[0], savedPos[1], savedPos[2]);
    } else {
      const sy = this.world.findSafeSpawnY(worldSave.meta.spawnPoint[0], worldSave.meta.spawnPoint[2]);
      this.player.position.set(worldSave.meta.spawnPoint[0], sy, worldSave.meta.spawnPoint[2]);
      worldSave.meta.spawnPoint = [this.player.position.x, this.player.position.y, this.player.position.z];
    }

    this.playerModel = new PlayerModel(char.appearance);
    this.playerModel.root.position.copy(this.player.position);
    this.scene.add(this.playerModel.root);

    this.cameraCtrl = new CameraController();

    // Block target wireframe highlight + 3D mining progress overlay
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    this.targetHighlightMesh = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: '#ffd740', transparent: true, opacity: 0.9 })
    );
    this.targetHighlightMesh.visible = false;
    this.scene.add(this.targetHighlightMesh);

    this.miningOverlayMat = new THREE.MeshBasicMaterial({
      color: '#111111',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.miningOverlayMesh = new THREE.Mesh(new THREE.BoxGeometry(1.015, 1.015, 1.015), this.miningOverlayMat);
    this.miningOverlayMesh.visible = false;
    this.scene.add(this.miningOverlayMesh);

    // Grappling hook tether line
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.hookLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#b0bec5' }));
    this.hookLine.visible = false;
    this.scene.add(this.hookLine);

    // Preload spawn area synchronously so player stands on solid ground immediately!
    this.world.updateStreaming(this.player.position.x, this.player.position.z, Math.min(2, settings.renderDistance));
    if (this.player.position.y < 10) {
      this.player.position.y = this.world.findSafeSpawnY(this.player.position.x, this.player.position.z);
    }

    this.wireCallbacks();
    this.bindEvents();
    this.entities.syncTownNpcs(this.world, this.world.meta, this.char, this.player.position);
    this.notify(`Welcome to ${this.world.meta.name}!`, '#ffe082');
    if (this.char.inventory.every((s) => !s)) {
      this.notify('Empty hands! Chop trees & dig dirt, open Bag [E] to craft Wood tools!', '#69f0ae');
    }

    this.lastFrameMs = performance.now();
    this.loop(this.lastFrameMs);
  }

  private computePixelRatio(settings: GameSettings): number {
    const cap = settings.graphicsPreset === 'low' ? 1.0 : settings.graphicsPreset === 'medium' ? 1.4 : 1.75;
    const scale = Math.max(0.5, Math.min(1.0, settings.resolutionScale ?? 1.0));
    return Math.max(0.65, Math.min(window.devicePixelRatio || 1, cap) * scale);
  }

  private wireCallbacks(): void {
    this.player.onTakeDamage = (dmg, src, knock) => this.handlePlayerDamaged(dmg, src, knock);
    this.player.onSplash = () => this.audio.playSfx('splash');

    this.entities.onPlayerHit = (dmg, src, knock) => this.handlePlayerDamaged(dmg, src, knock);
    this.entities.onItemPickedUp = (itemId, count) => {
      const def = getItemDef(itemId);
      this.audio.playSfx(def?.category === 'coin' ? 'coin' : 'pickup');
      if (this.char.difficulty === 'journey' && count > 0) {
        this.char.researchedItems[itemId] = (this.char.researchedItems[itemId] ?? 0) + count;
      }
      if (itemId === 'wood') this.unlockAchievement('timber');
      if (itemId.endsWith('_ore')) this.unlockAchievement('ooo_shiny');
      if (itemId === 'terra_blade' || itemId === 'zenith') this.unlockAchievement('sword_of_the_hero');
    };
    this.entities.onAnnouncement = (text, color) => {
      this.notify(text, color ?? '#d580ff');
      if (text.includes('awoken')) this.audio.playSfx('boss_roar');
    };
    this.entities.onEnemyDefeated = (enemy) => {
      this.world.meta.bestiaryKills[enemy.id] = (this.world.meta.bestiaryKills[enemy.id] ?? 0) + 1;
      if (this.world.meta.activeEvent && !EVENTS[this.world.meta.activeEvent].isTimed) {
        this.world.meta.eventProgress++;
        if (this.world.meta.eventProgress >= this.world.meta.eventTarget) {
          const ev = EVENTS[this.world.meta.activeEvent];
          this.notify(ev.endAnnouncement, '#69f0ae');
          if (!this.world.meta.defeatedBosses.includes(ev.id)) {
            this.world.meta.defeatedBosses.push(ev.id);
          }
          if (ev.id === 'goblin_army') this.unlockAchievement('goblin_punter');
          if (ev.id === 'pirate_invasion') this.unlockAchievement('do_you_want_to_slay_a_snowman');
          this.world.meta.activeEvent = null;
        }
      }
    };
    this.entities.onBossDefeated = (boss) => {
      if (!this.world.meta.defeatedBosses.includes(boss.id)) {
        this.world.meta.defeatedBosses.push(boss.id);
      }
      this.entities.syncTownNpcs(this.world, this.world.meta, this.char, this.player.position);

      if (boss.id === 'king_slime') this.unlockAchievement('slippery_shinobi');
      if (boss.id === 'eye_of_cthulhu') this.unlockAchievement('eye_on_you');
      if (boss.id === 'eater_of_worlds' || boss.id === 'brain_of_cthulhu') this.unlockAchievement('worm_fodder');
      if (boss.id === 'queen_bee') this.unlockAchievement('sting_operation');
      if (boss.id === 'skeletron') this.unlockAchievement('boned');
      if (boss.id === 'wall_of_flesh') {
        this.unlockAchievement('still_hungry');
        if (!this.world.meta.isHardmode) {
          this.world.triggerHardmodeTransformation();
          this.unlockAchievement('its_hard');
          this.notify('The ancient spirits of Light and Dark have been released! HARDMODE BEGINS!', '#ff80ff');
          this.cameraCtrl.addShake(1.1);
        }
      }
      if (
        ['the_twins', 'the_destroyer', 'skeletron_prime'].every((id) =>
          this.world.meta.defeatedBosses.includes(id)
        )
      ) {
        this.unlockAchievement('buckets_of_bolts');
      }
      if (boss.id === 'plantera') this.unlockAchievement('the_great_southern_plantkill');
      if (boss.id === 'golem') this.unlockAchievement('temple_raider');
      if (boss.id === 'duke_fishron') this.unlockAchievement('fish_out_of_water');
      if (boss.id === 'empress_of_light') this.unlockAchievement('fae_flayer');
      if (boss.id === 'lunatic_cultist') {
        this.unlockAchievement('star_destroyer');
        this.startEvent('lunar_events');
      }
      if (boss.id === 'moon_lord') {
        this.world.meta.activeEvent = null;
        this.unlockAchievement('champion_of_terraria');
        this.notify('CONGRATULATIONS! You have defeated the Moon Lord and conquered Terraria 3D!', '#64ffda');
      }
    };

    this.world.onExplosion = (x, y, z, radius, damage) => {
      this.audio.playSfx('explosion');
      this.cameraCtrl.addShake(0.9);
      this.particles.spawnBurst(x, y, z, '#ff6d00', 28, 9, 10, 0.8, 1.5);
      const center = new THREE.Vector3(x, y, z);
      for (const e of [...this.entities.enemies]) {
        if (e.position.distanceTo(center) <= radius) {
          this.entities.damageTarget(e, damage, e.position.clone().sub(center).normalize(), 8, false, this.particles);
        }
      }
      for (const b of [...this.entities.bosses]) {
        if (b.position.distanceTo(center) <= radius + b.def.scale) {
          this.entities.damageTarget(b, damage, new THREE.Vector3(0, 1, 0), 0, false, this.particles);
        }
      }
      if (this.player.position.distanceTo(center) <= radius) {
        this.handlePlayerDamaged(Math.round(damage * 0.5), 'Explosion', this.player.position.clone().sub(center).normalize());
      }
    };

    this.world.onDartTrapFire = (x, y, z) => {
      const dir = this.player.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)).normalize().multiplyScalar(22);
      this.entities.spawnProjectile({
        kind: 'poison_dart',
        fromPlayer: false,
        damage: 25,
        damageType: 'true',
        knockback: 2,
        position: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
        velocity: dir,
        gravity: 2,
        life: 2.0,
        maxLife: 2.0,
        pierce: 1,
        bounces: 0,
        homing: false,
        boomerangReturn: false,
      });
    };

    this.world.onSpecialBlockTriggered = (kind) => {
      if (kind === 'life_crystal') this.unlockAchievement('heart_breaker');
      if (kind === 'shadow_orb' || kind === 'crimson_heart') {
        const count = this.world.meta.orbsSmashed;
        if (count === 1) this.notify('A horrible chill goes down your spine...', '#b388ff');
        else if (count === 2) this.notify('Screams echo around you...', '#b388ff');
        else if (count % 3 === 0) {
          const bossId = kind === 'shadow_orb' ? 'eater_of_worlds' : 'brain_of_cthulhu';
          this.entities.spawnBoss(bossId, this.player.position, this.world.meta.difficulty);
        }
      }
      if (kind === 'altar_smashed') {
        this.unlockAchievement('begone_evil');
        const tiers = ['Cobalt/Palladium', 'Mythril/Orichalcum', 'Adamantite/Titanium'];
        const t = tiers[(this.world.meta.altarsSmashed - 1) % 3];
        this.notify(`Your world has been blessed with ${t} Ore!`, '#69f0ae');
      }
      if (kind === 'larva') {
        this.entities.spawnBoss('queen_bee', this.player.position, this.world.meta.difficulty);
      }
      if (kind === 'plantera_bulb') {
        this.entities.spawnBoss('plantera', this.player.position, this.world.meta.difficulty);
      }
    };
  }

  public notify(text: string, color = '#ffffff'): void {
    this.notifications.push({ id: this.notifId++, text, color, ttl: 5.5 });
    if (this.notifications.length > 6) this.notifications.shift();
  }

  public unlockAchievement(id: string): void {
    if (!this.char.unlockedAchievements.includes(id)) {
      this.char.unlockedAchievements.push(id);
      this.notify(`Achievement Unlocked: ${id.replace(/_/g, ' ').toUpperCase()}`, '#ffd740');
    }
  }

  public startEvent(eventId: EventId): void {
    const ev = EVENTS[eventId];
    if (!ev) return;
    this.world.meta.activeEvent = eventId;
    this.world.meta.eventProgress = 0;
    this.world.meta.eventTarget = ev.defaultTargetKills;
    this.notify(ev.announcement, '#ff80ab');
  }

  public handlePlayerDamaged(rawDamage: number, source: string, knockDir?: THREE.Vector3): void {
    if (this.isDead || this.player.invulnTimer > 0 || this.journeyPowers.godmode) return;
    const stats = InventorySystem.computePlayerStats(this.char, this.activeBuffs);
    const diffMult = this.world.meta.difficulty === 'expert' || this.world.meta.difficulty === 'master' ? 0.75 : 0.5;
    let dmg = Math.max(1, Math.round(rawDamage - stats.defense * diffMult));
    if (this.activeBuffs.some((b) => b.id === 'endurance')) dmg = Math.max(1, Math.round(dmg * 0.9));

    this.char.hp = Math.max(0, this.char.hp - dmg);
    this.player.invulnTimer = 0.65;
    this.playerModel.triggerHurt();
    this.audio.playSfx('player_hurt');
    this.cameraCtrl.addShake(0.35);
    this.particles.spawnFloatingNumber(
      this.player.position.x,
      this.player.position.y + 2.0,
      this.player.position.z,
      `-${dmg}`,
      '#ff3b3b',
      false
    );

    if (knockDir && !stats.knockbackImmune) {
      this.player.velocity.x = knockDir.x * 8;
      this.player.velocity.z = knockDir.z * 8;
      this.player.velocity.y = Math.max(this.player.velocity.y, 4.5);
    }

    if (this.char.hp <= 0) {
      this.handleDeath(source);
    }
  }

  private handleDeath(source: string): void {
    this.isDead = true;
    this.respawnTimer = this.entities.bosses.length > 0 ? 10 : 5;
    this.deathMessage = `${this.char.name} was slain by ${source}.`;
    this.particles.spawnBurst(this.player.position.x, this.player.position.y + 1, this.player.position.z, '#ef5350', 28, 7);

    // Place Tombstone on ground below
    const tx = Math.floor(this.player.position.x);
    const ty = Math.floor(this.player.position.y);
    const tz = Math.floor(this.player.position.z);
    if (this.world.getBlock(tx, ty, tz) === BlockId.Air && isSolidBlock(this.world.getBlock(tx, ty - 1, tz))) {
      this.world.setBlock(tx, ty, tz, BlockId.Tombstone);
    }

    if (this.char.difficulty === 'classic') {
      const total = InventorySystem.getTotalCopper(this.char);
      const dropAmt = Math.floor(total * 0.5);
      if (dropAmt > 0) {
        InventorySystem.spendCopper(this.char, dropAmt);
        this.entities.spawnDrop(this.player.position.x, this.player.position.y, this.player.position.z, { itemId: 'copper_coin', count: dropAmt });
      }
    } else if (this.char.difficulty === 'mediumcore') {
      for (let i = 0; i < this.char.inventory.length; i++) {
        const s = this.char.inventory[i];
        if (s) {
          this.entities.spawnDrop(this.player.position.x, this.player.position.y, this.player.position.z, s);
          this.char.inventory[i] = null;
        }
      }
    }
  }

  public respawnPlayer(): void {
    const stats = InventorySystem.computePlayerStats(this.char, this.activeBuffs);
    this.isDead = false;
    this.char.hp = Math.round(stats.maxHp * 0.5);
    this.char.mana = stats.maxMana;
    const [sx, , sz] = this.world.meta.spawnPoint;
    const sy = this.world.findSafeSpawnY(sx, sz);
    this.player.position.set(sx, sy, sz);
    this.player.velocity.set(0, 0, 0);
    this.player.fallStartY = null;
  }

  public addBuff(id: ActiveBuff['id'], duration: number): void {
    const existing = this.activeBuffs.find((b) => b.id === id);
    if (existing) existing.remaining = Math.max(existing.remaining, duration);
    else this.activeBuffs.push({ id, remaining: duration });
  }

  public queueTouchJump(pressed: boolean): void {
    if (pressed && !this.touchJumpHeld) this.touchJumpQueued = true;
    this.touchJumpHeld = pressed;
  }

  public triggerQuickHeal(): void {
    if (this.isDead || this.activeBuffs.some((b) => b.id === 'potion_sickness')) return;
    const idx = this.char.inventory.findIndex((s) => s && (getItemDef(s.itemId)?.healHp ?? 0) > 0);
    if (idx !== -1) {
      this.consumeInventoryStack(idx);
    }
  }

  public triggerQuickMana(): void {
    const idx = this.char.inventory.findIndex((s) => s && (getItemDef(s.itemId)?.healMana ?? 0) > 0);
    if (idx !== -1) {
      this.consumeInventoryStack(idx);
    }
  }

  public triggerSecondaryAction(): void {
    this.secondaryQueued = true;
  }

  public triggerDash(): void {
    this.dashQueued = true;
  }

  public triggerGrapple(): void {
    this.grappleQueued = true;
  }

  public triggerMount(): void {
    this.mountQueued = true;
  }

  public consumeInventoryStack(slotIdx: number): void {
    const stack = this.char.inventory[slotIdx];
    if (!stack) return;
    const def = getItemDef(stack.itemId);
    if (!def) return;
    const stats = InventorySystem.computePlayerStats(this.char, this.activeBuffs);

    if (def.healHp) {
      if (this.activeBuffs.some((b) => b.id === 'potion_sickness')) {
        this.notify('Potion Sickness active!', '#ff8a65');
        return;
      }
      this.char.hp = Math.min(stats.maxHp, this.char.hp + def.healHp);
      this.addBuff('potion_sickness', 45);
      this.audio.playSfx('potion');
      this.particles.spawnFloatingNumber(this.player.position.x, this.player.position.y + 2, this.player.position.z, `+${def.healHp}`, '#69f0ae');
      this.decrementSlot(slotIdx);
    } else if (def.healMana) {
      this.char.mana = Math.min(stats.maxMana, this.char.mana + def.healMana);
      this.audio.playSfx('potion');
      this.particles.spawnFloatingNumber(this.player.position.x, this.player.position.y + 2, this.player.position.z, `+${def.healMana} MP`, '#40c4ff');
      this.decrementSlot(slotIdx);
    } else if (def.grantsBuff) {
      this.addBuff(def.grantsBuff.id, def.grantsBuff.duration);
      this.audio.playSfx('potion');
      this.notify(`Applied ${def.name}`, '#80d8ff');
      this.decrementSlot(slotIdx);
    } else if (def.permanentLifeUp) {
      if (def.id === 'life_crystal' && this.char.maxHp < 400) {
        this.char.maxHp = Math.min(400, this.char.maxHp + 20);
        this.char.hp = Math.min(this.char.maxHp, this.char.hp + 20);
        this.char.lifeCrystalsUsed++;
        this.audio.playSfx('craft');
        this.notify(`Max Life increased to ${this.char.maxHp}!`, '#ff80ab');
        this.decrementSlot(slotIdx);
      } else if (def.id === 'life_fruit' && this.char.maxHp >= 400 && this.char.maxHp < 500) {
        this.char.maxHp = Math.min(500, this.char.maxHp + 5);
        this.char.hp = Math.min(this.char.maxHp, this.char.hp + 5);
        this.char.lifeFruitsUsed++;
        this.audio.playSfx('craft');
        this.notify(`Max Life increased to ${this.char.maxHp}!`, '#c6ff00');
        this.decrementSlot(slotIdx);
      }
    } else if (def.permanentManaUp) {
      if (this.char.maxMana < 200) {
        this.char.maxMana = Math.min(200, this.char.maxMana + 20);
        this.char.mana = this.char.maxMana;
        this.char.manaCrystalsUsed++;
        this.audio.playSfx('craft');
        this.notify(`Max Mana increased to ${this.char.maxMana}!`, '#40c4ff');
        this.decrementSlot(slotIdx);
      }
    } else if (def.summonsBoss) {
      const bossDef = getBossDef(def.summonsBoss);
      if (bossDef?.spawnTime === 'night' && this.env.isDaytime(this.world.meta.timeOfDay)) {
        this.notify(`${bossDef.name} can only be summoned at Night!`, '#ff8a65');
        return;
      }
      this.entities.spawnBoss(def.summonsBoss, this.player.position, this.world.meta.difficulty);
      if (def.maxStack > 1) this.decrementSlot(slotIdx);
    } else if (def.triggersEvent) {
      this.startEvent(def.triggersEvent);
      this.decrementSlot(slotIdx);
    } else if (def.opensBagLootId) {
      const table = BAG_LOOT_TABLES[def.opensBagLootId];
      if (table) {
        for (const entry of table) {
          if (Math.random() <= entry.chance) {
            const count = entry.min + Math.floor(Math.random() * (entry.max - entry.min + 1));
            InventorySystem.addItem(this.char, entry.itemId, count);
          }
        }
        this.audio.playSfx('craft');
        this.notify(`Opened ${def.name}!`, '#ffd740');
        this.decrementSlot(slotIdx);
      }
    } else if (def.id === 'recall_potion' || def.id === 'magic_mirror') {
      const [sx, , sz] = this.world.meta.spawnPoint;
      const sy = this.world.findSafeSpawnY(sx, sz);
      this.player.position.set(sx, sy, sz);
      this.player.velocity.set(0, 0, 0);
      this.audio.playSfx('magic_cast');
      this.particles.spawnBurst(sx, sy + 1, sz, '#80d8ff', 22, 6);
      if (def.id === 'recall_potion') this.decrementSlot(slotIdx);
    }
  }

  private decrementSlot(slotIdx: number): void {
    const s = this.char.inventory[slotIdx];
    if (!s) return;
    s.count--;
    if (s.count <= 0) this.char.inventory[slotIdx] = null;
  }

  private handlePrimaryAction(dt: number, stats: ComputedPlayerStats): void {
    const stack = this.char.inventory[this.selectedHotbar];
    const def = stack ? getItemDef(stack.itemId) : undefined;
    const rangeBoost = this.journeyPowers.placementRangeBoost ? 5 : 0;
    const maxReach = (def?.toolRange ?? 6) + rangeBoost;
    const hit = this.world.raycastBlock(this.cameraCtrl.aimOrigin, this.cameraCtrl.aimDirection, maxReach);

    // Combat Weapon Swing / Fire
    if (def && def.category === 'weapon') {
      if (this.useCooldown > 0) return;
      const mod = stack?.modifier ? MODIFIERS[stack.modifier] : undefined;
      const useTime = (def.useTime ?? 0.35) / ((mod?.speedMult ?? 1) * (def.damageType === 'melee' ? stats.meleeSpeedMult : 1));
      this.useCooldown = Math.max(0.06, useTime);

      const classMult =
        def.damageType === 'melee' ? stats.meleeDamageMult :
        def.damageType === 'ranged' ? stats.rangedDamageMult :
        def.damageType === 'magic' ? stats.magicDamageMult :
        stats.summonDamageMult;

      let baseDmg = (def.damage ?? 10) * (mod?.damageMult ?? 1) * classMult;
      const critChance = (def.critChance ?? 4) + (mod?.critBonus ?? 0) + stats.critChanceBonus;
      const kb = (def.knockback ?? 3) * (mod?.knockbackMult ?? 1);

      // Mana check
      if (def.manaCost && def.manaCost > 0) {
        const freeSpaceGun = def.id === 'space_gun' && stats.activeSetId === 'meteor_set';
        const cost = freeSpaceGun ? 0 : Math.max(1, Math.round(def.manaCost * stats.manaCostMult * (mod?.manaCostMult ?? 1)));
        if (this.char.mana < cost) return;
        this.char.mana -= cost;
      }

      // Ammo check
      let projKind = def.projectileId ?? 'arrow_wood';
      if (def.consumesAmmo) {
        const ammoStack = InventorySystem.findAmmoForWeapon(this.char, def.consumesAmmo);
        if (!ammoStack) {
          this.notify(`Out of ${def.consumesAmmo}s!`, '#ff8a65');
          return;
        }
        const ammoDef = getItemDef(ammoStack.itemId);
        baseDmg += (ammoDef?.damage ?? 0) * classMult;
        if (ammoDef?.projectileId && def.id !== 'molten_fury') {
          projKind = ammoDef.projectileId;
        }
        InventorySystem.consumeItem(this.char, ammoStack.itemId, 1);
      }

      const origin = this.player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const fwd = this.cameraCtrl.aimDirection.clone().normalize();
      this.player.facingYaw = Math.atan2(fwd.x, fwd.z);

      if (def.weaponType === 'summon_minion') {
        this.playerModel.triggerAction('aim', useTime);
        this.audio.playSfx('magic_cast');
        this.entities.summonMinion(projKind, Math.round(baseDmg), this.player.position, stats.maxMinions);
        return;
      }

      if (def.weaponType === 'broadsword' || def.weaponType === 'shortsword' || def.weaponType === 'spear' || def.weaponType === 'whip') {
        this.playerModel.triggerAction(def.weaponType === 'spear' ? 'thrust' : 'swing', useTime);
        this.audio.playSfx('sword_swing');
        const reach = def.weaponType === 'whip' ? 6.2 : def.weaponType === 'spear' ? 4.4 : 3.5;
        this.entities.performMeleeSweep(origin, fwd, reach, baseDmg, kb, critChance, this.particles);
      } else {
        this.playerModel.triggerAction('aim', useTime);
        this.audio.playSfx(def.damageType === 'magic' ? 'magic_cast' : def.weaponType === 'gun' ? 'gun_shot' : 'bow_shoot');
      }

      if (def.projectileId || def.consumesAmmo) {
        const count = def.projectileCount ?? 1;
        const spread = def.spreadAngle ?? 0;
        const spd = def.projectileSpeed ?? 34;
        for (let i = 0; i < count; i++) {
          const ang = (Math.random() - 0.5) * spread * 2;
          const v = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).multiplyScalar(spd);
          const crit = Math.random() * 100 < critChance;
          this.entities.spawnProjectile({
            kind: projKind,
            fromPlayer: true,
            damage: crit ? Math.round(baseDmg * 2) : Math.round(baseDmg),
            damageType: def.damageType ?? 'ranged',
            knockback: kb,
            position: origin.clone().addScaledVector(fwd, 0.7),
            velocity: v,
            gravity: def.weaponType === 'bow' || def.weaponType === 'throwing' ? 14 : 0,
            life: def.weaponType === 'boomerang' ? 1.4 : def.weaponType === 'magic_beam' ? 0.55 : 2.2,
            maxLife: def.weaponType === 'boomerang' ? 1.4 : 2.2,
            pierce: projKind.includes('zenith') || projKind.includes('terra') || projKind.includes('jester') || projKind.includes('prism') ? 6 : 1,
            bounces: projKind.includes('water_bolt') ? 5 : 0,
            homing: projKind.includes('chlorophyte') || projKind.includes('typhoon') || projKind.includes('nebula'),
            boomerangReturn: def.weaponType === 'boomerang',
            explosiveRadius: def.id === 'grenade' || projKind.includes('hellfire') ? 2 : undefined,
          });
        }
      }
      return;
    }

    // Fishing Rod
    if (def?.fishingPower && this.useCooldown <= 0) {
      this.useCooldown = 0.75;
      const waterHit = this.world.raycastBlock(this.cameraCtrl.aimOrigin, this.cameraCtrl.aimDirection, 14, true);
      if (waterHit.hit) {
        const res = FishingFarmingSystem.castLine(this.world, this.char, def.fishingPower, waterHit.bx, waterHit.by, waterHit.bz);
        this.audio.playSfx('splash');
        if (res.summonDukeFishron) {
          this.entities.spawnBoss('duke_fishron', this.player.position, this.world.meta.difficulty);
        } else if (res.caughtItemId) {
          InventorySystem.addItem(this.char, res.caughtItemId, res.caughtCount ?? 1);
          this.unlockAchievement('servin_up_mercy');
          this.notify(res.message, '#80d8ff');
        } else {
          this.notify(res.message, '#ffab40');
        }
      }
      return;
    }

    // Consumable / Boss Summon in Hotbar
    if (def && (def.healHp || def.healMana || def.grantsBuff || def.permanentLifeUp || def.permanentManaUp || def.summonsBoss || def.triggersEvent || def.opensBagLootId || def.id === 'magic_mirror' || def.id === 'recall_potion')) {
      if (this.useCooldown <= 0) {
        this.useCooldown = 0.4;
        this.consumeInventoryStack(this.selectedHotbar);
      }
      return;
    }

    // Bare-handed / Tool Melee Combat when an enemy/boss is on the aim ray closer than target block!
    const aimOrigin = this.tmpVecA.set(this.player.position.x, this.player.position.y + 1.35, this.player.position.z);
    const aimFwd = this.tmpVecB.copy(this.cameraCtrl.aimDirection).normalize();
    const maxEnemyReach = hit.hit ? Math.min(3.3, hit.distance + 0.45) : 3.3;
    if (this.hasEnemyOnAimRay(aimOrigin, aimFwd, maxEnemyReach)) {
      if (this.useCooldown <= 0) {
        this.useCooldown = 0.3;
        this.player.facingYaw = Math.atan2(aimFwd.x, aimFwd.z);
        this.playerModel.triggerAction('swing', 0.26);
        this.audio.playSfx('sword_swing');
        const punchDmg = def && (def.pickPower || def.axePower || def.hammerPower) ? 7 : 5;
        this.entities.performMeleeSweep(aimOrigin, aimFwd, 3.4, punchDmg, 3.4, 5, this.particles);
      }
      return;
    }

    // Mining Blocks! (Works with Pickaxes, Axes, Hammers, or hand-mining soft blocks like dirt/wood/plants!)
    if (hit.hit) {
      const pickPower = def?.pickPower ?? (this.findBestToolPower('pick'));
      const axePower = def?.axePower ?? (this.findBestToolPower('axe'));
      const hammerPower = def?.hammerPower ?? (this.findBestToolPower('hammer'));

      const k = `${hit.bx},${hit.by},${hit.bz}`;
      if (this.miningTargetKey !== k) {
        this.miningTargetKey = k;
        this.miningProgress = 0;
      }

      const bDef = getBlockDef(hit.blockId);
      const speedMult = (def?.toolSpeed ?? 2.8) * (def?.pickPower ? 1 + def.pickPower / 120 : 1.0);
      this.miningProgress += (dt * speedMult) / Math.max(0.25, bDef.hardness);

      if (this.useCooldown <= 0) {
        this.useCooldown = 0.22;
        this.playerModel.triggerAction('mine', 0.22);
        this.audio.playSfx('dig');
        this.particles.spawnBurst(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5, bDef.mapColor === 'transparent' ? '#ccc' : bDef.mapColor, 3, 2.5);
      }

      if (this.miningProgress >= 1.0) {
        this.miningProgress = 0;
        const res = this.world.mineBlock(hit.bx, hit.by, hit.bz, pickPower, axePower, hammerPower);
        if (res.broken) {
          this.audio.playSfx('break_block');
          this.particles.spawnBurst(hit.bx + 0.5, hit.by + 0.5, hit.bz + 0.5, bDef.mapColor === 'transparent' ? '#ccc' : bDef.mapColor, 10, 4);
          for (const drop of res.drops) {
            this.entities.spawnDrop(hit.bx + 0.5, hit.by + 0.3, hit.bz + 0.5, { itemId: drop.itemId, count: drop.count });
          }
        } else if (res.reason) {
          this.notify(res.reason, '#ff8a65');
        }
      }
    } else {
      this.miningProgress = 0;
    }
  }

  private findBestToolPower(kind: 'pick' | 'axe' | 'hammer'): number {
    let best = 0;
    for (const s of this.char.inventory) {
      if (!s) continue;
      const d = getItemDef(s.itemId);
      if (!d) continue;
      if (kind === 'pick' && d.pickPower) best = Math.max(best, d.pickPower);
      if (kind === 'axe' && d.axePower) best = Math.max(best, d.axePower);
      if (kind === 'hammer' && d.hammerPower) best = Math.max(best, d.hammerPower);
    }
    return best;
  }

  private hasEnemyOnAimRay(origin: THREE.Vector3, fwd: THREE.Vector3, maxDist: number): boolean {
    for (const e of this.entities.enemies) {
      const dx = e.position.x - origin.x;
      const dy = e.position.y + e.def.size[1] * 0.5 - origin.y;
      const dz = e.position.z - origin.z;
      const proj = dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (proj < -0.2 || proj > maxDist) continue;
      const px = dx - fwd.x * proj;
      const py = dy - fwd.y * proj;
      const pz = dz - fwd.z * proj;
      const r = e.def.size[0] * 0.65 + 0.55;
      if (px * px + py * py + pz * pz <= r * r) return true;
    }
    for (const b of this.entities.bosses) {
      const dx = b.position.x - origin.x;
      const dy = b.position.y - origin.y;
      const dz = b.position.z - origin.z;
      const proj = dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (proj < -0.4 || proj > maxDist + 1.0) continue;
      const px = dx - fwd.x * proj;
      const py = dy - fwd.y * proj;
      const pz = dz - fwd.z * proj;
      const r = b.def.scale * 0.75 + 0.65;
      if (px * px + py * py + pz * pz <= r * r) return true;
    }
    return false;
  }

  private handleSecondaryAction(stats: ComputedPlayerStats): void {
    // 1. Check nearby NPC interaction
    for (const npc of this.entities.npcs) {
      if (npc.position.distanceTo(this.player.position) < 4.5) {
        this.activeNpcDialog = npc.def;
        this.audio.playSfx('ui_click');
        return;
      }
    }

    const rangeBoost = this.journeyPowers.placementRangeBoost ? 5 : 0;
    const hit = this.world.raycastBlock(this.cameraCtrl.aimOrigin, this.cameraCtrl.aimDirection, 6.5 + rangeBoost);

    // 2. Interact with target block (Chest, Door, Lever, Bed, Boss Altar)
    if (hit.hit) {
      const b = hit.blockId;
      const bDef = getBlockDef(b);
      if (b === BlockId.LockedGoldChest) {
        if (InventorySystem.consumeItem(this.char, 'golden_key', 1)) {
          this.world.setBlock(hit.bx, hit.by, hit.bz, BlockId.GoldChest);
          this.openChest = this.world.getOrCreateChest(hit.bx, hit.by, hit.bz);
          this.audio.playSfx('craft');
          return;
        } else {
          this.notify('Locked! Requires a Golden Key from Dungeon enemies.', '#ffd740');
          return;
        }
      }
      if (b === BlockId.ShadowChest) {
        if (InventorySystem.countItem(this.char, 'shadow_key') <= 0) {
          this.notify('Locked! Requires a Shadow Key from the Dungeon.', '#b388ff');
          return;
        }
      }
      if (bDef.isContainer) {
        this.openChest = this.world.getOrCreateChest(hit.bx, hit.by, hit.bz);
        this.audio.playSfx('ui_click');
        return;
      }
      if (b === BlockId.WoodDoorClosed) {
        this.world.setBlock(hit.bx, hit.by, hit.bz, BlockId.WoodDoorOpen);
        this.audio.playSfx('place_block');
        return;
      }
      if (b === BlockId.WoodDoorOpen) {
        this.world.setBlock(hit.bx, hit.by, hit.bz, BlockId.WoodDoorClosed);
        this.audio.playSfx('place_block');
        return;
      }
      if (b === BlockId.LihzahrdDoorClosed) {
        if (InventorySystem.consumeItem(this.char, 'temple_key', 1)) {
          this.world.setBlock(hit.bx, hit.by, hit.bz, BlockId.LihzahrdDoorOpen);
          this.audio.playSfx('craft');
        } else {
          this.notify('Requires a Temple Key from Plantera!', '#ffab00');
        }
        return;
      }
      if (b === BlockId.Lever) {
        this.world.triggerMechanism(hit.bx, hit.by, hit.bz);
        this.audio.playSfx('ui_click');
        return;
      }
      if (b === BlockId.LihzahrdAltar && InventorySystem.consumeItem(this.char, 'lihzahrd_power_cell', 1)) {
        this.entities.spawnBoss('golem', this.player.position, this.world.meta.difficulty);
        return;
      }
      if (b === BlockId.Bed) {
        this.world.meta.spawnPoint = [hit.bx + 0.5, hit.by + 1.2, hit.bz + 0.5];
        this.notify('Spawn point set!', '#80d8ff');
        return;
      }
    }

    // 3. Place block / plant acorn / use held item
    const stack = this.char.inventory[this.selectedHotbar];
    if (!stack) return;
    const def = getItemDef(stack.itemId);
    if (!def) return;

    if (hit.hit && (def.placesBlock !== undefined || def.id === 'acorn' || ['daybloom', 'moonglow', 'blinkroot', 'waterleaf', 'fireblossom', 'shiverthorn', 'deathweed'].includes(def.id))) {
      const px = hit.bx + hit.nx;
      const py = hit.by + hit.ny;
      const pz = hit.bz + hit.nz;
      if (py <= 0 || py >= 254) return;

      // Prevent placing inside player AABB if solid
      if (def.placesBlock !== undefined) {
        const placeDef = getBlockDef(def.placesBlock);
        if (placeDef.solid) {
          const overlaps =
            px + 1 > this.player.position.x - this.player.halfWidth &&
            px < this.player.position.x + this.player.halfWidth &&
            py + 1 > this.player.position.y &&
            py < this.player.position.y + this.player.height &&
            pz + 1 > this.player.position.z - this.player.halfWidth &&
            pz < this.player.position.z + this.player.halfWidth;
          if (overlaps) return;
        }
        if (this.world.getBlock(px, py, pz) === BlockId.Air || isLiquidBlock(this.world.getBlock(px, py, pz))) {
          this.world.setBlock(px, py, pz, def.placesBlock);
          this.audio.playSfx('place_block');
          this.playerModel.triggerAction('swing', 0.2);
          if (def.placesBlock === BlockId.WorkBench) this.unlockAchievement('benched');
          if (!this.journeyPowers.godmode) this.decrementSlot(this.selectedHotbar);
        }
      } else {
        if (FishingFarmingSystem.tryPlantAcornOrHerb(this.world, def.id, px, py, pz)) {
          this.audio.playSfx('place_block');
          this.decrementSlot(this.selectedHotbar);
        }
      }
    } else if (def.healHp || def.healMana || def.grantsBuff || def.permanentLifeUp || def.permanentManaUp || def.summonsBoss || def.triggersEvent || def.opensBagLootId || def.id === 'magic_mirror' || def.id === 'recall_potion') {
      this.consumeInventoryStack(this.selectedHotbar);
    }
    void stats;
  }

  private updateBuffs(dt: number, stats: ComputedPlayerStats): void {
    for (let i = this.activeBuffs.length - 1; i >= 0; i--) {
      const b = this.activeBuffs[i];
      b.remaining -= dt;
      if (b.id === 'on_fire' && !stats.fireBlockImmune) {
        this.char.hp = Math.max(1, this.char.hp - dt * 4);
      }
      if (b.remaining <= 0) {
        this.activeBuffs.splice(i, 1);
      }
    }

    // Check nearby Campfire buff
    const ix = Math.floor(this.player.position.x);
    const iy = Math.floor(this.player.position.y);
    const iz = Math.floor(this.player.position.z);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (this.world.getBlock(ix + dx, iy + dy, iz + dz) === BlockId.Campfire) {
            this.addBuff('campfire', 2.5);
            return;
          }
        }
      }
    }
  }

  private loop = (nowMs: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    // Optional battery-saver FPS cap (30/60); 120 or 0 runs unthrottled at native display refresh rate!
    const targetFps = this.settings.targetFps ?? 120;
    if (targetFps > 0 && targetFps < 100) {
      const minIntervalMs = 1000 / targetFps - 1.5;
      if (nowMs - this.lastFrameMs < minIntervalMs) return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;

    // FPS meter
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.char.playTimeSeconds += dt;
    this.useCooldown = Math.max(0, this.useCooldown - dt);

    const stats = InventorySystem.computePlayerStats(this.char, this.activeBuffs);
    this.updateBuffs(dt, stats);

    // HP & Mana Natural Regeneration
    if (!this.isDead) {
      this.char.hp = Math.min(stats.maxHp, this.char.hp + stats.hpRegenPerSec * dt);
      const manaBoost = Math.hypot(this.player.velocity.x, this.player.velocity.z) < 0.5 ? 1.8 : 1.0;
      this.char.mana = Math.min(stats.maxMana, this.char.mana + stats.manaRegenPerSec * manaBoost * dt);
    } else {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnPlayer();
      }
    }

    // Stream chunks around player
    this.world.updateStreaming(this.player.position.x, this.player.position.z, this.settings.renderDistance);
    this.world.tickSimulation(dt);

    // Player Physics & Input
    let hSpeed = 0;
    if (!this.isDead) {
      const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + this.touchMove.y;
      const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.touchMove.x;
      const input: PlayerInputState = {
        forward: THREE.MathUtils.clamp(forward, -1, 1),
        strafe: THREE.MathUtils.clamp(strafe, -1, 1),
        jumpHeld: this.keys.has('Space') || this.touchJumpHeld,
        jumpPressed: this.jumpQueued || this.touchJumpQueued,
        crouchHeld: this.keys.has('KeyC') || this.keys.has('ControlLeft'),
        dashPressed: this.dashQueued,
        grapplePressed: this.grappleQueued,
        mountTogglePressed: this.mountQueued,
        yaw: this.cameraCtrl.yaw,
        pitch: this.cameraCtrl.pitch,
      };
      this.jumpQueued = false;
      this.touchJumpQueued = false;
      this.dashQueued = false;
      this.grappleQueued = false;
      this.mountQueued = false;

      this.player.update(dt, this.world, this.char, stats, input, this.settings.autoJump, this.journeyPowers.godmode);

      // Update held dynamic radial light in shader (zero allocation!)
      const heldStack = this.char.inventory[this.selectedHotbar];
      const heldDef = heldStack ? getItemDef(heldStack.itemId) : undefined;
      const lightRadius = Math.max(stats.shineRadius, heldDef?.holdLight ?? 0, 4.5);
      this.world.shaderUniforms.uHeldLightPos.value.set(
        this.player.position.x,
        this.player.position.y + 1.3,
        this.player.position.z
      );
      this.world.shaderUniforms.uHeldLightRadius.value = lightRadius;
      this.world.shaderUniforms.uHeldLightColor.value.set(
        heldDef?.holdLight ? heldDef.iconColor : stats.shineRadius > 0 ? '#fff59d' : '#a8c0e0'
      );

      // Footsteps
      hSpeed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
      if (this.player.grounded && hSpeed > 1.2) {
        this.footstepTimer -= dt * (hSpeed / 6);
        if (this.footstepTimer <= 0) {
          this.footstepTimer = 0.34;
          this.audio.playSfx('footstep');
        }
      }

      // Camera, Dynamic Sprint FOV & Model animation
      const targetFov = this.settings.fov + (hSpeed > 8.5 ? Math.min(6, (hSpeed - 8.5) * 0.9) : 0);
      if (Math.abs(targetFov - this.currentFov) > 0.05) {
        this.currentFov = THREE.MathUtils.lerp(this.currentFov, targetFov, Math.min(1, dt * 8));
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }
      this.cameraCtrl.update(dt, this.camera, this.player.position, this.player.eyeHeight, this.world);
      this.playerModel.root.visible = !this.cameraCtrl.firstPerson;
      this.playerModel.root.position.copy(this.player.position);
      this.playerModel.root.rotation.y = THREE.MathUtils.lerp(this.playerModel.root.rotation.y, this.player.facingYaw, Math.min(1, dt * 14));
      this.playerModel.syncEquipment(this.char, heldStack);

      let animState: PlayerAnimState = 'idle';
      if (this.player.inWater || this.player.inHoney) animState = 'swim';
      else if (!this.player.grounded) animState = stats.wingFlightTicks > 0 && input.jumpHeld ? 'glide' : this.player.velocity.y > 0 ? 'jump' : 'fall';
      else if (hSpeed > 8.5) animState = 'run';
      else if (hSpeed > 0.5) animState = 'walk';
      this.playerModel.update(dt, animState, hSpeed, this.cameraCtrl.pitch);

      // Grappling hook line (in-place buffer update!)
      if (this.player.hookAnchor) {
        this.hookLine.visible = true;
        const posAttr = this.hookLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, this.player.position.x, this.player.position.y + 1.2, this.player.position.z);
        posAttr.setXYZ(1, this.player.hookAnchor.x, this.player.hookAnchor.y, this.player.hookAnchor.z);
        posAttr.needsUpdate = true;
      } else {
        this.hookLine.visible = false;
      }

      // Primary / Secondary actions
      if (this.primaryHeld || this.touchPrimaryHeld) {
        this.handlePrimaryAction(dt, stats);
      } else {
        this.miningProgress = Math.max(0, this.miningProgress - dt * 2);
      }
      if (this.secondaryQueued || (this.secondaryHeld && this.useCooldown <= 0)) {
        this.secondaryQueued = false;
        this.useCooldown = 0.18;
        this.handleSecondaryAction(stats);
      }
    } else {
      this.cameraCtrl.update(dt, this.camera, this.player.position, this.player.eyeHeight, this.world);
    }

    // Drive Shader Time & Camera Position for water ripples, wind leaves & Fresnel specular!
    this.world.shaderUniforms.uTime.value = nowMs * 0.001;
    this.world.shaderUniforms.uCameraPos.value.copy(this.camera.position);

    // Check altitude achievements
    const biomeId = this.world.getBiomeAt(this.player.position.x, this.player.position.y, this.player.position.z);
    if (biomeId === 'space') this.unlockAchievement('into_orbit');
    if (biomeId === 'underworld') this.unlockAchievement('rock_bottom');

    // Environment, Entities, Particles, Music
    if (this.journeyPowers.weatherLocked !== 'none') {
      this.world.meta.weather = this.journeyPowers.weatherLocked;
    }
    const isDay = this.env.isDaytime(this.world.meta.timeOfDay);
    this.env.update(
      dt,
      this.scene,
      this.world,
      this.world.meta,
      this.player.position,
      biomeId,
      this.player.inWater,
      this.player.inLava,
      this.journeyPowers.timeFrozen,
      this.journeyPowers.timeRate
    );

    this.entities.update(dt, this.world, this.char, this.player.position, isDay, this.particles, this.journeyPowers.spawnRateMult);
    this.particles.update(dt);

    // Dynamic Biome / Boss Music
    if (this.entities.bosses.length > 0) {
      this.audio.setMusicTheme(this.entities.bosses[0].def.id === 'moon_lord' ? 'lunar' : 'boss');
    } else if (biomeId === 'forest' && !isDay) {
      this.audio.setMusicTheme('forest_night');
    } else {
      this.audio.setMusicTheme(biomeId);
    }
    this.audio.updateMusic(dt);

    // Target Block Highlight + 3D Mining Crack Progress Overlay
    const aimHit = this.world.raycastBlock(this.cameraCtrl.aimOrigin, this.cameraCtrl.aimDirection, 6.5 + (this.journeyPowers.placementRangeBoost ? 5 : 0));
    if (aimHit.hit && !this.isDead) {
      this.targetHighlightMesh.visible = true;
      this.targetHighlightMesh.position.set(aimHit.bx + 0.5, aimHit.by + 0.5, aimHit.bz + 0.5);
      if (this.miningProgress > 0.05) {
        this.miningOverlayMesh.visible = true;
        this.miningOverlayMesh.position.copy(this.targetHighlightMesh.position);
        this.miningOverlayMat.opacity = Math.min(0.68, this.miningProgress * 0.65);
        const pulse = 1.0 + Math.sin(this.miningProgress * Math.PI * 5) * 0.012;
        this.miningOverlayMesh.scale.setScalar(pulse);
      } else {
        this.miningOverlayMesh.visible = false;
      }
    } else {
      this.targetHighlightMesh.visible = false;
      this.miningOverlayMesh.visible = false;
    }

    // Notifications decay
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      this.notifications[i].ttl -= dt;
      if (this.notifications[i].ttl <= 0) this.notifications.splice(i, 1);
    }

    // Periodic Auto-Save every 20s
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= 20) {
      this.autoSaveTimer = 0;
      void this.saveProgress();
    }

    // Render Scene!
    this.renderer.render(this.scene, this.camera);

    // Emit HUD state at ~20Hz to keep DOM light and crisp
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHud(stats, biomeId, aimHit.hit ? getBlockDef(aimHit.blockId).name : null);
    }
  };

  private emitHud(stats: ComputedPlayerStats, biomeId: BiomeId, targetLabel: string | null): void {
    if (!this.onHudUpdate) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const projectedNums = this.particles.floatingNumbers.map((fn: FloatingNumber) => {
      this.tmpVecA.set(fn.x, fn.y, fn.z).project(this.camera);
      return {
        text: fn.text,
        x: (this.tmpVecA.x * 0.5 + 0.5) * w,
        y: (-this.tmpVecA.y * 0.5 + 0.5) * h,
        color: fn.color,
        crit: fn.crit,
        alpha: Math.min(1, fn.life / fn.maxLife),
      };
    });

    let nearbyNpc: NpcDef | null = null;
    for (const n of this.entities.npcs) {
      if (n.position.distanceTo(this.player.position) < 4.5) {
        nearbyNpc = n.def;
        break;
      }
    }

    this.onHudUpdate({
      hp: Math.ceil(this.char.hp),
      maxHp: stats.maxHp,
      mana: Math.floor(this.char.mana),
      maxMana: stats.maxMana,
      breath: Math.ceil(this.player.breath),
      maxBreath: this.player.maxBreath,
      defense: stats.defense,
      biomeName: biomeId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      clockText: this.env.formatClock(this.world.meta.timeOfDay),
      dayCount: this.world.meta.dayCount,
      weather: this.world.meta.weather,
      activeEventName: this.world.meta.activeEvent ? EVENTS[this.world.meta.activeEvent].name : null,
      eventProgress: this.world.meta.eventProgress,
      eventTarget: this.world.meta.eventTarget,
      bossHud: this.entities.getActiveBossHud(),
      activeBuffs: [...this.activeBuffs],
      selectedHotbar: this.selectedHotbar,
      targetLabel,
      targetMiningProgress: this.miningProgress,
      fps: this.currentFps,
      coords: [Math.round(this.player.position.x), Math.round(this.player.position.y), Math.round(this.player.position.z)],
      isDead: this.isDead,
      respawnTimer: Math.max(0, Math.ceil(this.respawnTimer)),
      deathMessage: this.deathMessage,
      isHardmode: this.world.meta.isHardmode,
      floatingNumbers: projectedNums,
      notifications: this.notifications.map((n) => ({ id: n.id, text: n.text, color: n.color })),
      nearbyNpc,
      openChest: this.openChest,
      stats,
    });
  }

  public async saveProgress(): Promise<void> {
    this.worldSave.meta = this.world.meta;
    this.worldSave.chunkDeltas = this.world.chunkDeltas;
    this.worldSave.chests = this.world.chests;
    this.worldSave.exploredChunks = Array.from(this.world.exploredChunks);
    this.worldSave.playerPositionsByChar[this.char.id] = [
      this.player.position.x,
      this.player.position.y,
      this.player.position.z,
    ];
    await Promise.all([
      this.saveManager.saveCharacter(this.char),
      this.saveManager.saveWorld(this.worldSave),
    ]);
  }

  public applySettings(settings: GameSettings): void {
    this.settings = settings;
    this.currentFov = settings.fov;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.computePixelRatio(settings));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.env.sunLight.castShadow = settings.shadows;
    this.env.setShadowQuality(settings.graphicsPreset === 'high');
    this.env.setRenderDistance(settings.renderDistance);
    this.world.enableShadows = settings.shadows;
    this.world.enableAO = settings.ambientOcclusion;
    this.particles.densityScale = settings.particleDensity;
    this.audio.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume);
  }

  private bindEvents(): void {
    const canvas = this.renderer.domElement;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (this.disposed) return;
      this.audio.unlock();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) {
        ev.preventDefault();
      }
      if (!this.keys.has(ev.code)) {
        if (ev.code === 'Space') this.jumpQueued = true;
        if (ev.code === 'ShiftLeft' || ev.code === 'ShiftRight') this.dashQueued = true;
        if (ev.code === 'KeyA' || ev.code === 'KeyD' || ev.code === 'KeyW' || ev.code === 'KeyS') {
          const now = performance.now();
          if (this.lastDirTap.key === ev.code && now - this.lastDirTap.time < 250) {
            this.dashQueued = true;
          }
          this.lastDirTap = { key: ev.code, time: now };
        }
        if (ev.code === 'KeyG') this.grappleQueued = true;
        if (ev.code === 'KeyR') this.mountQueued = true;
        if (ev.code === 'KeyH') this.triggerQuickHeal();
        if (ev.code === 'KeyN') this.triggerQuickMana();
        if (ev.code === 'KeyV') this.cameraCtrl.toggleFirstPerson();
        if (ev.code === 'KeyE') this.onOpenInventory?.();
        if (ev.code === 'KeyM') this.onToggleMap?.();
        if (ev.code === 'KeyB') this.onToggleBestiary?.();
        if (ev.code === 'KeyJ') this.onToggleJourney?.();
        if (ev.code === 'Escape') this.onTogglePause?.();
        if (ev.code.startsWith('Digit')) {
          const num = Number(ev.code.replace('Digit', ''));
          if (num >= 1 && num <= 9) this.selectedHotbar = num - 1;
          else if (num === 0) this.selectedHotbar = 9;
        }
      }
      this.keys.add(ev.code);
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      this.keys.delete(ev.code);
    };

    const onMouseDown = (ev: MouseEvent) => {
      this.audio.unlock();
      if (this.paused) return;
      if (ev.button === 0) {
        this.primaryHeld = true;
        this.isDraggingLook = true;
        this.lastPointer = { x: ev.clientX, y: ev.clientY };
        // Attempt pointer lock gently when clicking canvas, fallback drag always works too!
        if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
          try {
            const p = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
            p?.catch?.(() => {});
          } catch {
            // iframe pointer lock restricted; drag fallback works smoothly
          }
        }
      } else if (ev.button === 2) {
        this.secondaryHeld = true;
        this.secondaryQueued = true;
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (ev.button === 0) {
        this.primaryHeld = false;
        this.isDraggingLook = false;
      } else if (ev.button === 2) {
        this.secondaryHeld = false;
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (this.paused) return;
      if (document.pointerLockElement === canvas) {
        this.cameraCtrl.rotate(ev.movementX, ev.movementY, this.settings.cameraSensitivity, this.settings.invertY);
      } else if (this.isDraggingLook) {
        const dx = ev.clientX - this.lastPointer.x;
        const dy = ev.clientY - this.lastPointer.y;
        this.lastPointer = { x: ev.clientX, y: ev.clientY };
        this.cameraCtrl.rotate(dx, dy, this.settings.cameraSensitivity, this.settings.invertY);
      }
    };

    const onWheel = (ev: WheelEvent) => {
      if (this.paused) return;
      if (ev.shiftKey) {
        this.selectedHotbar = (this.selectedHotbar + (ev.deltaY > 0 ? 1 : 9)) % 10;
      } else {
        this.cameraCtrl.zoom(Math.sign(ev.deltaY));
      }
    };

    const onContext = (ev: MouseEvent) => ev.preventDefault();

    const onResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }

  private cleanupListeners?: () => void;

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.cleanupListeners?.();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.entities.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
