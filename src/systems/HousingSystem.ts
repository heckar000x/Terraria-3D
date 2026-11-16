import { getBlockDef, isSolidBlock } from '@/data/blocks';
import { getItemDef as getItem } from '@/data/items';
import { NPCS } from '@/data/npcs';
import { BlockId, CharacterSave, NpcDef, WorldMeta } from '@/types/game';
import { WorldManager } from '@/world/WorldManager';
import { InventorySystem } from './InventorySystem';

export interface HouseValidationResult {
  valid: boolean;
  reason: string;
  interiorCount: number;
  hasLight: boolean;
  hasTable: boolean;
  hasChair: boolean;
  hasDoor: boolean;
  center: [number, number, number];
}

export class HousingSystem {
  public static validateHouse(world: WorldManager, startX: number, startY: number, startZ: number): HouseValidationResult {
    const sx = Math.floor(startX);
    const sy = Math.floor(startY);
    const sz = Math.floor(startZ);

    if (isSolidBlock(world.getBlock(sx, sy, sz))) {
      return { valid: false, reason: 'Stand inside an empty room to check housing.', interiorCount: 0, hasLight: false, hasTable: false, hasChair: false, hasDoor: false, center: [sx, sy, sz] };
    }

    const visited = new Set<string>();
    const queue: [number, number, number][] = [[sx, sy, sz]];
    let hasLight = false;
    let hasTable = false;
    let hasChair = false;
    let hasDoor = false;
    let evilBlocks = 0;
    let sumX = 0, sumY = 0, sumZ = 0;

    const maxExtent = 10;
    const maxVolume = 520;

    while (queue.length > 0) {
      const [x, y, z] = queue.shift()!;
      const k = `${x},${y},${z}`;
      if (visited.has(k)) continue;
      visited.add(k);

      if (
        Math.abs(x - sx) > maxExtent ||
        Math.abs(z - sz) > maxExtent ||
        y - sy > 8 ||
        sy - y > 5 ||
        visited.size > maxVolume
      ) {
        return {
          valid: false,
          reason: 'Room is not fully enclosed (needs walls, floor & roof).',
          interiorCount: visited.size,
          hasLight,
          hasTable,
          hasChair,
          hasDoor,
          center: [sx, sy, sz],
        };
      }

      sumX += x; sumY += y; sumZ += z;

      const curBlock = world.getBlock(x, y, z);
      const curDef = getBlockDef(curBlock);
      if (curDef.isHousingLight) hasLight = true;
      if (curDef.isHousingTable) hasTable = true;
      if (curDef.isHousingChair) hasChair = true;
      if (curDef.isHousingDoor) hasDoor = true;

      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nb = world.getBlock(nx, ny, nz);
        const ndef = getBlockDef(nb);
        if (ndef.isHousingLight) hasLight = true;
        if (ndef.isHousingTable) hasTable = true;
        if (ndef.isHousingChair) hasChair = true;
        if (ndef.isHousingDoor) hasDoor = true;

        if (nb === BlockId.Ebonstone || nb === BlockId.Crimstone || nb === BlockId.CorruptGrass || nb === BlockId.CrimsonGrass) {
          evilBlocks++;
        }

        // Doors / Platforms seal rooms while counting as entrances!
        if (!ndef.solid || (nb !== BlockId.Air && ndef.renderMode !== 'cube' && !ndef.isHousingDoor && nb !== BlockId.WoodPlatform)) {
          if (!visited.has(`${nx},${ny},${nz}`)) {
            queue.push([nx, ny, nz]);
          }
        }
      }
    }

    const count = visited.size;
    const center: [number, number, number] = [
      Math.round(sumX / Math.max(1, count)),
      Math.max(2, Math.floor(sy)),
      Math.round(sumZ / Math.max(1, count)),
    ];

    if (count < 16) {
      return { valid: false, reason: 'Room is too small (needs at least 16 interior blocks).', interiorCount: count, hasLight, hasTable, hasChair, hasDoor, center };
    }
    if (evilBlocks >= 10) {
      return { valid: false, reason: 'This area is too Corrupted/Crimson for Town NPCs.', interiorCount: count, hasLight, hasTable, hasChair, hasDoor, center };
    }
    const missing: string[] = [];
    if (!hasLight) missing.push('Light Source (Torch)');
    if (!hasTable) missing.push('Table / Work Bench');
    if (!hasChair) missing.push('Chair / Bed');
    if (!hasDoor) missing.push('Door / Platform');

    if (missing.length > 0) {
      return {
        valid: false,
        reason: `Missing: ${missing.join(', ')}`,
        interiorCount: count,
        hasLight,
        hasTable,
        hasChair,
        hasDoor,
        center,
      };
    }

    return {
      valid: true,
      reason: 'This housing is suitable!',
      interiorCount: count,
      hasLight,
      hasTable,
      hasChair,
      hasDoor,
      center,
    };
  }

  public static evaluateUnlockedNpcs(worldMeta: WorldMeta, char: CharacterSave): string[] {
    const unlocked = new Set<string>(worldMeta.unlockedNpcs);
    unlocked.add('guide');

    const totalCopper = InventorySystem.getTotalCopper(char);
    if (totalCopper >= 5000) unlocked.add('merchant'); // 50 Silver
    if (char.maxHp >= 120) unlocked.add('nurse');

    const hasExplosive = char.inventory.some((s) => s && (s.itemId === 'grenade' || s.itemId === 'explosives'));
    if (hasExplosive) unlocked.add('demolitionist');

    const hasGunOrBullet = [...char.inventory, ...char.ammo].some((s) => {
      if (!s) return false;
      const d = getItem(s.itemId);
      return d?.weaponType === 'gun' || d?.ammoType === 'bullet';
    });
    if (hasGunOrBullet) unlocked.add('arms_dealer');

    const preHmBosses = ['king_slime', 'eye_of_cthulhu', 'eater_of_worlds', 'brain_of_cthulhu', 'queen_bee', 'skeletron'];
    if (preHmBosses.some((b) => worldMeta.defeatedBosses.includes(b))) {
      unlocked.add('dryad');
      unlocked.add('angler');
    }
    if (worldMeta.defeatedBosses.includes('goblin_army')) unlocked.add('goblin_tinkerer');
    if (worldMeta.defeatedBosses.includes('skeletron')) {
      unlocked.add('mechanic');
      unlocked.add('clothier');
    }
    if (worldMeta.defeatedBosses.includes('queen_bee')) unlocked.add('witch_doctor');
    if (worldMeta.isHardmode) {
      unlocked.add('wizard');
      unlocked.add('truffle');
    }
    if (['the_twins', 'the_destroyer', 'skeletron_prime'].some((b) => worldMeta.defeatedBosses.includes(b))) {
      unlocked.add('steampunker');
    }
    if (worldMeta.defeatedBosses.includes('pirate_invasion')) unlocked.add('pirate');
    if (worldMeta.defeatedBosses.includes('plantera')) unlocked.add('cyborg');

    worldMeta.unlockedNpcs = Array.from(unlocked);
    return worldMeta.unlockedNpcs;
  }

  public static getHappinessPriceMultiplier(npc: NpcDef, world: WorldManager, housePos: [number, number, number]): { mult: number; mood: string } {
    const biome = world.getBiomeAt(housePos[0], housePos[1], housePos[2]);
    let mult = 1.0;
    const notes: string[] = [];

    if (npc.preferredBiomes.includes(biome)) {
      mult *= 0.88;
      notes.push(`loves ${biome.replace('_', ' ')}`);
    } else if (npc.dislikedBiomes.includes(biome)) {
      mult *= 1.15;
      notes.push(`dislikes ${biome.replace('_', ' ')}`);
    }

    // Check neighboring NPCs within 25 blocks
    for (const h of world.meta.npcHouses) {
      if (h.npcId === npc.id) continue;
      const dist = Math.hypot(h.x - housePos[0], h.z - housePos[2]);
      if (dist <= 28) {
        if (npc.lovedNpcs.includes(h.npcId)) {
          mult *= 0.9;
          notes.push(`happy near ${h.npcId}`);
        } else if (npc.dislikedNpcs.includes(h.npcId)) {
          mult *= 1.12;
          notes.push(`annoyed by ${h.npcId}`);
        }
      }
    }

    mult = Math.max(0.75, Math.min(1.45, Number(mult.toFixed(2))));
    const mood = notes.length > 0 ? notes.join(', ') : 'content here';
    return { mult, mood };
  }
}
