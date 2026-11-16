import { describe, expect, it } from 'vitest';
import { ALL_BLOCKS, isSolidBlock } from '@/data/blocks';
import { createNewWorldSave } from '@/systems/SaveManager';
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT } from '@/types/game';
import { meshColumnSubchunks } from '@/world/ChunkMesher';
import { computeColumnLighting } from '@/world/Lighting';
import { WorldGenerator } from '@/world/WorldGen';
import { WorldManager } from '@/world/WorldManager';

describe('World Generation, Biomes, Lighting & Meshing', () => {
  it('generates deterministic terrain with valid surface, caves, and underworld strata', () => {
    const genA = new WorldGenerator(424242, 'small', 'corruption', false);
    const genB = new WorldGenerator(424242, 'small', 'corruption', false);

    const colA = genA.generateChunkColumn(0, 0);
    const colB = genB.generateChunkColumn(0, 0);

    expect(colA.blocks.length).toBe(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    expect(colA.blocks).toEqual(colB.blocks);

    // Check Underworld ash/hellstone at bottom & open air above surface
    let hasSolidSurface = false;
    let hasAirAbove = false;
    let hasUnderworldLayer = false;
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      const b = colA.blocks[y * 256 + 8 * 16 + 8];
      if (y < 24 && (b === BlockId.Ash || b === BlockId.Hellstone || b === BlockId.Lava || b === BlockId.ObsidianBrick)) {
        hasUnderworldLayer = true;
      }
      if (y >= 120 && y <= 165 && isSolidBlock(b)) hasSolidSurface = true;
      if (y >= 175 && b === BlockId.Air) hasAirAbove = true;
    }

    expect(hasUnderworldLayer).toBe(true);
    expect(hasSolidSurface).toBe(true);
    expect(hasAirAbove).toBe(true);
  });

  it('places diverse Terraria biomes across the world layout', () => {
    const gen = new WorldGenerator(77777, 'small', 'crimson', false);
    expect(gen.getBiomeAt(0, 145, 0)).toBe('forest');
    expect(gen.getBiomeAt(0, 10, 0)).toBe('underworld');
    expect(gen.getBiomeAt(0, 225, 0)).toBe('space');

    const biomesSeen = new Set<string>();
    for (let x = -230; x <= 230; x += 20) {
      biomesSeen.add(gen.getBiomeAt(x, 140, 0));
      biomesSeen.add(gen.getBiomeAt(x, 60, 0));
    }
    expect(biomesSeen.has('desert') || biomesSeen.has('snow') || biomesSeen.has('jungle')).toBe(true);
    expect(biomesSeen.has('crimson') || biomesSeen.has('underground_crimson')).toBe(true);
    expect(biomesSeen.has('ocean')).toBe(true);
  });

  it('computes sky + block RGB lighting and non-NaN subchunk meshes', () => {
    const gen = new WorldGenerator(1337, 'small', 'corruption', false);
    const col = gen.generateChunkColumn(0, 0);
    // Place a Torch inside stone/air at (8, 150, 8)
    col.blocks[150 * 256 + 8 * 16 + 8] = BlockId.Torch;

    const light = computeColumnLighting(col.blocks);
    expect(light.sky[220 * 256]).toBe(15);
    expect(light.r[150 * 256 + 8 * 16 + 8]).toBeGreaterThan(0);

    const dummyUv = () => ({ u0: 0, v0: 0, u1: 0.1, v1: 0.1 });
    const meshes = meshColumnSubchunks(0, 0, col.blocks, light, dummyUv, {}, true);
    const nonEmptySolid = meshes.filter((m) => m.solid !== null);
    expect(nonEmptySolid.length).toBeGreaterThan(0);

    for (const sub of nonEmptySolid) {
      for (let i = 0; i < sub.solid!.positions.length; i++) {
        expect(Number.isFinite(sub.solid!.positions[i])).toBe(true);
      }
      expect(sub.solid!.indices.length % 3).toBe(0);
    }
  });

  it('supports headless mining tool-tier checks, falling sand, liquid mixing, chests & Hardmode V-transform', () => {
    const save = createNewWorldSave('TestWorld', 90909, 'small', 'classic', 'corruption');
    const world = new WorldManager(save.meta, save.chunkDeltas, save.chests, save.exploredChunks);
    world.updateStreaming(0, 0, 1);

    // Mining power gate: Hellstone requires 65+ pickPower
    world.setBlock(2, 150, 2, BlockId.Hellstone);
    const failMine = world.mineBlock(2, 150, 2, 35, 0, 0);
    expect(failMine.broken).toBe(false);
    expect(world.getBlock(2, 150, 2)).toBe(BlockId.Hellstone);

    const passMine = world.mineBlock(2, 150, 2, 65, 0, 0);
    expect(passMine.broken).toBe(true);
    expect(passMine.drops.some((d) => d.itemId === 'hellstone')).toBe(true);

    // Chest auto-allocation & persistence
    world.setBlock(3, 150, 3, BlockId.WoodChest);
    const chest = world.getOrCreateChest(3, 150, 3);
    expect(chest.items.length).toBe(20);
    chest.items[0] = { itemId: 'gold_coin', count: 5 };
    expect(world.chests['3,150,3'].items[0]?.itemId).toBe('gold_coin');

    // Falling sand simulation
    world.setBlock(4, 155, 4, BlockId.Air);
    world.setBlock(4, 154, 4, BlockId.Air);
    world.setBlock(4, 153, 4, BlockId.Stone);
    world.setBlock(4, 156, 4, BlockId.Sand);
    world.tickSimulation(0.25);
    expect(world.getBlock(4, 155, 4)).toBe(BlockId.Sand);

    // Water + Lava -> Obsidian
    world.setBlock(5, 152, 5, BlockId.Stone);
    world.setBlock(5, 153, 5, BlockId.Lava);
    world.setBlock(5, 154, 5, BlockId.Water);
    world.tickSimulation(0.35);
    expect(world.getBlock(5, 153, 5)).toBe(BlockId.Obsidian);

    // Hardmode V-stripe transform
    expect(world.meta.isHardmode).toBe(false);
    world.triggerHardmodeTransformation();
    expect(world.meta.isHardmode).toBe(true);
    expect(ALL_BLOCKS.length).toBeGreaterThan(100);
  });
});
