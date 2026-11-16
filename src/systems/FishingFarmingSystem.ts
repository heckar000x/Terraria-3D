import { getItemDef } from '@/data/items';
import { BiomeId, BlockId, CharacterSave } from '@/types/game';
import { WorldManager } from '@/world/WorldManager';
import { InventorySystem } from './InventorySystem';

export interface FishingResult {
  success: boolean;
  caughtItemId?: string;
  caughtCount?: number;
  summonDukeFishron?: boolean;
  message: string;
}

export class FishingFarmingSystem {
  public static castLine(
    world: WorldManager,
    char: CharacterSave,
    fishingPower: number,
    targetX: number,
    targetY: number,
    targetZ: number
  ): FishingResult {
    // Verify water/lava/honey nearby target
    let liquid: BlockId | null = null;
    for (let dy = -2; dy <= 1; dy++) {
      const b = world.getBlock(targetX, targetY + dy, targetZ);
      if (b === BlockId.Water || b === BlockId.Lava || b === BlockId.Honey) {
        liquid = b;
        break;
      }
    }
    if (!liquid) {
      return { success: false, message: 'Aim at a body of Water, Lava, or Honey to fish!' };
    }

    // Find bait in ammo or inventory
    let baitSlot: { itemId: string; power: number } | null = null;
    for (const s of [...char.ammo, ...char.inventory]) {
      if (!s) continue;
      const def = getItemDef(s.itemId);
      if (def?.baitPower) {
        baitSlot = { itemId: s.itemId, power: def.baitPower };
        break;
      }
    }
    if (!baitSlot) {
      return { success: false, message: 'You need Bait (e.g. Worm) in your inventory to fish!' };
    }

    const biome = world.getBiomeAt(targetX, targetY, targetZ);
    if (baitSlot.itemId === 'truffle_worm') {
      if (biome === 'ocean') {
        InventorySystem.consumeItem(char, 'truffle_worm', 1);
        return {
          success: true,
          summonDukeFishron: true,
          message: 'Duke Fishron has awoken from the Ocean depths!',
        };
      }
      return { success: false, message: 'Truffle Worm must be used at the Ocean!' };
    }

    // Consume bait with chance based on power
    if (Math.random() < 0.55) {
      InventorySystem.consumeItem(char, baitSlot.itemId, 1);
    }

    const totalPower = fishingPower + baitSlot.power;
    const roll = Math.random();
    const crateChance = Math.min(0.28, 0.08 + totalPower * 0.002);

    if (roll < crateChance) {
      const rCrate = Math.random();
      const crateId = rCrate < 0.15 ? 'golden_crate' : rCrate < 0.45 ? 'iron_crate' : 'wooden_crate';
      return { success: true, caughtItemId: crateId, caughtCount: 1, message: `Reeled in a ${getItemDef(crateId)?.name}!` };
    }

    if (roll < crateChance + 0.04 && biome === 'hallow' && world.meta.isHardmode) {
      return { success: true, caughtItemId: 'golden_carp', caughtCount: 1, message: 'Rare catch: Golden Carp!' };
    }

    const fishId = biome === 'ocean' || biome === 'jungle' ? 'trout' : Math.random() < 0.1 ? 'golden_carp' : 'bass';
    return { success: true, caughtItemId: fishId, caughtCount: 1, message: `Caught a ${getItemDef(fishId)?.name}!` };
  }

  public static tryPlantAcornOrHerb(world: WorldManager, itemId: string, wx: number, wy: number, wz: number): boolean {
    if (world.getBlock(wx, wy, wz) !== BlockId.Air) return false;
    const below = world.getBlock(wx, wy - 1, wz);

    if (itemId === 'acorn') {
      if (below !== BlockId.Grass && below !== BlockId.JungleGrass && below !== BlockId.HallowedGrass && below !== BlockId.CorruptGrass && below !== BlockId.CrimsonGrass && below !== BlockId.Snow) {
        return false;
      }
      const log = below === BlockId.JungleGrass ? BlockId.RichMahogany : below === BlockId.Snow ? BlockId.BorealWood : BlockId.Wood;
      const leaf = below === BlockId.JungleGrass ? BlockId.JungleLeaf : below === BlockId.Snow ? BlockId.BorealLeaf : BlockId.Leaf;
      const height = 5 + Math.floor(Math.random() * 3);
      for (let dy = 0; dy < height; dy++) world.setBlock(wx, wy + dy, wz, log);
      const top = wy + height - 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            if (world.getBlock(wx + dx, top + dy, wz + dz) === BlockId.Air) {
              world.setBlock(wx + dx, top + dy, wz + dz, leaf);
            }
          }
        }
      }
      return true;
    }

    const herbMap: Record<string, BlockId> = {
      daybloom: BlockId.Daybloom,
      moonglow: BlockId.Moonglow,
      blinkroot: BlockId.Blinkroot,
      waterleaf: BlockId.Waterleaf,
      fireblossom: BlockId.Fireblossom,
      shiverthorn: BlockId.Shiverthorn,
      deathweed: BlockId.Deathweed,
    };
    if (herbMap[itemId] && (below === BlockId.Grass || below === BlockId.Dirt || below === BlockId.Sand || below === BlockId.Snow || below === BlockId.Ash || below === BlockId.Mud)) {
      world.setBlock(wx, wy, wz, herbMap[itemId]);
      return true;
    }

    return false;
  }
}
