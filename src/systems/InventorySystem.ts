import { getItemDef } from '@/data/items';
import { MODIFIERS } from '@/data/modifiers';
import { RECIPES } from '@/data/recipes';
import {
  ActiveBuff,
  CharacterSave,
  EquipmentBonuses,
  ItemStack,
  RecipeDef,
} from '@/types/game';

export interface ComputedPlayerStats {
  defense: number;
  maxHp: number;
  maxMana: number;
  moveSpeedMult: number;
  meleeDamageMult: number;
  rangedDamageMult: number;
  magicDamageMult: number;
  summonDamageMult: number;
  critChanceBonus: number;
  meleeSpeedMult: number;
  manaCostMult: number;
  maxMinions: number;
  maxSentries: number;
  doubleJump: boolean;
  jumpBoostMult: number;
  noFallDamage: boolean;
  dashEnabled: boolean;
  knockbackImmune: boolean;
  fireBlockImmune: boolean;
  waterWalk: boolean;
  lavaWalk: boolean;
  wingFlightTicks: number;
  hpRegenPerSec: number;
  manaRegenPerSec: number;
  shineRadius: number;
  activeSetBonus: string | null;
  activeSetId: string | null;
}

export class InventorySystem {
  public static addItem(char: CharacterSave, itemId: string, count: number, modifier?: ItemStack['modifier']): number {
    const def = getItemDef(itemId);
    if (!def || count <= 0) return 0;

    if (def.category === 'coin') {
      this.addCoins(char, def.valueCopper * count);
      return count;
    }

    let remaining = count;

    // 1. Auto-fill existing ammo stacks if ammo
    if (def.category === 'ammo') {
      for (let i = 0; i < char.ammo.length && remaining > 0; i++) {
        const s = char.ammo[i];
        if (s && s.itemId === itemId && s.count < def.maxStack) {
          const add = Math.min(remaining, def.maxStack - s.count);
          s.count += add;
          remaining -= add;
        }
      }
    }

    // 2. Fill existing inventory stacks
    if (def.maxStack > 1) {
      for (let i = 0; i < char.inventory.length && remaining > 0; i++) {
        const s = char.inventory[i];
        if (s && s.itemId === itemId && s.count < def.maxStack) {
          const add = Math.min(remaining, def.maxStack - s.count);
          s.count += add;
          remaining -= add;
        }
      }
    }

    // 3. Place into empty ammo slot if ammo
    if (def.category === 'ammo' && remaining > 0) {
      for (let i = 0; i < char.ammo.length && remaining > 0; i++) {
        if (!char.ammo[i]) {
          const add = Math.min(remaining, def.maxStack);
          char.ammo[i] = { itemId, count: add };
          remaining -= add;
        }
      }
    }

    // 4. Place into empty inventory slots
    for (let i = 0; i < char.inventory.length && remaining > 0; i++) {
      if (!char.inventory[i]) {
        const add = Math.min(remaining, def.maxStack);
        char.inventory[i] = { itemId, count: add, modifier: modifier ?? 'none' };
        remaining -= add;
      }
    }

    return count - remaining;
  }

  public static countItem(char: CharacterSave, itemId: string): number {
    let total = 0;
    for (const s of char.inventory) if (s && s.itemId === itemId) total += s.count;
    for (const s of char.ammo) if (s && s.itemId === itemId) total += s.count;
    return total;
  }

  public static consumeItem(char: CharacterSave, itemId: string, amount: number): boolean {
    if (this.countItem(char, itemId) < amount) return false;
    let rem = amount;
    // Consume from ammo first if applicable, then reverse inventory
    for (let i = 0; i < char.ammo.length && rem > 0; i++) {
      const s = char.ammo[i];
      if (s && s.itemId === itemId) {
        const take = Math.min(rem, s.count);
        s.count -= take;
        rem -= take;
        if (s.count <= 0) char.ammo[i] = null;
      }
    }
    for (let i = char.inventory.length - 1; i >= 0 && rem > 0; i--) {
      const s = char.inventory[i];
      if (s && s.itemId === itemId) {
        const take = Math.min(rem, s.count);
        s.count -= take;
        rem -= take;
        if (s.count <= 0) char.inventory[i] = null;
      }
    }
    return rem === 0;
  }

  public static addCoins(char: CharacterSave, copperAmount: number): void {
    const total = this.getTotalCopper(char) + Math.max(0, Math.floor(copperAmount));
    this.setCoinsFromCopper(char, total);
  }

  public static getTotalCopper(char: CharacterSave): number {
    let total = 0;
    for (const s of [...char.coins, ...char.inventory]) {
      if (!s) continue;
      const def = getItemDef(s.itemId);
      if (def?.category === 'coin') {
        total += def.valueCopper * s.count;
      }
    }
    return total;
  }

  public static spendCopper(char: CharacterSave, costCopper: number): boolean {
    const total = this.getTotalCopper(char);
    if (total < costCopper) return false;
    // Clear any coin stacks in inventory and rewrite coin slots cleanly
    for (let i = 0; i < char.inventory.length; i++) {
      const s = char.inventory[i];
      if (s && getItemDef(s.itemId)?.category === 'coin') {
        char.inventory[i] = null;
      }
    }
    this.setCoinsFromCopper(char, total - costCopper);
    return true;
  }

  private static setCoinsFromCopper(char: CharacterSave, totalCopper: number): void {
    let rem = Math.max(0, Math.floor(totalCopper));
    const plat = Math.floor(rem / 1_000_000); rem %= 1_000_000;
    const gold = Math.floor(rem / 10_000); rem %= 10_000;
    const silv = Math.floor(rem / 100); rem %= 100;
    const copp = rem;
    char.coins[0] = copp > 0 ? { itemId: 'copper_coin', count: copp } : null;
    char.coins[1] = silv > 0 ? { itemId: 'silver_coin', count: silv } : null;
    char.coins[2] = gold > 0 ? { itemId: 'gold_coin', count: gold } : null;
    char.coins[3] = plat > 0 ? { itemId: 'platinum_coin', count: Math.min(999, plat) } : null;
  }

  public static formatCoins(copper: number): string {
    let rem = Math.max(0, Math.floor(copper));
    const p = Math.floor(rem / 1_000_000); rem %= 1_000_000;
    const g = Math.floor(rem / 10_000); rem %= 10_000;
    const s = Math.floor(rem / 100); rem %= 100;
    const parts: string[] = [];
    if (p > 0) parts.push(`${p}p`);
    if (g > 0) parts.push(`${g}g`);
    if (s > 0) parts.push(`${s}s`);
    if (rem > 0 || parts.length === 0) parts.push(`${rem}c`);
    return parts.join(' ');
  }

  public static sortInventory(char: CharacterSave): void {
    // Keep hotbar 0..9 untouched, sort 10..39 by category then name
    const bag = char.inventory.slice(10).filter((x): x is ItemStack => x !== null);
    // Merge stacks
    const merged: ItemStack[] = [];
    for (const st of bag) {
      const def = getItemDef(st.itemId);
      if (def && def.maxStack > 1) {
        const existing = merged.find((m) => m.itemId === st.itemId && m.count < def.maxStack);
        if (existing) {
          const add = Math.min(st.count, def.maxStack - existing.count);
          existing.count += add;
          if (st.count - add > 0) {
            merged.push({ ...st, count: st.count - add });
          }
          continue;
        }
      }
      merged.push({ ...st });
    }
    merged.sort((a, b) => {
      const da = getItemDef(a.itemId);
      const db = getItemDef(b.itemId);
      const ca = da?.category ?? 'z';
      const cb = db?.category ?? 'z';
      if (ca !== cb) return ca.localeCompare(cb);
      return (da?.name ?? a.itemId).localeCompare(db?.name ?? b.itemId);
    });
    for (let i = 10; i < 40; i++) {
      char.inventory[i] = merged[i - 10] ?? null;
    }
  }

  public static canCraft(char: CharacterSave, recipe: RecipeDef, nearbyStations: Set<string>, isHardmode: boolean): boolean {
    if (recipe.hardmodeOnly && !isHardmode && recipe.station !== 'hand') {
      // Allow crafting if station itself is present and ingredients are possessed
    }
    if (recipe.station !== 'hand' && !nearbyStations.has(recipe.station)) {
      return false;
    }
    for (const ing of recipe.ingredients) {
      if (this.countItem(char, ing.itemId) < ing.count) {
        return false;
      }
    }
    return true;
  }

  public static getCraftableRecipes(char: CharacterSave, nearbyStations: Set<string>, isHardmode: boolean): RecipeDef[] {
    return RECIPES.filter((r) => this.canCraft(char, r, nearbyStations, isHardmode));
  }

  public static craftRecipe(char: CharacterSave, recipe: RecipeDef, nearbyStations: Set<string>, isHardmode: boolean): boolean {
    if (!this.canCraft(char, recipe, nearbyStations, isHardmode)) return false;
    for (const ing of recipe.ingredients) {
      this.consumeItem(char, ing.itemId, ing.count);
    }
    this.addItem(char, recipe.resultId, recipe.resultCount);
    return true;
  }

  public static findAmmoForWeapon(char: CharacterSave, ammoType: 'arrow' | 'bullet' | 'rocket' | 'star'): ItemStack | null {
    for (const s of char.ammo) {
      if (s && getItemDef(s.itemId)?.ammoType === ammoType) return s;
    }
    for (const s of char.inventory) {
      if (s && getItemDef(s.itemId)?.ammoType === ammoType) return s;
    }
    return null;
  }

  public static computePlayerStats(char: CharacterSave, activeBuffs: ActiveBuff[]): ComputedPlayerStats {
    const stats: ComputedPlayerStats = {
      defense: 0,
      maxHp: char.maxHp,
      maxMana: char.maxMana,
      moveSpeedMult: 1.0,
      meleeDamageMult: 1.0,
      rangedDamageMult: 1.0,
      magicDamageMult: 1.0,
      summonDamageMult: 1.0,
      critChanceBonus: 0,
      meleeSpeedMult: 1.0,
      manaCostMult: 1.0,
      maxMinions: 1,
      maxSentries: 1,
      doubleJump: false,
      jumpBoostMult: 1.0,
      noFallDamage: false,
      dashEnabled: false,
      knockbackImmune: false,
      fireBlockImmune: false,
      waterWalk: false,
      lavaWalk: false,
      wingFlightTicks: 0,
      hpRegenPerSec: 1.2,
      manaRegenPerSec: 6.0,
      shineRadius: 0,
      activeSetBonus: null,
      activeSetId: null,
    };

    const applyBonus = (b?: EquipmentBonuses) => {
      if (!b) return;
      if (b.defense) stats.defense += b.defense;
      if (b.maxHpBonus) stats.maxHp += b.maxHpBonus;
      if (b.maxManaBonus) stats.maxMana += b.maxManaBonus;
      if (b.moveSpeedMult) stats.moveSpeedMult += b.moveSpeedMult;
      if (b.meleeDamageMult) stats.meleeDamageMult += b.meleeDamageMult;
      if (b.rangedDamageMult) stats.rangedDamageMult += b.rangedDamageMult;
      if (b.magicDamageMult) stats.magicDamageMult += b.magicDamageMult;
      if (b.summonDamageMult) stats.summonDamageMult += b.summonDamageMult;
      if (b.allDamageMult) {
        stats.meleeDamageMult += b.allDamageMult;
        stats.rangedDamageMult += b.allDamageMult;
        stats.magicDamageMult += b.allDamageMult;
        stats.summonDamageMult += b.allDamageMult;
      }
      if (b.critChanceBonus) stats.critChanceBonus += b.critChanceBonus;
      if (b.meleeSpeedMult) stats.meleeSpeedMult += b.meleeSpeedMult;
      if (b.manaCostMult) stats.manaCostMult = Math.max(0.2, stats.manaCostMult + b.manaCostMult);
      if (b.maxMinionsBonus) stats.maxMinions += b.maxMinionsBonus;
      if (b.maxSentriesBonus) stats.maxSentries += b.maxSentriesBonus;
      if (b.doubleJump) stats.doubleJump = true;
      if (b.jumpBoostMult) stats.jumpBoostMult += b.jumpBoostMult;
      if (b.noFallDamage) stats.noFallDamage = true;
      if (b.dashEnabled) stats.dashEnabled = true;
      if (b.knockbackImmune) stats.knockbackImmune = true;
      if (b.fireBlockImmune) stats.fireBlockImmune = true;
      if (b.waterWalk) stats.waterWalk = true;
      if (b.lavaWalk) stats.lavaWalk = true;
      if (b.wingFlightTicks) stats.wingFlightTicks = Math.max(stats.wingFlightTicks, b.wingFlightTicks);
      if (b.hpRegenBonus) stats.hpRegenPerSec += b.hpRegenBonus;
      if (b.manaRegenBonus) stats.manaRegenPerSec += b.manaRegenBonus;
      if (b.shineRadius) stats.shineRadius = Math.max(stats.shineRadius, b.shineRadius);
    };

    const setIds: (string | undefined)[] = [];
    for (const slot of char.armor) {
      if (!slot) {
        setIds.push(undefined);
        continue;
      }
      const def = getItemDef(slot.itemId);
      setIds.push(def?.armorSetId);
      applyBonus(def?.bonuses);
    }

    // Check Full Armor Set Bonus
    if (setIds[0] && setIds[0] === setIds[1] && setIds[1] === setIds[2]) {
      const headDef = getItemDef(char.armor[0]!.itemId);
      const setId = headDef?.bonuses?.setBonusId ?? setIds[0];
      stats.activeSetId = setId;
      stats.activeSetBonus = headDef?.bonuses?.setBonusDescription ?? null;
      if (setId === 'wood_set') stats.defense += 1;
      else if (setId === 'copper_set' || setId === 'iron_set') stats.defense += 2;
      else if (setId === 'silver_set' || setId === 'gold_set') stats.defense += 3;
      else if (setId === 'platinum_set') stats.defense += 4;
      else if (setId === 'shadow_set') stats.moveSpeedMult += 0.15;
      else if (setId === 'crimson_set') stats.hpRegenPerSec += 3.5;
      else if (setId === 'jungle_set') stats.manaCostMult = Math.max(0.2, stats.manaCostMult - 0.16);
      else if (setId === 'molten_set') {
        stats.meleeDamageMult += 0.1;
        stats.fireBlockImmune = true;
      } else if (setId === 'cobalt_set') stats.meleeSpeedMult += 0.15;
      else if (setId === 'mythril_set') stats.critChanceBonus += 10;
      else if (setId === 'adamantite_set') {
        stats.meleeSpeedMult += 0.2;
        stats.moveSpeedMult += 0.2;
      } else if (setId === 'solar_set') stats.dashEnabled = true;
      else if (setId === 'stardust_set') stats.maxMinions += 1;
    }

    // Accessories + Reforge Modifiers
    const accCount = char.demonHeartUsed ? 7 : 5;
    for (let i = 0; i < accCount; i++) {
      const acc = char.accessories[i];
      if (!acc) continue;
      const def = getItemDef(acc.itemId);
      applyBonus(def?.bonuses);
      const mod = acc.modifier ? MODIFIERS[acc.modifier] : undefined;
      if (mod) {
        if (mod.defenseBonus) stats.defense += mod.defenseBonus;
        if (mod.damageMult) {
          const d = mod.damageMult - 1;
          stats.meleeDamageMult += d;
          stats.rangedDamageMult += d;
          stats.magicDamageMult += d;
          stats.summonDamageMult += d;
        }
        if (mod.critBonus) stats.critChanceBonus += mod.critBonus;
        if (mod.moveSpeedBonus) stats.moveSpeedMult += mod.moveSpeedBonus;
        if (mod.speedMult) stats.meleeSpeedMult += mod.speedMult - 1;
        if (mod.id === 'arcane') stats.maxMana += 20;
      }
    }

    // Active Buffs
    for (const buff of activeBuffs) {
      switch (buff.id) {
        case 'ironskin': stats.defense += 8; break;
        case 'swiftness': stats.moveSpeedMult += 0.25; break;
        case 'regen': stats.hpRegenPerSec += 2.5; break;
        case 'campfire': stats.hpRegenPerSec += 2.0; break;
        case 'shine': stats.shineRadius = Math.max(stats.shineRadius, 14); break;
        case 'obsidian_skin': stats.fireBlockImmune = true; break;
        case 'archery': stats.rangedDamageMult += 0.2; break;
        case 'magic_power': stats.magicDamageMult += 0.2; break;
        case 'summoning': stats.maxMinions += 1; break;
        case 'wrath':
          stats.meleeDamageMult += 0.1;
          stats.rangedDamageMult += 0.1;
          stats.magicDamageMult += 0.1;
          stats.summonDamageMult += 0.1;
          break;
        case 'lifeforce': stats.maxHp = Math.round(stats.maxHp * 1.2); break;
        case 'well_fed':
          stats.defense += 2;
          stats.moveSpeedMult += 0.2;
          stats.meleeDamageMult += 0.05;
          stats.rangedDamageMult += 0.05;
          stats.magicDamageMult += 0.05;
          stats.summonDamageMult += 0.05;
          stats.critChanceBonus += 2;
          stats.hpRegenPerSec += 1.0;
          break;
        case 'ichor':
          stats.defense = Math.max(0, stats.defense - 15);
          break;
      }
    }

    return stats;
  }
}
