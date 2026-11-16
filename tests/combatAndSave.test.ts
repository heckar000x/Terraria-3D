import 'fake-indexeddb/auto';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOSSES } from '@/data/bosses';
import { EntityManager } from '@/engine/EntityManager';
import { ParticleSystem } from '@/engine/ParticleSystem';
import { createDefaultCharacter, createNewWorldSave, SaveManager } from '@/systems/SaveManager';
import { WorldManager } from '@/world/WorldManager';

const defaultAppearance = {
  hairStyle: 0,
  hairColor: '#6d4c41',
  skinColor: '#f5cfa0',
  eyeColor: '#1e88e5',
  shirtColor: '#43a047',
  undershirtColor: '#cfd8dc',
  pantsColor: '#3949ab',
  shoeColor: '#4e342e',
};

describe('Combat, All 18 Bosses & Save/Load Persistence', () => {
  it('simulates melee & projectile combat, kills enemies, and spawns loot drops', () => {
    const save = createNewWorldSave('CombatWorld', 55555, 'small', 'classic', 'corruption');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    const scene = new THREE.Scene();
    const particles = new ParticleSystem(scene);
    const entities = new EntityManager();
    const defeated: string[] = [];
    entities.onEnemyDefeated = (e) => defeated.push(e.id);

    const enemy = entities.spawnEnemy('green_slime', new THREE.Vector3(2, 150, 0), 'classic');
    expect(enemy).not.toBeNull();
    expect(entities.enemies.length).toBe(1);

    // Perform melee sweep towards +X
    const hit = entities.performMeleeSweep(
      new THREE.Vector3(0, 150, 0),
      new THREE.Vector3(1, 0, 0),
      4.5,
      45,
      5,
      0,
      particles
    );
    expect(hit).toBe(true);
    expect(entities.enemies.length).toBe(0);
    expect(defeated).toContain('green_slime');
    expect(entities.drops.length).toBeGreaterThan(0);

    // Projectile homing & kill
    const eye = entities.spawnEnemy('demon_eye', new THREE.Vector3(8, 152, 0), 'classic')!;
    expect(eye).not.toBeNull();
    entities.spawnProjectile({
      kind: 'chlorophyte_bullet',
      fromPlayer: true,
      damage: 120,
      damageType: 'ranged',
      knockback: 2,
      position: new THREE.Vector3(7.6, 152.3, 0),
      velocity: new THREE.Vector3(20, 0, 0),
      gravity: 0,
      life: 2,
      maxLife: 2,
      pierce: 1,
      bounces: 0,
      homing: true,
      boomerangReturn: false,
    });

    const char = createDefaultCharacter('Fighter', 'classic', defaultAppearance);
    entities.update(0.03, world, char, new THREE.Vector3(0, 150, 0), false, particles, 0);
    expect(defeated).toContain('demon_eye');
  });

  it('spawns, transitions to Phase 2, and defeats all 18 progression bosses cleanly', () => {
    const save = createNewWorldSave('BossRush', 66666, 'small', 'expert', 'crimson');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    const scene = new THREE.Scene();
    const particles = new ParticleSystem(scene);
    const entities = new EntityManager();
    const char = createDefaultCharacter('BossSlayer', 'classic', defaultAppearance);
    const defeatedBosses: string[] = [];

    entities.onBossDefeated = (b) => {
      defeatedBosses.push(b.id);
      if (b.id === 'wall_of_flesh') {
        world.triggerHardmodeTransformation();
      }
    };

    expect(BOSSES.length).toBe(18);

    for (const bossDef of BOSSES) {
      const b = entities.spawnBoss(bossDef.id, new THREE.Vector3(0, 150, 0), 'expert');
      expect(b).not.toBeNull();
      // Drop HP below 50% and tick AI to trigger Phase 2
      entities.damageTarget(b!, Math.floor(b!.maxHp * 0.65), new THREE.Vector3(1, 0, 0), 0, false, particles);
      entities.update(0.03, world, char, new THREE.Vector3(0, 150, 0), false, particles, 0);
      expect(b!.phase).toBe(2);

      // Finish off the boss
      entities.damageTarget(b!, b!.hp + 500, new THREE.Vector3(1, 0, 0), 0, true, particles);
      expect(entities.bosses.length).toBe(0);
    }

    expect(defeatedBosses.length).toBe(18);
    expect(world.meta.isHardmode).toBe(true);
    expect(defeatedBosses).toContain('moon_lord');
  });

  it('persists and reloads characters, worlds, chunk deltas, chests, and settings via IndexedDB & LocalStorage', async () => {
    const sm = new SaveManager();
    const settings = sm.loadSettings();
    settings.renderDistance = 7;
    settings.fov = 85;
    sm.saveSettings(settings);
    const reloadedSettings = sm.loadSettings();
    expect(reloadedSettings.renderDistance).toBe(7);
    expect(reloadedSettings.fov).toBe(85);

    const char = createDefaultCharacter('PersistedHero', 'journey', defaultAppearance);
    char.maxHp = 260;
    char.unlockedAchievements.push('timber', 'eye_on_you');
    await sm.saveCharacter(char);

    const world = createNewWorldSave('PersistedRealm', 88888, 'medium', 'master', 'corruption');
    world.meta.isHardmode = true;
    world.meta.defeatedBosses.push('wall_of_flesh');
    world.chests['1,140,1'] = { x: 1, y: 140, z: 1, items: Array(20).fill(null) };
    world.chests['1,140,1'].items[0] = { itemId: 'pwnhammer', count: 1 };
    world.playerPositionsByChar[char.id] = [14, 152, -8];
    await sm.saveWorld(world);

    const chars = await sm.listCharacters();
    const loadedChar = chars.find((c) => c.id === char.id);
    expect(loadedChar).toBeDefined();
    expect(loadedChar!.name).toBe('PersistedHero');
    expect(loadedChar!.maxHp).toBe(260);
    expect(loadedChar!.unlockedAchievements).toContain('eye_on_you');

    const loadedWorld = await sm.loadWorld(world.meta.id);
    expect(loadedWorld).not.toBeNull();
    expect(loadedWorld!.meta.isHardmode).toBe(true);
    expect(loadedWorld!.chests['1,140,1'].items[0]?.itemId).toBe('pwnhammer');
    expect(loadedWorld!.playerPositionsByChar[char.id]).toEqual([14, 152, -8]);
  });
});
