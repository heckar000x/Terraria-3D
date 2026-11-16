import {
  BiomeId,
  BlockId,
  CHUNK_SIZE,
  EvilType,
  WORLD_HEIGHT,
  WorldSize,
} from '@/types/game';
import { CHEST_PRIMARY_LOOT } from '@/data/lootTables';
import { SeededNoise, hashCoords, mulberry32 } from './Noise';

export interface WorldLayout {
  seed: number;
  size: WorldSize;
  radius: number;
  evilType: EvilType;
  isHardmode: boolean;
  seaLevel: number;
  altarVariant: 'copper' | 'tin';
  ironVariant: 'iron' | 'lead';
  silverVariant: 'silver' | 'tungsten';
  goldVariant: 'gold' | 'platinum';
  hmTier1: 'cobalt' | 'palladium';
  hmTier2: 'mythril' | 'orichalcum';
  hmTier3: 'adamantite' | 'titanium';
  dungeonPos: [number, number];
  templePos: [number, number];
  pyramidPos: [number, number];
  livingTreePos: [number, number];
  mushroomSurfacePos: [number, number];
  floatingIslands: { x: number; y: number; z: number; radius: number }[];
}

export interface GeneratedChestSpawn {
  x: number;
  y: number;
  z: number;
  lootKind: keyof typeof CHEST_PRIMARY_LOOT;
}

export interface GeneratedColumnData {
  cx: number;
  cz: number;
  blocks: Uint16Array; // CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
  walls: Uint8Array; // background wall tint type: 0 none, 1 dirt, 2 stone, 3 wood, 4 dungeon, 5 lihzahrd, 6 obsidian
  chests: GeneratedChestSpawn[];
}

export function getWorldRadius(size: WorldSize): number {
  switch (size) {
    case 'small': return 240;
    case 'medium': return 384;
    case 'large': return 512;
  }
}

export function idxInColumn(lx: number, y: number, lz: number): number {
  return ((y << 8) | (lz << 4) | lx);
}

export function buildWorldLayout(seed: number, size: WorldSize, evilType: EvilType, isHardmode = false): WorldLayout {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const radius = getWorldRadius(size);
  const islandCount = size === 'small' ? 6 : size === 'medium' ? 10 : 14;
  const floatingIslands: { x: number; y: number; z: number; radius: number }[] = [];

  for (let i = 0; i < islandCount; i++) {
    const angle = (i / islandCount) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const dist = radius * (0.28 + rng() * 0.52);
    floatingIslands.push({
      x: Math.round(Math.cos(angle) * dist),
      y: Math.round(188 + rng() * 18),
      z: Math.round(Math.sin(angle) * dist),
      radius: Math.round(10 + rng() * 4),
    });
  }

  return {
    seed,
    size,
    radius,
    evilType,
    isHardmode,
    seaLevel: 134,
    altarVariant: rng() > 0.5 ? 'copper' : 'tin',
    ironVariant: rng() > 0.5 ? 'iron' : 'lead',
    silverVariant: rng() > 0.5 ? 'silver' : 'tungsten',
    goldVariant: rng() > 0.5 ? 'gold' : 'platinum',
    hmTier1: rng() > 0.5 ? 'cobalt' : 'palladium',
    hmTier2: rng() > 0.5 ? 'mythril' : 'orichalcum',
    hmTier3: rng() > 0.5 ? 'adamantite' : 'titanium',
    dungeonPos: [Math.round(-radius * 0.54), Math.round(-radius * 0.38)],
    templePos: [Math.round(radius * 0.44), Math.round(radius * 0.42)],
    pyramidPos: [Math.round(-radius * 0.36), Math.round(radius * 0.4)],
    livingTreePos: [Math.round(38 + (rng() - 0.5) * 16), Math.round(-36 + (rng() - 0.5) * 16)],
    mushroomSurfacePos: [Math.round(radius * 0.32), Math.round(-radius * 0.14)],
    floatingIslands,
  };
}

export class WorldGenerator {
  public readonly layout: WorldLayout;
  private noiseTerrain: SeededNoise;
  private noiseBiome: SeededNoise;
  private noiseCaveA: SeededNoise;
  private noiseCaveB: SeededNoise;
  private noiseOre: SeededNoise;

  constructor(seed: number, size: WorldSize, evilType: EvilType, isHardmode = false) {
    this.layout = buildWorldLayout(seed, size, evilType, isHardmode);
    this.noiseTerrain = new SeededNoise(seed + 101);
    this.noiseBiome = new SeededNoise(seed + 202);
    this.noiseCaveA = new SeededNoise(seed + 303);
    this.noiseCaveB = new SeededNoise(seed + 404);
    this.noiseOre = new SeededNoise(seed + 505);
  }

  public getSurfaceBiome(wx: number, wz: number): BiomeId {
    const dist = Math.hypot(wx, wz);
    const edgeNoise = this.noiseBiome.fbm2D(wx * 0.015, wz * 0.015, 3) * 14;

    if (dist + edgeNoise * 0.4 > this.layout.radius - 36) {
      return 'ocean';
    }

    // Spawn Forest buffer
    if (dist + edgeNoise * 0.6 < 56) {
      return 'forest';
    }

    // Surface Mushroom Patch
    const mDist = Math.hypot(wx - this.layout.mushroomSurfacePos[0], wz - this.layout.mushroomSurfacePos[1]);
    if (mDist + edgeNoise * 0.4 < 24) {
      return 'mushroom';
    }

    // Hardmode V-stripe for Hallow on Surface
    if (this.layout.isHardmode) {
      const hallowDiag = (wx - wz * 0.7) - (this.layout.radius * 0.25);
      if (Math.abs(hallowDiag + edgeNoise * 0.8) < 28) {
        return 'hallow';
      }
    }

    // Angle-based biome sectors with noise warp
    const wwx = wx + this.noiseBiome.noise2D(wx * 0.02, wz * 0.02) * 28;
    const wwz = wz + this.noiseBiome.noise2D(wz * 0.02 + 99, wx * 0.02) * 28;
    const angle = Math.atan2(wwz, wwx); // -PI..PI

    // Dungeon sector check (Snow edge)
    if (Math.hypot(wx - this.layout.dungeonPos[0], wz - this.layout.dungeonPos[1]) < 26) {
      return 'dungeon';
    }

    if (angle >= -Math.PI && angle < -Math.PI * 0.45) {
      return 'snow';
    }
    if (angle >= -Math.PI * 0.45 && angle < 0.05) {
      return this.layout.evilType;
    }
    if (angle >= 0.05 && angle < Math.PI * 0.55) {
      return 'jungle';
    }
    return 'desert';
  }

  public getBiomeAt(wx: number, wy: number, wz: number): BiomeId {
    if (wy >= 210) return 'space';

    for (const isl of this.layout.floatingIslands) {
      if (Math.hypot(wx - isl.x, wz - isl.z) <= isl.radius + 6 && wy >= isl.y - 6 && wy <= isl.y + 24) {
        return 'floating_island';
      }
    }

    if (wy >= 172) return 'sky';
    if (wy <= 27) return 'underworld';

    // Temple check
    const tx = this.layout.templePos[0];
    const tz = this.layout.templePos[1];
    if (Math.abs(wx - tx) <= 22 && Math.abs(wz - tz) <= 22 && wy >= 42 && wy <= 72) {
      return 'temple';
    }

    // Dungeon underground check
    const dx = this.layout.dungeonPos[0];
    const dz = this.layout.dungeonPos[1];
    if (Math.hypot(wx - dx, wz - dz) <= 28 && wy >= 38 && wy <= 155) {
      return 'dungeon';
    }

    // Hardmode V-stripe underground
    if (this.layout.isHardmode && wy >= 28 && wy < 128) {
      const slopeOffset = (132 - wy) * 0.65;
      const hallowDist = Math.abs((wx - wz * 0.7) - (this.layout.radius * 0.25 - slopeOffset));
      if (hallowDist < 26) return 'underground_hallow';

      const evilDist = Math.abs((wx - wz * 0.7) + (this.layout.radius * 0.25 - slopeOffset));
      if (evilDist < 22) {
        return this.layout.evilType === 'corruption' ? 'underground_corruption' : 'underground_crimson';
      }
    }

    const surf = this.getSurfaceBiome(wx, wz);

    // Underground Glowing Mushroom caverns
    if (wy >= 44 && wy <= 78) {
      const mVal = this.noiseBiome.noise3D(wx * 0.018, wy * 0.03, wz * 0.018);
      if (mVal > 0.44) return 'underground_mushroom';
    }

    if (wy < 128) {
      switch (surf) {
        case 'desert': return 'underground_desert';
        case 'snow': return 'underground_snow';
        case 'jungle': return 'underground_jungle';
        case 'mushroom': return 'underground_mushroom';
        case 'corruption': return 'underground_corruption';
        case 'crimson': return 'underground_crimson';
        case 'hallow': return 'underground_hallow';
        default: return 'underground_forest';
      }
    }

    return surf;
  }

  public getSurfaceHeight(wx: number, wz: number, surfBiome?: BiomeId): number {
    const biome = surfBiome ?? this.getSurfaceBiome(wx, wz);
    const dist = Math.hypot(wx, wz);

    // Spawn clearing is relatively gentle
    const spawnBlend = Math.min(1, Math.max(0, (dist - 16) / 36));
    const macro = this.noiseTerrain.fbm2D(wx * 0.008, wz * 0.008, 4) * 14;
    const detail = this.noiseTerrain.fbm2D(wx * 0.03, wz * 0.03, 3) * 4.5;
    const ridge = this.noiseTerrain.ridged2D(wx * 0.012, wz * 0.012, 3);

    let h = 138 + (macro + detail) * spawnBlend;

    if (biome === 'forest') {
      h = 138 + (macro * 0.55 + detail * 0.6) * spawnBlend;
      if (ridge > 0.68 && dist > 38) {
        h += (ridge - 0.68) * 32 * spawnBlend;
      }
    } else if (biome === 'desert') {
      const dunes = Math.sin(wx * 0.09 + this.noiseTerrain.noise2D(wx * 0.03, wz * 0.03) * 2.5) * 3.5;
      h = 137 + macro * 0.35 + dunes;
    } else if (biome === 'snow') {
      h = 139 + macro * 0.75 + (ridge > 0.6 ? (ridge - 0.6) * 24 : 0);
    } else if (biome === 'jungle') {
      h = 137 + macro * 0.5 + detail * 0.8;
    } else if (biome === 'corruption' || biome === 'crimson') {
      h = 138 + macro * 0.5 + detail * 0.5;
    } else if (biome === 'ocean') {
      const coastalDist = dist - (this.layout.radius - 36);
      const slope = Math.max(0, Math.min(1, coastalDist / 24));
      h = Math.round(137 - slope * 21 + detail * 0.35);
    }

    // Flatten slightly near Dungeon entrance & Pyramid
    const dungDist = Math.hypot(wx - this.layout.dungeonPos[0], wz - this.layout.dungeonPos[1]);
    if (dungDist < 18) {
      const f = Math.max(0, 1 - dungDist / 18);
      h = h * (1 - f) + 140 * f;
    }

    return Math.max(110, Math.min(176, Math.round(h)));
  }

  public generateChunkColumn(cx: number, cz: number): GeneratedColumnData {
    const blocks = new Uint16Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const walls = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    const chests: GeneratedChestSpawn[] = [];

    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    // 1. Precompute 2D surface height & biome per (lx, lz)
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const surfBiomes: BiomeId[] = new Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const b = this.getSurfaceBiome(wx, wz);
        surfBiomes[lz * CHUNK_SIZE + lx] = b;
        heights[lz * CHUNK_SIZE + lx] = this.getSurfaceHeight(wx, wz, b);
      }
    }

    // 2. Coarse 3D Cave Density Grid (5 x 65 x 5 -> sample every 4 blocks for 64x speed!)
    const gxN = 5;
    const gyN = 65;
    const gzN = 5;
    const caveGrid = new Float32Array(gxN * gyN * gzN);
    for (let gy = 0; gy < gyN; gy++) {
      const wy = gy * 4;
      if (wy < 22 || wy > 175) continue;
      for (let gz = 0; gz < gzN; gz++) {
        const wz = baseZ + gz * 4;
        for (let gx = 0; gx < gxN; gx++) {
          const wx = baseX + gx * 4;
          const nA = this.noiseCaveA.fbm3D(wx * 0.032, wy * 0.045, wz * 0.032, 2);
          const nB = this.noiseCaveB.noise3D(wx * 0.045, wy * 0.045, wz * 0.045);
          // Spaghetti tunnel ridge + chamber pockets
          const tunnel = 1 - Math.abs(nA) * 2.1 - Math.abs(nB) * 1.4;
          caveGrid[(gy * gzN + gz) * gxN + gx] = tunnel;
        }
      }
    }

    const sampleCave = (lx: number, y: number, lz: number): number => {
      const fx = lx * 0.25;
      const fy = y * 0.25;
      const fz = lz * 0.25;
      const x0 = Math.floor(fx);
      const y0 = Math.min(gyN - 2, Math.floor(fy));
      const z0 = Math.floor(fz);
      const tx = fx - x0;
      const ty = fy - y0;
      const tz = fz - z0;
      const strideY = gzN * gxN;
      const i000 = y0 * strideY + z0 * gxN + x0;
      const c000 = caveGrid[i000];
      const c100 = caveGrid[i000 + 1];
      const c010 = caveGrid[i000 + gxN];
      const c110 = caveGrid[i000 + gxN + 1];
      const c001 = caveGrid[i000 + strideY];
      const c101 = caveGrid[i000 + strideY + 1];
      const c011 = caveGrid[i000 + strideY + gxN];
      const c111 = caveGrid[i000 + strideY + gxN + 1];
      const x00 = c000 + (c100 - c000) * tx;
      const x10 = c010 + (c110 - c010) * tx;
      const x01 = c001 + (c101 - c001) * tx;
      const x11 = c011 + (c111 - c011) * tx;
      const y0v = x00 + (x10 - x00) * ty;
      const y1v = x01 + (x11 - x01) * ty;
      return y0v + (y1v - y0v) * tz;
    };

    const seed = this.layout.seed;
    const copperId = this.layout.altarVariant === 'copper' ? BlockId.CopperOre : BlockId.TinOre;
    const ironId = this.layout.ironVariant === 'iron' ? BlockId.IronOre : BlockId.LeadOre;
    const silverId = this.layout.silverVariant === 'silver' ? BlockId.SilverOre : BlockId.TungstenOre;
    const goldId = this.layout.goldVariant === 'gold' ? BlockId.GoldOre : BlockId.PlatinumOre;
    const evilOreId = this.layout.evilType === 'corruption' ? BlockId.DemoniteOre : BlockId.CrimtaneOre;
    const hm1Id = this.layout.hmTier1 === 'cobalt' ? BlockId.CobaltOre : BlockId.PalladiumOre;
    const hm2Id = this.layout.hmTier2 === 'mythril' ? BlockId.MythrilOre : BlockId.OrichalcumOre;
    const hm3Id = this.layout.hmTier3 === 'adamantite' ? BlockId.AdamantiteOre : BlockId.TitaniumOre;

    // 3. Fill base voxel strata + caves + ores + Underworld
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const surf = surfBiomes[lz * CHUNK_SIZE + lx];
        const surfH = heights[lz * CHUNK_SIZE + lx];
        const stoneLine = surfH - 6 - Math.floor(hashCoords(seed, wx, 1, wz) * 4);

        // Bedrock base at y = 0..1
        blocks[idxInColumn(lx, 0, lz)] = BlockId.Obsidian;

        // Underworld (y = 1..27)
        const uwFloor = 7 + Math.round(this.noiseTerrain.noise2D(wx * 0.05, wz * 0.05) * 4);
        const uwCeil = 23 + Math.round(this.noiseTerrain.noise2D(wx * 0.04 + 77, wz * 0.04) * 3);
        for (let y = 1; y <= 27; y++) {
          const i = idxInColumn(lx, y, lz);
          if (y <= uwFloor || y >= uwCeil) {
            const hOre = this.noiseOre.noise3D(wx * 0.14, y * 0.14, wz * 0.14);
            blocks[i] = hOre > 0.45 ? BlockId.Hellstone : BlockId.Ash;
            walls[i] = 6;
          } else if (y <= 8) {
            blocks[i] = BlockId.Lava;
            walls[i] = 6;
          } else {
            blocks[i] = BlockId.Air;
            walls[i] = 6;
          }
        }

        // Main Underground -> Cavern -> Surface (y = 28..surfH)
        for (let y = 28; y <= surfH; y++) {
          const i = idxInColumn(lx, y, lz);
          const biome = this.getBiomeAt(wx, y, wz);
          const caveDensity = sampleCave(lx, y, lz);
          const nearSpawnSurface = Math.hypot(wx, wz) < 35 && y > surfH - 5;

          // Underground Mushroom open grottos
          const isMushroomGrotto = biome === 'underground_mushroom' && caveDensity > 0.06;
          const caveThreshold = biome === 'underground_desert' ? 0.16 : 0.24;

          if (!nearSpawnSurface && (caveDensity > caveThreshold || isMushroomGrotto)) {
            if (y <= 46 && caveDensity > 0.45 && y < 44) {
              blocks[i] = BlockId.Lava;
            } else if (y <= 84 && caveDensity > 0.5 && (biome === 'underground_forest' || biome === 'underground_jungle')) {
              blocks[i] = BlockId.Water;
            } else {
              blocks[i] = BlockId.Air;
            }
            walls[i] = y > 96 ? 1 : 2;
            continue;
          }

          // Solid material based on biome & depth
          let block = BlockId.Stone;
          if (y === surfH) {
            if (surf === 'forest') block = BlockId.Grass;
            else if (surf === 'desert' || surf === 'ocean') block = BlockId.Sand;
            else if (surf === 'snow') block = BlockId.Snow;
            else if (surf === 'jungle') block = BlockId.JungleGrass;
            else if (surf === 'mushroom') block = BlockId.MushroomGrass;
            else if (surf === 'corruption') block = BlockId.CorruptGrass;
            else if (surf === 'crimson') block = BlockId.CrimsonGrass;
            else if (surf === 'hallow') block = BlockId.HallowedGrass;
            else block = BlockId.Stone;
          } else if (y > stoneLine) {
            if (surf === 'desert' || surf === 'ocean') block = BlockId.Sand;
            else if (surf === 'snow') block = BlockId.Snow;
            else if (surf === 'jungle' || surf === 'mushroom') block = BlockId.Mud;
            else block = BlockId.Dirt;
          } else {
            if (biome === 'underground_snow') block = y > 96 ? BlockId.Snow : BlockId.Ice;
            else if (biome === 'underground_desert') block = y > 95 ? BlockId.HardenedSand : BlockId.Sandstone;
            else if (biome === 'underground_jungle') block = BlockId.Mud;
            else if (biome === 'underground_mushroom') block = y === 62 ? BlockId.MushroomGrass : BlockId.Mud;
            else if (biome === 'underground_corruption') block = BlockId.Ebonstone;
            else if (biome === 'underground_crimson') block = BlockId.Crimstone;
            else if (biome === 'underground_hallow') block = BlockId.Pearlstone;
            else {
              // Granite & Marble micro-biomes
              const geo = this.noiseBiome.noise3D(wx * 0.025, y * 0.035, wz * 0.025);
              if (y < 86 && geo > 0.56) block = BlockId.Granite;
              else if (y < 86 && geo < -0.56) block = BlockId.Marble;
              else block = BlockId.Stone;
            }
          }

          // Ores & Gems in rock
          if (y <= stoneLine && (block === BlockId.Stone || block === BlockId.Ice || block === BlockId.Mud || block === BlockId.Ebonstone || block === BlockId.Crimstone || block === BlockId.Pearlstone || block === BlockId.Sandstone)) {
            const o1 = this.noiseOre.noise3D(wx * 0.16, y * 0.16, wz * 0.16);
            const o2 = this.noiseOre.noise3D(wx * 0.19 + 50, y * 0.19, wz * 0.19 + 50);
            if (y > 82 && o1 > 0.54) block = copperId;
            else if (y > 50 && y < 120 && o2 > 0.55) block = ironId;
            else if (y < 92 && o1 < -0.56) block = silverId;
            else if (y < 76 && o2 < -0.58) block = goldId;
            else if ((biome === 'underground_corruption' || biome === 'underground_crimson') && o1 > 0.58) block = evilOreId;
            else if (y < 72 && hashCoords(seed + 19, wx, y, wz) > 0.994) {
              const gems = [BlockId.AmethystBlock, BlockId.TopazBlock, BlockId.SapphireBlock, BlockId.EmeraldBlock, BlockId.RubyBlock, BlockId.DiamondBlock];
              block = gems[Math.floor(hashCoords(seed + 23, wx, y, wz) * gems.length)];
            } else if (this.layout.isHardmode) {
              const hm = this.noiseOre.noise3D(wx * 0.22 + 120, y * 0.22, wz * 0.22 - 80);
              if (y > 70 && hm > 0.58) block = hm1Id;
              else if (y > 45 && y < 88 && hm < -0.58) block = hm2Id;
              else if (y < 64 && Math.abs(hm) > 0.63) block = hm3Id;
              else if (biome === 'underground_jungle' && y < 80 && hashCoords(seed + 71, wx, y, wz) > 0.985) {
                block = BlockId.ChlorophyteOre;
              }
            }
          }

          blocks[i] = block;
          walls[i] = y > stoneLine ? 1 : 2;
        }

        // Water over Ocean or low depressions
        if (surfH < this.layout.seaLevel) {
          for (let y = surfH + 1; y <= this.layout.seaLevel; y++) {
            blocks[idxInColumn(lx, y, lz)] = BlockId.Water;
          }
        }

        // Surface Vegetation, Herbs, Pots, Crystal Shards
        if (surfH >= this.layout.seaLevel && blocks[idxInColumn(lx, surfH, lz)] !== BlockId.Air) {
          const rPlant = hashCoords(seed + 9, wx, surfH, wz);
          if (surf === 'forest') {
            if (rPlant > 0.985) blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Sunflower;
            else if (rPlant > 0.97 && rPlant <= 0.985) blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Daybloom;
            else if (rPlant < 0.008) blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Pot;
          } else if (surf === 'desert' && rPlant > 0.972) {
            const ch = 2 + Math.floor(hashCoords(seed + 11, wx, 0, wz) * 3);
            for (let k = 1; k <= ch; k++) {
              blocks[idxInColumn(lx, surfH + k, lz)] = BlockId.Cactus;
            }
          } else if (surf === 'mushroom' && rPlant > 0.93) {
            blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.GlowingMushroomBlock;
          } else if (surf === 'snow' && rPlant > 0.985) {
            blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Shiverthorn;
          } else if ((surf === 'corruption' || surf === 'crimson') && rPlant > 0.985) {
            blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Deathweed;
          } else if (surf === 'jungle' && rPlant > 0.985) {
            blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Moonglow;
          }
        }

        // Ocean Coral on seafloor
        if (surf === 'ocean' && surfH < this.layout.seaLevel - 2) {
          if (hashCoords(seed + 33, wx, surfH, wz) > 0.955) {
            blocks[idxInColumn(lx, surfH + 1, lz)] = BlockId.Coral;
          }
        }
      }
    }

    // 4. Stamp Caves Features: Life Crystals, Pots, Glowing Mushrooms, Crystal Shards, Surface & Cavern Trees
    this.stampCavesDetails(blocks, baseX, baseZ, heights, surfBiomes);
    this.stampTrees(blocks, baseX, baseZ);

    // 5. Stamp Iconic Terraria Structures intersecting this chunk column
    this.stampFloatingIslands(blocks, chests, baseX, baseZ);
    this.stampUndergroundCabins(blocks, walls, chests, baseX, baseZ);
    this.stampSurfaceChestSpots(blocks, chests, baseX, baseZ, heights, surfBiomes);
    this.stampDungeon(blocks, walls, chests, baseX, baseZ);
    this.stampJungleTemple(blocks, walls, chests, baseX, baseZ);
    this.stampDesertPyramid(blocks, walls, chests, baseX, baseZ);
    this.stampEvilChasmsAndOrbs(blocks, baseX, baseZ);
    this.stampUnderworldTowers(blocks, walls, chests, baseX, baseZ);
    this.stampBeeHives(blocks, baseX, baseZ);

    return { cx, cz, blocks, walls, chests };
  }

  private stampCavesDetails(
    blocks: Uint16Array,
    baseX: number,
    baseZ: number,
    heights: Int16Array,
    surfBiomes: BiomeId[]
  ): void {
    const seed = this.layout.seed;
    for (let lz = 1; lz < CHUNK_SIZE - 1; lz++) {
      for (let lx = 1; lx < CHUNK_SIZE - 1; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const maxY = Math.min(126, heights[lz * CHUNK_SIZE + lx] - 4);
        for (let y = 30; y < maxY; y++) {
          const cur = blocks[idxInColumn(lx, y, lz)];
          const below = blocks[idxInColumn(lx, y - 1, lz)];
          if (cur === BlockId.Air && below !== BlockId.Air && below !== BlockId.Water && below !== BlockId.Lava) {
            const r = hashCoords(seed + 41, wx, y, wz);
            if (y < 92 && r > 0.9965) {
              blocks[idxInColumn(lx, y, lz)] = BlockId.LifeCrystalBlock;
            } else if (r > 0.99 && r <= 0.993) {
              blocks[idxInColumn(lx, y, lz)] = BlockId.Pot;
            } else if (below === BlockId.MushroomGrass && r > 0.85) {
              blocks[idxInColumn(lx, y, lz)] = BlockId.GlowingMushroomBlock;
            } else if (this.layout.isHardmode && below === BlockId.Pearlstone && r > 0.91) {
              blocks[idxInColumn(lx, y, lz)] = BlockId.CrystalShard;
            } else if (y < 52 && r < 0.004) {
              blocks[idxInColumn(lx, y, lz)] = BlockId.Blinkroot;
            }
          }
        }
        // Surface Waterleaf on desert sand near water
        const s = surfBiomes[lz * CHUNK_SIZE + lx];
        if (s === 'desert') {
          const sh = heights[lz * CHUNK_SIZE + lx];
          if (sh >= this.layout.seaLevel && blocks[idxInColumn(lx, sh + 1, lz)] === BlockId.Air) {
            if (hashCoords(seed + 49, wx, sh, wz) > 0.99) {
              blocks[idxInColumn(lx, sh + 1, lz)] = BlockId.Waterleaf;
            }
          }
        }
      }
    }
  }

  private stampTrees(blocks: Uint16Array, baseX: number, baseZ: number): void {
    // Check an expanded 2-block margin around chunk so canopies crossing chunk boundaries stitch seamlessly!
    const cellSize = 6;
    const minGX = Math.floor((baseX - 3) / cellSize);
    const maxGX = Math.floor((baseX + CHUNK_SIZE + 3) / cellSize);
    const minGZ = Math.floor((baseZ - 3) / cellSize);
    const maxGZ = Math.floor((baseZ + CHUNK_SIZE + 3) / cellSize);

    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        const prob = hashCoords(this.layout.seed + 700, gx, gz);
        if (prob > 0.38) continue;

        const tx = gx * cellSize + 1 + Math.floor(hashCoords(this.layout.seed + 701, gx, gz) * (cellSize - 2));
        const tz = gz * cellSize + 1 + Math.floor(hashCoords(this.layout.seed + 702, gx, gz) * (cellSize - 2));

        // Leave central spawn clear within 8 blocks of (0,0)
        if (Math.hypot(tx, tz) < 9) continue;

        const surf = this.getSurfaceBiome(tx, tz);
        if (surf === 'desert' || surf === 'ocean' || surf === 'dungeon') continue;

        const groundY = this.getSurfaceHeight(tx, tz, surf);
        if (groundY < this.layout.seaLevel) continue;

        let logId = BlockId.Wood;
        let leafId = BlockId.Leaf;
        let height = 5 + Math.floor(hashCoords(this.layout.seed + 703, gx, gz) * 4);

        if (surf === 'snow') {
          logId = BlockId.BorealWood;
          leafId = BlockId.BorealLeaf;
        } else if (surf === 'jungle') {
          logId = BlockId.RichMahogany;
          leafId = BlockId.JungleLeaf;
          height += 3;
        } else if (surf === 'corruption') {
          logId = BlockId.Ebonwood;
          leafId = BlockId.Ebonwood;
        } else if (surf === 'crimson') {
          logId = BlockId.Shadewood;
          leafId = BlockId.Shadewood;
        } else if (surf === 'hallow') {
          logId = BlockId.Pearlwood;
          leafId = BlockId.HallowedLeaf;
        } else if (surf === 'mushroom') {
          logId = BlockId.Wood;
          leafId = BlockId.GlowingMushroomBlock;
        }

        // Trunk
        for (let dy = 1; dy <= height; dy++) {
          this.setIfInChunk(blocks, baseX, baseZ, tx, groundY + dy, tz, logId);
        }
        // 3D Canopy
        const topY = groundY + height;
        for (let dy = -1; dy <= 2; dy++) {
          const rad = dy === 2 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 2 || dy === -1)) continue;
              if (dx === 0 && dz === 0 && dy <= 0) continue;
              this.setIfInChunk(blocks, baseX, baseZ, tx + dx, topY + dy, tz + dz, leafId);
            }
          }
        }
      }
    }
  }

  private stampFloatingIslands(
    blocks: Uint16Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    for (const isl of this.layout.floatingIslands) {
      if (
        isl.x + isl.radius + 2 < baseX ||
        isl.x - isl.radius - 2 >= baseX + CHUNK_SIZE ||
        isl.z + isl.radius + 2 < baseZ ||
        isl.z - isl.radius - 2 >= baseZ + CHUNK_SIZE
      ) {
        continue;
      }

      const r = isl.radius;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dz);
          if (d > r) continue;
          const wx = isl.x + dx;
          const wz = isl.z + dz;
          const bowlDepth = Math.round((1 - d / r) * 5);
          for (let dy = -bowlDepth; dy <= 1; dy++) {
            const wy = isl.y + dy;
            let b = BlockId.Dirt;
            if (dy === 1) b = BlockId.Grass;
            else if (dy === -bowlDepth) b = d < r * 0.45 ? BlockId.RainCloud : BlockId.Cloud;
            else if (dy < -1) b = BlockId.Cloud;
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, b);
          }
        }
      }

      // Skyware House at center
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          for (let dy = 2; dy <= 6; dy++) {
            const isWall = Math.abs(dx) === 3 || Math.abs(dz) === 3 || dy === 2 || dy === 6;
            const isDoor = dz === 3 && Math.abs(dx) <= 0 && (dy === 3 || dy === 4);
            const wx = isl.x + dx;
            const wz = isl.z + dz;
            const wy = isl.y + dy;
            if (isDoor) {
              this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air);
            } else if (isWall) {
              this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.SunplateBlock);
            } else {
              this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air);
            }
          }
        }
      }

      // Skyware Chest & Torch inside Skyware house
      this.setIfInChunk(blocks, baseX, baseZ, isl.x, isl.y + 3, isl.z, BlockId.SkywareChest);
      this.setIfInChunk(blocks, baseX, baseZ, isl.x - 2, isl.y + 4, isl.z - 2, BlockId.Torch);
      if (this.inChunk(isl.x, isl.z, baseX, baseZ)) {
        chests.push({ x: isl.x, y: isl.y + 3, z: isl.z, lootKind: 'skyware' });
      }
    }
  }

  private stampUndergroundCabins(
    blocks: Uint16Array,
    walls: Uint8Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    const grid = 44;
    const minGX = Math.floor((baseX - 8) / grid);
    const maxGX = Math.floor((baseX + CHUNK_SIZE + 8) / grid);
    const minGZ = Math.floor((baseZ - 8) / grid);
    const maxGZ = Math.floor((baseZ + CHUNK_SIZE + 8) / grid);

    for (let gz = minGZ; gz <= maxGZ; gz++) {
      for (let gx = minGX; gx <= maxGX; gx++) {
        if (hashCoords(this.layout.seed + 880, gx, gz) > 0.36) continue;
        const cx = gx * grid + 22;
        const cz = gz * grid + 22;
        const cy = 48 + Math.floor(hashCoords(this.layout.seed + 881, gx, gz) * 56);
        const biome = this.getBiomeAt(cx, cy, cz);
        if (biome === 'dungeon' || biome === 'temple') continue;

        let plank = BlockId.WoodPlank;
        let chestBlock = BlockId.GoldChest;
        let lootKind: keyof typeof CHEST_PRIMARY_LOOT = 'underground_gold';
        if (biome === 'underground_snow') {
          plank = BlockId.BorealWood;
          chestBlock = BlockId.FrozenChest;
          lootKind = 'frozen';
        } else if (biome === 'underground_jungle') {
          plank = BlockId.RichMahogany;
          chestBlock = BlockId.IvyChest;
          lootKind = 'ivy';
        }

        for (let dx = -4; dx <= 4; dx++) {
          for (let dz = -4; dz <= 4; dz++) {
            for (let dy = 0; dy <= 4; dy++) {
              const wx = cx + dx;
              const wz = cz + dz;
              const wy = cy + dy;
              const shell = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === 0 || dy === 4;
              const doorHole = dz === 4 && dx === 0 && (dy === 1 || dy === 2);
              if (doorHole) {
                this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, dy === 1 ? BlockId.WoodDoorClosed : BlockId.Air, walls, 3);
              } else if (shell) {
                this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, plank, walls, 3);
              } else {
                this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air, walls, 3);
              }
            }
          }
        }

        this.setIfInChunk(blocks, baseX, baseZ, cx, cy + 1, cz, chestBlock);
        this.setIfInChunk(blocks, baseX, baseZ, cx - 2, cy + 1, cz - 2, BlockId.WoodTable);
        this.setIfInChunk(blocks, baseX, baseZ, cx - 1, cy + 1, cz - 2, BlockId.WoodChair);
        this.setIfInChunk(blocks, baseX, baseZ, cx + 2, cy + 3, cz - 3, BlockId.Torch);
        if (this.inChunk(cx, cz, baseX, baseZ)) {
          chests.push({ x: cx, y: cy + 1, z: cz, lootKind });
        }
      }
    }
  }

  private stampSurfaceChestSpots(
    blocks: Uint16Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number,
    heights: Int16Array,
    surfBiomes: BiomeId[]
  ): void {
    const grid = 52;
    const gx = Math.floor((baseX + 8) / grid);
    const gz = Math.floor((baseZ + 8) / grid);
    const cx = gx * grid + 26;
    const cz = gz * grid + 26;
    if (!this.inChunk(cx, cz, baseX, baseZ)) return;
    if (hashCoords(this.layout.seed + 920, gx, gz) > 0.55) return;

    const lx = cx - baseX;
    const lz = cz - baseZ;
    const surf = surfBiomes[lz * CHUNK_SIZE + lx];
    const h = heights[lz * CHUNK_SIZE + lx];
    if (h < this.layout.seaLevel || surf === 'dungeon') return;

    blocks[idxInColumn(lx, h + 1, lz)] = BlockId.WoodChest;
    chests.push({ x: cx, y: h + 1, z: cz, lootKind: 'surface_wood' });
  }

  private stampDungeon(
    blocks: Uint16Array,
    walls: Uint8Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    const [dx0, dz0] = this.layout.dungeonPos;
    if (
      dx0 + 26 < baseX ||
      dx0 - 26 >= baseX + CHUNK_SIZE ||
      dz0 + 26 < baseZ ||
      dz0 - 26 >= baseZ + CHUNK_SIZE
    ) {
      return;
    }

    const brickChoices = [BlockId.BlueDungeonBrick, BlockId.GreenDungeonBrick, BlockId.PinkDungeonBrick];
    const brick = brickChoices[Math.abs(this.layout.seed) % 3];
    const surfY = 140;

    // Surface Entrance Pavilion
    for (let dx = -7; dx <= 7; dx++) {
      for (let dz = -7; dz <= 7; dz++) {
        for (let dy = -2; dy <= 6; dy++) {
          const wx = dx0 + dx;
          const wz = dz0 + dz;
          const wy = surfY + dy;
          const isOuter = Math.abs(dx) === 7 || Math.abs(dz) === 7 || dy === 6 || dy <= 0;
          const isEntrance = dz === 7 && Math.abs(dx) <= 2 && dy >= 1 && dy <= 4;
          const isStairShaft = Math.abs(dx) <= 3 && Math.abs(dz) <= 3 && dy <= 0;
          if (isStairShaft || isEntrance) {
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air, walls, 4);
          } else if (isOuter) {
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, brick, walls, 4);
          } else {
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air, walls, 4);
          }
        }
      }
    }

    // Descending Spiral Shaft & Crypt Chambers down to Y = 44
    for (let wy = 44; wy < surfY; wy++) {
      const level = Math.floor((surfY - wy) / 14);
      const roomRad = (surfY - wy) % 14 <= 6 ? 12 : 4;
      for (let dx = -roomRad - 2; dx <= roomRad + 2; dx++) {
        for (let dz = -roomRad - 2; dz <= roomRad + 2; dz++) {
          const wx = dx0 + dx;
          const wz = dz0 + dz;
          const wallShell = Math.abs(dx) > roomRad || Math.abs(dz) > roomRad || wy === 44;
          if (wallShell) {
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, brick, walls, 4);
          } else {
            this.setIfInChunk(blocks, baseX, baseZ, wx, wy, wz, BlockId.Air, walls, 4);
          }
        }
      }
      // Spiral stair platforms
      const ang = wy * 0.45;
      const px = Math.round(dx0 + Math.cos(ang) * 2.5);
      const pz = Math.round(dz0 + Math.sin(ang) * 2.5);
      this.setIfInChunk(blocks, baseX, baseZ, px, wy, pz, BlockId.WoodPlatform);

      // Level chests & water candles & spikes
      if ((surfY - wy) % 14 === 5 && level > 0) {
        const cx = dx0 + (level % 2 === 0 ? 7 : -7);
        const cz = dz0 + (level % 2 === 0 ? 7 : -7);
        this.setIfInChunk(blocks, baseX, baseZ, cx, wy, cz, BlockId.LockedGoldChest);
        this.setIfInChunk(blocks, baseX, baseZ, cx - 1, wy + 1, cz, BlockId.WaterCandle);
        this.setIfInChunk(blocks, baseX, baseZ, cx, wy, cz - 2, BlockId.Bookcase);
        if (this.inChunk(cx, cz, baseX, baseZ)) {
          chests.push({ x: cx, y: wy, z: cz, lootKind: 'dungeon_gold' });
        }
      }
    }
  }

  private stampJungleTemple(
    blocks: Uint16Array,
    walls: Uint8Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    const [tx, tz] = this.layout.templePos;
    if (
      tx + 20 < baseX ||
      tx - 20 >= baseX + CHUNK_SIZE ||
      tz + 20 < baseZ ||
      tz - 20 >= baseZ + CHUNK_SIZE
    ) {
      return;
    }

    for (let dx = -16; dx <= 16; dx++) {
      for (let dz = -16; dz <= 16; dz++) {
        for (let dy = 44; dy <= 66; dy++) {
          const wx = tx + dx;
          const wz = tz + dz;
          const shell =
            Math.abs(dx) >= 14 ||
            Math.abs(dz) >= 14 ||
            dy <= 46 ||
            dy >= 64;
          const door = dz >= 14 && Math.abs(dx) <= 1 && dy >= 47 && dy <= 50;
          if (door) {
            this.setIfInChunk(blocks, baseX, baseZ, wx, dy, wz, dz === 14 ? BlockId.LihzahrdDoorClosed : BlockId.Air, walls, 5);
          } else if (shell) {
            this.setIfInChunk(blocks, baseX, baseZ, wx, dy, wz, BlockId.LihzahrdBrick, walls, 5);
          } else {
            this.setIfInChunk(blocks, baseX, baseZ, wx, dy, wz, BlockId.Air, walls, 5);
          }
        }
      }
    }

    this.setIfInChunk(blocks, baseX, baseZ, tx, 47, tz, BlockId.LihzahrdAltar);
    this.setIfInChunk(blocks, baseX, baseZ, tx + 6, 47, tz + 6, BlockId.GoldChest);
    this.setIfInChunk(blocks, baseX, baseZ, tx - 5, 49, tz - 5, BlockId.Torch);
    this.setIfInChunk(blocks, baseX, baseZ, tx + 5, 49, tz - 5, BlockId.Torch);
    if (this.inChunk(tx + 6, tz + 6, baseX, baseZ)) {
      chests.push({ x: tx + 6, y: 47, z: tz + 6, lootKind: 'ivy' });
    }
  }

  private stampDesertPyramid(
    blocks: Uint16Array,
    walls: Uint8Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    const [px, pz] = this.layout.pyramidPos;
    const baseY = 134;
    if (
      px + 18 < baseX ||
      px - 18 >= baseX + CHUNK_SIZE ||
      pz + 18 < baseZ ||
      pz - 18 >= baseZ + CHUNK_SIZE
    ) {
      return;
    }

    for (let dy = 0; dy <= 14; dy++) {
      const r = 15 - dy;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const hollow = dy >= 1 && dy <= 5 && Math.abs(dx) <= 4 && Math.abs(dz) <= 4;
          const b = hollow ? BlockId.Air : BlockId.Sandstone;
          this.setIfInChunk(blocks, baseX, baseZ, px + dx, baseY + dy, pz + dz, b, walls, 2);
        }
      }
    }
    this.setIfInChunk(blocks, baseX, baseZ, px, baseY + 1, pz, BlockId.GoldChest);
    this.setIfInChunk(blocks, baseX, baseZ, px - 2, baseY + 3, pz - 2, BlockId.Torch);
    if (this.inChunk(px, pz, baseX, baseZ)) {
      chests.push({ x: px, y: baseY + 1, z: pz, lootKind: 'underground_gold' });
    }
  }

  private stampEvilChasmsAndOrbs(blocks: Uint16Array, baseX: number, baseZ: number): void {
    // 4 Evil Chasm / Heart shafts inside the Evil sector
    const r = this.layout.radius * 0.45;
    const angleBase = -Math.PI * 0.22;
    const isCorrupt = this.layout.evilType === 'corruption';
    const wallBlock = isCorrupt ? BlockId.Ebonstone : BlockId.Crimstone;
    const orbBlock = isCorrupt ? BlockId.ShadowOrb : BlockId.CrimsonHeart;
    const altarBlock = isCorrupt ? BlockId.DemonAltar : BlockId.CrimsonAltar;

    for (let k = 0; k < 4; k++) {
      const ang = angleBase + (k - 1.5) * 0.18;
      const sx = Math.round(Math.cos(ang) * r);
      const sz = Math.round(Math.sin(ang) * r);
      if (
        sx + 10 < baseX ||
        sx - 10 >= baseX + CHUNK_SIZE ||
        sz + 10 < baseZ ||
        sz - 10 >= baseZ + CHUNK_SIZE
      ) {
        continue;
      }

      // Vertical chasm down to Y = 88
      for (let wy = 88; wy <= 146; wy++) {
        const rad = wy < 96 ? 5 : 2;
        for (let dx = -rad - 2; dx <= rad + 2; dx++) {
          for (let dz = -rad - 2; dz <= rad + 2; dz++) {
            const dist = Math.hypot(dx, dz);
            if (dist <= rad) {
              this.setIfInChunk(blocks, baseX, baseZ, sx + dx, wy, sz + dz, BlockId.Air);
            } else if (dist <= rad + 1.8 && wy <= 136) {
              this.setIfInChunk(blocks, baseX, baseZ, sx + dx, wy, sz + dz, wallBlock);
            }
          }
        }
      }
      this.setIfInChunk(blocks, baseX, baseZ, sx, 90, sz, orbBlock);
      this.setIfInChunk(blocks, baseX, baseZ, sx + 2, 89, sz, altarBlock);
    }
  }

  private stampUnderworldTowers(
    blocks: Uint16Array,
    walls: Uint8Array,
    chests: GeneratedChestSpawn[],
    baseX: number,
    baseZ: number
  ): void {
    const grid = 64;
    const gx = Math.floor((baseX + 8) / grid);
    const gz = Math.floor((baseZ + 8) / grid);
    const tx = gx * grid + 32;
    const tz = gz * grid + 32;
    if (
      tx + 8 < baseX ||
      tx - 8 >= baseX + CHUNK_SIZE ||
      tz + 8 < baseZ ||
      tz - 8 >= baseZ + CHUNK_SIZE
    ) {
      return;
    }
    if (hashCoords(this.layout.seed + 950, gx, gz) > 0.55) return;

    const baseY = 9;
    for (let dx = -5; dx <= 5; dx++) {
      for (let dz = -5; dz <= 5; dz++) {
        for (let dy = 0; dy <= 11; dy++) {
          const shell = Math.abs(dx) === 5 || Math.abs(dz) === 5 || dy === 0 || dy === 6 || dy === 11;
          const door = (dz === 5 || dx === 5) && Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && (dy === 1 || dy === 2);
          const b = door ? BlockId.Air : shell ? BlockId.ObsidianBrick : BlockId.Air;
          this.setIfInChunk(blocks, baseX, baseZ, tx + dx, baseY + dy, tz + dz, b, walls, 6);
        }
      }
    }
    this.setIfInChunk(blocks, baseX, baseZ, tx, baseY + 1, tz, BlockId.ShadowChest);
    this.setIfInChunk(blocks, baseX, baseZ, tx - 2, baseY + 1, tz - 2, BlockId.Hellforge);
    this.setIfInChunk(blocks, baseX, baseZ, tx + 2, baseY + 3, tz - 3, BlockId.Torch);
    if (this.inChunk(tx, tz, baseX, baseZ)) {
      chests.push({ x: tx, y: baseY + 1, z: tz, lootKind: 'shadow_chest' });
    }
  }

  private stampBeeHives(blocks: Uint16Array, baseX: number, baseZ: number): void {
    const grid = 56;
    const gx = Math.floor((baseX + 8) / grid);
    const gz = Math.floor((baseZ + 8) / grid);
    const hx = gx * grid + 28;
    const hz = gz * grid + 28;
    const hy = 74;
    if (
      hx + 9 < baseX ||
      hx - 9 >= baseX + CHUNK_SIZE ||
      hz + 9 < baseZ ||
      hz - 9 >= baseZ + CHUNK_SIZE
    ) {
      return;
    }
    if (this.getSurfaceBiome(hx, hz) !== 'jungle') return;
    if (hashCoords(this.layout.seed + 980, gx, gz) > 0.45) return;

    for (let dx = -7; dx <= 7; dx++) {
      for (let dz = -7; dz <= 7; dz++) {
        for (let dy = -6; dy <= 6; dy++) {
          const d = Math.hypot(dx, dy, dz);
          if (d <= 7.2 && d >= 5.2) {
            this.setIfInChunk(blocks, baseX, baseZ, hx + dx, hy + dy, hz + dz, BlockId.Hive);
          } else if (d < 5.2) {
            const b = dy <= -2 ? BlockId.Honey : BlockId.Air;
            this.setIfInChunk(blocks, baseX, baseZ, hx + dx, hy + dy, hz + dz, b);
          }
        }
      }
    }
    this.setIfInChunk(blocks, baseX, baseZ, hx, hy - 1, hz, BlockId.Larva);
  }

  private inChunk(wx: number, wz: number, baseX: number, baseZ: number): boolean {
    return wx >= baseX && wx < baseX + CHUNK_SIZE && wz >= baseZ && wz < baseZ + CHUNK_SIZE;
  }

  private setIfInChunk(
    blocks: Uint16Array,
    baseX: number,
    baseZ: number,
    wx: number,
    wy: number,
    wz: number,
    blockId: BlockId,
    walls?: Uint8Array,
    wallVal?: number
  ): void {
    if (wy < 1 || wy >= WORLD_HEIGHT - 1) return;
    const lx = wx - baseX;
    const lz = wz - baseZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    const i = idxInColumn(lx, wy, lz);
    blocks[i] = blockId;
    if (walls && wallVal !== undefined) {
      walls[i] = wallVal;
    }
  }
}
