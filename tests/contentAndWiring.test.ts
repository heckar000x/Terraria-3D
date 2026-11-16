import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ALL_BLOCKS, BLOCKS } from '@/data/blocks';
import { BOSSES } from '@/data/bosses';
import { getContentStatusReport } from '@/data/contentRegistry';
import { ENEMIES } from '@/data/enemies';
import { ALL_ITEMS, getItemDef } from '@/data/items';
import { BAG_LOOT_TABLES, CHEST_PRIMARY_LOOT } from '@/data/lootTables';
import { NPCS } from '@/data/npcs';
import { RECIPES } from '@/data/recipes';
import { PlayerModel } from '@/engine/PlayerModel';
import { createDefaultCharacter, createNewWorldSave } from '@/systems/SaveManager';
import { BlockId } from '@/types/game';
import { WorldManager } from '@/world/WorldManager';

describe('Content Referential Integrity, Wiring & PlayerModel', () => {
  it('verifies all recipes, block drops, loot tables, bosses, enemies, and NPC shops reference valid IDs', () => {
    const missingRefs: string[] = [];

    for (const r of RECIPES) {
      if (!getItemDef(r.resultId)) missingRefs.push(`recipe result: ${r.resultId}`);
      for (const ing of r.ingredients) {
        if (!getItemDef(ing.itemId)) missingRefs.push(`recipe ing: ${ing.itemId} in ${r.id}`);
      }
    }

    for (const b of ALL_BLOCKS) {
      if (b.dropItemId && !getItemDef(b.dropItemId)) {
        missingRefs.push(`block drop: ${b.dropItemId} on block ${b.name}`);
      }
    }

    for (const it of ALL_ITEMS) {
      if (it.placesBlock !== undefined && !BLOCKS[it.placesBlock]) {
        missingRefs.push(`item placesBlock: ${it.placesBlock} on ${it.id}`);
      }
    }

    for (const boss of BOSSES) {
      if (boss.summonItemId && !getItemDef(boss.summonItemId)) missingRefs.push(`boss summon: ${boss.summonItemId}`);
      for (const d of boss.drops) {
        if (!getItemDef(d.itemId)) missingRefs.push(`boss drop: ${d.itemId} on ${boss.id}`);
      }
    }

    for (const enemy of ENEMIES) {
      for (const d of enemy.drops) {
        if (!getItemDef(d.itemId)) missingRefs.push(`enemy drop: ${d.itemId} on ${enemy.id}`);
      }
    }

    for (const npc of NPCS) {
      for (const s of npc.shop) {
        if (!getItemDef(s.itemId)) missingRefs.push(`npc shop: ${s.itemId} on ${npc.id}`);
      }
    }

    for (const [k, list] of Object.entries(BAG_LOOT_TABLES)) {
      for (const d of list) {
        if (!getItemDef(d.itemId)) missingRefs.push(`bag loot: ${d.itemId} in ${k}`);
      }
    }

    for (const [k, list] of Object.entries(CHEST_PRIMARY_LOOT)) {
      for (const entry of list) {
        if (!getItemDef(entry.itemId)) missingRefs.push(`chest loot: ${entry.itemId} in ${k}`);
      }
    }

    expect(missingRefs).toEqual([]);
    expect(ALL_ITEMS.length).toBeGreaterThanOrEqual(300);
    expect(RECIPES.length).toBeGreaterThanOrEqual(240);
    expect(ENEMIES.length).toBeGreaterThanOrEqual(60);
    expect(BOSSES.length).toBe(18);
    expect(getContentStatusReport().length).toBeGreaterThanOrEqual(8);
  });

  it('triggers wired TNT explosion & Dart Trap fire through Lever -> WireBlock circuits', () => {
    const save = createNewWorldSave('WireWorld', 99991, 'small', 'classic', 'corruption');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    let exploded = false;
    let dartFired = false;
    world.onExplosion = () => { exploded = true; };
    world.onDartTrapFire = () => { dartFired = true; };

    world.setBlock(0, 151, 0, BlockId.Lever);
    world.setBlock(1, 151, 0, BlockId.WireBlock);
    world.setBlock(2, 151, 0, BlockId.DartTrap);
    world.setBlock(1, 151, 1, BlockId.TNT);

    world.triggerMechanism(0, 151, 0);
    expect(dartFired).toBe(true);
    expect(exploded).toBe(true);
    expect(world.getBlock(1, 151, 1)).toBe(BlockId.Air);
  });

  it('builds 3D PlayerModel with armor, wings, held weapon, and animates smoothly', () => {
    const char = createDefaultCharacter('ModelTest', 'classic', {
      hairStyle: 2,
      hairColor: '#5c3b28',
      skinColor: '#f5cfa0',
      eyeColor: '#1e88e5',
      shirtColor: '#4caf50',
      undershirtColor: '#cfd8dc',
      pantsColor: '#3949ab',
      shoeColor: '#4e342e',
    });
    char.armor[0] = { itemId: 'gold_helmet', count: 1 };
    char.armor[1] = { itemId: 'gold_chestplate', count: 1 };
    char.armor[2] = { itemId: 'gold_greaves', count: 1 };
    char.accessories[0] = { itemId: 'angel_wings', count: 1 };

    const model = new PlayerModel(char.appearance);
    model.syncEquipment(char, { itemId: 'terra_blade', count: 1 });
    model.triggerAction('swing', 0.35);
    model.update(0.016, 'run', 8.5, 0.1);
    model.update(0.016, 'glide', 5.0, -0.2);

    expect(model.root).toBeInstanceOf(THREE.Group);
    expect(model.root.children.length).toBeGreaterThan(0);
  });
});
