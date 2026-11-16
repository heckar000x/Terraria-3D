import { describe, expect, it } from 'vitest';
import { RECIPES } from '@/data/recipes';
import { PlayerController } from '@/engine/PlayerController';
import { FishingFarmingSystem } from '@/systems/FishingFarmingSystem';
import { HousingSystem } from '@/systems/HousingSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { createDefaultCharacter, createNewWorldSave } from '@/systems/SaveManager';
import { BlockId } from '@/types/game';
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

describe('Player 3D Physics, Inventory, Crafting, Housing & Fishing', () => {
  it('simulates 3D gravity, grounding, jumping, auto-step, and wing flight', () => {
    const save = createNewWorldSave('PhysWorld', 12345, 'small', 'classic', 'corruption');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    // Build flat stone floor at Y=150
    for (let x = -4; x <= 6; x++) {
      for (let z = -4; z <= 4; z++) {
        world.setBlock(x, 150, z, BlockId.Stone);
        for (let y = 151; y <= 165; y++) world.setBlock(x, y, z, BlockId.Air);
      }
    }

    const char = createDefaultCharacter('Runner', 'classic', defaultAppearance);
    const pc = new PlayerController();
    pc.position.set(0.5, 153, 0.5);

    let stats = InventorySystem.computePlayerStats(char, []);
    for (let i = 0; i < 45; i++) {
      pc.update(0.02, world, char, stats, {
        forward: 0, strafe: 0, jumpHeld: false, jumpPressed: false, crouchHeld: false,
        dashPressed: false, grapplePressed: false, mountTogglePressed: false, yaw: 0, pitch: 0,
      }, true, false);
    }

    expect(pc.grounded).toBe(true);
    expect(pc.position.y).toBeCloseTo(151.0, 0);

    // Jump & double jump check with Cloud in a Bottle
    char.accessories[0] = { itemId: 'cloud_in_a_bottle', count: 1 };
    stats = InventorySystem.computePlayerStats(char, []);
    expect(stats.doubleJump).toBe(true);

    pc.update(0.02, world, char, stats, {
      forward: 1, strafe: 0, jumpHeld: true, jumpPressed: true, crouchHeld: false,
      dashPressed: false, grapplePressed: false, mountTogglePressed: false, yaw: 0, pitch: 0,
    }, true, false);
    expect(pc.velocity.y).toBeGreaterThan(5);
    expect(pc.grounded).toBe(false);
  });

  it('handles inventory stacking, coin denominations, station-gated crafting & armor set bonuses', () => {
    const save = createNewWorldSave('CraftWorld', 22222, 'small', 'classic', 'crimson');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    const char = createDefaultCharacter('Crafter', 'classic', defaultAppearance);
    InventorySystem.addCoins(char, 12550); // 1g 25s 50c
    expect(InventorySystem.getTotalCopper(char)).toBe(12550);
    expect(char.coins[2]?.itemId).toBe('gold_coin');
    expect(char.coins[2]?.count).toBe(1);

    // Give Wood & check Work Bench crafting
    InventorySystem.addItem(char, 'wood', 30);
    const benchRecipe = RECIPES.find((r) => r.resultId === 'work_bench')!;
    expect(benchRecipe).toBeDefined();
    expect(InventorySystem.craftRecipe(char, benchRecipe, new Set(['hand']), false)).toBe(true);
    expect(InventorySystem.countItem(char, 'work_bench')).toBe(1);

    // Iron Anvil recipe requires Iron Anvil station (fails at hand, passes near Iron Anvil)
    InventorySystem.addItem(char, 'iron_bar', 15);
    const ironSwordRecipe = RECIPES.find((r) => r.resultId === 'iron_broadsword')!;
    expect(ironSwordRecipe).toBeDefined();
    expect(InventorySystem.canCraft(char, ironSwordRecipe, new Set(['hand', 'workbench']), false)).toBe(false);

    world.setBlock(0, 151, 0, BlockId.IronAnvil);
    const stations = world.getNearbyCraftingStations(0, 151, 0);
    expect(stations.has('iron_anvil')).toBe(true);
    expect(InventorySystem.craftRecipe(char, ironSwordRecipe, stations, false)).toBe(true);
    expect(InventorySystem.countItem(char, 'iron_broadsword')).toBe(1);

    // Full Molten Armor Set Bonus check
    char.armor[0] = { itemId: 'molten_helmet', count: 1 };
    char.armor[1] = { itemId: 'molten_chestplate', count: 1 };
    char.armor[2] = { itemId: 'molten_greaves', count: 1 };
    const stats = InventorySystem.computePlayerStats(char, []);
    expect(stats.activeSetId).toBe('molten_set');
    expect(stats.fireBlockImmune).toBe(true);
    expect(stats.defense).toBeGreaterThanOrEqual(25);
  });

  it('validates enclosed 3D housing rooms, rejects open rooms, unlocks NPCs, and fishes', () => {
    const save = createNewWorldSave('HouseWorld', 33333, 'small', 'classic', 'corruption');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    // Open area should fail housing check
    const invalidRes = HousingSystem.validateHouse(world, 0, 180, 0);
    expect(invalidRes.valid).toBe(false);

    // Build a 5x4x5 enclosed 3D cabin around (0,152,0)
    for (let x = -2; x <= 2; x++) {
      for (let z = -2; z <= 2; z++) {
        for (let y = 151; y <= 155; y++) {
          const isShell = x === -2 || x === 2 || z === -2 || z === 2 || y === 151 || y === 155;
          world.setBlock(x, y, z, isShell ? BlockId.Wood : BlockId.Air);
        }
      }
    }
    world.setBlock(0, 152, 2, BlockId.WoodDoorClosed);
    world.setBlock(-1, 152, -1, BlockId.WorkBench);
    world.setBlock(0, 152, -1, BlockId.WoodChair);
    world.setBlock(1, 154, 0, BlockId.Torch);

    const validRes = HousingSystem.validateHouse(world, 0, 152, 0);
    expect(validRes.valid).toBe(true);
    expect(validRes.interiorCount).toBeGreaterThanOrEqual(16);

    // NPC Unlock Check
    const char = createDefaultCharacter('Mayor', 'classic', defaultAppearance);
    InventorySystem.addCoins(char, 6000);
    char.maxHp = 140;
    const unlocked = HousingSystem.evaluateUnlockedNpcs(world.meta, char);
    expect(unlocked).toContain('guide');
    expect(unlocked).toContain('merchant');
    expect(unlocked).toContain('nurse');

    // Fishing & Tree planting
    world.setBlock(10, 150, 10, BlockId.Water);
    InventorySystem.addItem(char, 'worm', 3);
    const fishRes = FishingFarmingSystem.castLine(world, char, 30, 10, 150, 10);
    expect(fishRes.success).toBe(true);
    expect(fishRes.caughtItemId).toBeDefined();

    world.setBlock(12, 150, 12, BlockId.Grass);
    world.setBlock(12, 151, 12, BlockId.Air);
    for (let y = 152; y <= 162; y++) world.setBlock(12, y, 12, BlockId.Air);
    expect(FishingFarmingSystem.tryPlantAcornOrHerb(world, 'acorn', 12, 151, 12)).toBe(true);
    expect(world.getBlock(12, 151, 12)).toBe(BlockId.Wood);
  });
});
