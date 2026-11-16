import { ItemStack } from '@/types/game';

export interface LootEntry {
  itemId: string;
  min: number;
  max: number;
  weight: number;
}

export const CHEST_PRIMARY_LOOT: Record<string, LootEntry[]> = {
  surface_wood: [
    { itemId: 'spear', min: 1, max: 1, weight: 15 },
    { itemId: 'wooden_boomerang', min: 1, max: 1, weight: 15 },
    { itemId: 'wand_of_sparking', min: 1, max: 1, weight: 15 },
    { itemId: 'finch_staff', min: 1, max: 1, weight: 12 },
    { itemId: 'hermes_boots', min: 1, max: 1, weight: 8 },
    { itemId: 'grappling_hook', min: 1, max: 1, weight: 12 },
  ],
  underground_gold: [
    { itemId: 'hermes_boots', min: 1, max: 1, weight: 16 },
    { itemId: 'cloud_in_a_bottle', min: 1, max: 1, weight: 16 },
    { itemId: 'band_of_regeneration', min: 1, max: 1, weight: 14 },
    { itemId: 'magic_mirror', min: 1, max: 1, weight: 14 },
    { itemId: 'enchanted_boomerang', min: 1, max: 1, weight: 12 },
    { itemId: 'mace', min: 1, max: 1, weight: 12 },
  ],
  dungeon_gold: [
    { itemId: 'muramasa', min: 1, max: 1, weight: 18 },
    { itemId: 'cobalt_shield', min: 1, max: 1, weight: 18 },
    { itemId: 'magic_mirror', min: 1, max: 1, weight: 10 },
    { itemId: 'shadow_key', min: 1, max: 1, weight: 22 },
    { itemId: 'water_bolt', min: 1, max: 1, weight: 12 },
  ],
  shadow_chest: [
    { itemId: 'dark_lance', min: 1, max: 1, weight: 20 },
    { itemId: 'sunfury', min: 1, max: 1, weight: 20 },
    { itemId: 'hellfire_arrow', min: 40, max: 80, weight: 20 },
    { itemId: 'obsidian_shield', min: 1, max: 1, weight: 12 },
  ],
  skyware: [
    { itemId: 'starfury', min: 1, max: 1, weight: 32 },
    { itemId: 'shiny_red_balloon', min: 1, max: 1, weight: 32 },
    { itemId: 'lucky_horseshoe', min: 1, max: 1, weight: 32 },
  ],
  frozen: [
    { itemId: 'ice_blade', min: 1, max: 1, weight: 32 },
    { itemId: 'cloud_in_a_bottle', min: 1, max: 1, weight: 20 },
    { itemId: 'hermes_boots', min: 1, max: 1, weight: 20 },
  ],
  ivy: [
    { itemId: 'amazon', min: 1, max: 1, weight: 25 },
    { itemId: 'boomstick', min: 1, max: 1, weight: 25 },
    { itemId: 'natures_gift', min: 1, max: 1, weight: 20 },
    { itemId: 'ivy_whip', min: 1, max: 1, weight: 20 },
  ],
};

export const BAG_LOOT_TABLES: Record<string, { itemId: string; min: number; max: number; chance: number }[]> = {
  wooden_crate: [
    { itemId: 'silver_coin', min: 15, max: 40, chance: 1 },
    { itemId: 'copper_ore', min: 8, max: 20, chance: 0.6 },
    { itemId: 'iron_ore', min: 8, max: 20, chance: 0.5 },
    { itemId: 'lesser_healing_potion', min: 3, max: 6, chance: 0.8 },
    { itemId: 'worm', min: 2, max: 5, chance: 0.6 },
    { itemId: 'hermes_boots', min: 1, max: 1, chance: 0.2 },
  ],
  iron_crate: [
    { itemId: 'gold_coin', min: 2, max: 6, chance: 1 },
    { itemId: 'silver_bar', min: 5, max: 12, chance: 0.6 },
    { itemId: 'gold_bar', min: 5, max: 12, chance: 0.5 },
    { itemId: 'healing_potion', min: 3, max: 6, chance: 0.8 },
    { itemId: 'master_bait', min: 2, max: 4, chance: 0.5 },
    { itemId: 'cloud_in_a_bottle', min: 1, max: 1, chance: 0.2 },
  ],
  golden_crate: [
    { itemId: 'gold_coin', min: 5, max: 15, chance: 1 },
    { itemId: 'platinum_bar', min: 6, max: 15, chance: 0.6 },
    { itemId: 'greater_healing_potion', min: 4, max: 8, chance: 0.8 },
    { itemId: 'life_crystal', min: 1, max: 2, chance: 0.45 },
    { itemId: 'enchanted_sword', min: 1, max: 1, chance: 0.18 },
    { itemId: 'golden_fishing_rod', min: 1, max: 1, chance: 0.12 },
  ],
  king_slime_bag: [
    { itemId: 'slimy_saddle', min: 1, max: 1, chance: 0.8 },
    { itemId: 'gel', min: 40, max: 80, chance: 1 },
    { itemId: 'gold_coin', min: 4, max: 8, chance: 1 },
    { itemId: 'lesser_healing_potion', min: 5, max: 12, chance: 1 },
  ],
  eye_of_cthulhu_bag: [
    { itemId: 'shield_of_cthulhu', min: 1, max: 1, chance: 1 },
    { itemId: 'demonite_ore', min: 35, max: 75, chance: 0.65 },
    { itemId: 'crimtane_ore', min: 35, max: 75, chance: 0.65 },
    { itemId: 'unholy_arrow', min: 30, max: 60, chance: 1 },
    { itemId: 'gold_coin', min: 5, max: 10, chance: 1 },
  ],
  eater_of_worlds_bag: [
    { itemId: 'demonite_ore', min: 60, max: 120, chance: 1 },
    { itemId: 'shadow_scale', min: 30, max: 50, chance: 1 },
    { itemId: 'gold_coin', min: 8, max: 12, chance: 1 },
  ],
  brain_of_cthulhu_bag: [
    { itemId: 'crimtane_ore', min: 60, max: 120, chance: 1 },
    { itemId: 'tissue_sample', min: 30, max: 50, chance: 1 },
    { itemId: 'gold_coin', min: 8, max: 12, chance: 1 },
  ],
  queen_bee_bag: [
    { itemId: 'stinger', min: 8, max: 16, chance: 1 },
    { itemId: 'honey_block', min: 15, max: 30, chance: 1 },
    { itemId: 'hornet_staff', min: 1, max: 1, chance: 0.5 },
    { itemId: 'gold_coin', min: 10, max: 15, chance: 1 },
  ],
  skeletron_bag: [
    { itemId: 'bone', min: 25, max: 45, chance: 1 },
    { itemId: 'golden_key', min: 2, max: 4, chance: 1 },
    { itemId: 'bookcase', min: 1, max: 1, chance: 0.5 },
    { itemId: 'gold_coin', min: 10, max: 16, chance: 1 },
  ],
  deerclops_bag: [
    { itemId: 'snow_block', min: 30, max: 60, chance: 1 },
    { itemId: 'healing_potion', min: 5, max: 10, chance: 1 },
    { itemId: 'gold_coin', min: 12, max: 18, chance: 1 },
  ],
  wall_of_flesh_bag: [
    { itemId: 'pwnhammer', min: 1, max: 1, chance: 1 },
    { itemId: 'warrior_emblem', min: 1, max: 1, chance: 0.5 },
    { itemId: 'ranger_emblem', min: 1, max: 1, chance: 0.5 },
    { itemId: 'sorcerer_emblem', min: 1, max: 1, chance: 0.5 },
    { itemId: 'summoner_emblem', min: 1, max: 1, chance: 0.5 },
    { itemId: 'gold_coin', min: 15, max: 25, chance: 1 },
  ],
  queen_slime_bag: [
    { itemId: 'crystal_shard', min: 20, max: 35, chance: 1 },
    { itemId: 'greater_healing_potion', min: 8, max: 15, chance: 1 },
    { itemId: 'gold_coin', min: 15, max: 25, chance: 1 },
  ],
  twins_bag: [
    { itemId: 'hallowed_bar', min: 25, max: 45, chance: 1 },
    { itemId: 'soul_of_sight', min: 30, max: 45, chance: 1 },
    { itemId: 'greater_healing_potion', min: 8, max: 15, chance: 1 },
  ],
  destroyer_bag: [
    { itemId: 'hallowed_bar', min: 25, max: 45, chance: 1 },
    { itemId: 'soul_of_might', min: 30, max: 45, chance: 1 },
    { itemId: 'greater_healing_potion', min: 8, max: 15, chance: 1 },
  ],
  skeletron_prime_bag: [
    { itemId: 'hallowed_bar', min: 25, max: 45, chance: 1 },
    { itemId: 'soul_of_fright', min: 30, max: 45, chance: 1 },
    { itemId: 'greater_healing_potion', min: 8, max: 15, chance: 1 },
  ],
  plantera_bag: [
    { itemId: 'temple_key', min: 1, max: 1, chance: 1 },
    { itemId: 'jungle_spores', min: 12, max: 24, chance: 1 },
    { itemId: 'greater_healing_potion', min: 10, max: 16, chance: 1 },
  ],
  golem_bag: [
    { itemId: 'picksaw', min: 1, max: 1, chance: 0.65 },
    { itemId: 'beetle_husk', min: 18, max: 30, chance: 1 },
    { itemId: 'sunflower', min: 1, max: 1, chance: 0.5 },
  ],
  duke_fishron_bag: [
    { itemId: 'tsunami', min: 1, max: 1, chance: 0.5 },
    { itemId: 'razorblade_typhoon', min: 1, max: 1, chance: 0.5 },
    { itemId: 'fishron_wings', min: 1, max: 1, chance: 0.65 },
  ],
  empress_of_light_bag: [
    { itemId: 'kaleidoscope', min: 1, max: 1, chance: 0.65 },
    { itemId: 'empress_wings', min: 1, max: 1, chance: 0.65 },
    { itemId: 'greater_healing_potion', min: 10, max: 20, chance: 1 },
  ],
  lunatic_cultist_bag: [
    { itemId: 'ancient_manipulator', min: 1, max: 1, chance: 1 },
    { itemId: 'super_healing_potion', min: 5, max: 10, chance: 1 },
  ],
  moon_lord_bag: [
    { itemId: 'luminite_ore', min: 85, max: 115, chance: 1 },
    { itemId: 'meowmere', min: 1, max: 1, chance: 0.5 },
    { itemId: 'star_wrath', min: 1, max: 1, chance: 0.5 },
    { itemId: 'sdmg', min: 1, max: 1, chance: 0.5 },
    { itemId: 'last_prism', min: 1, max: 1, chance: 0.5 },
    { itemId: 'terrarian', min: 1, max: 1, chance: 0.5 },
    { itemId: 'cosmic_car_key', min: 1, max: 1, chance: 0.4 },
    { itemId: 'platinum_coin', min: 2, max: 4, chance: 1 },
  ],
};

export function generateChestItems(chestKind: keyof typeof CHEST_PRIMARY_LOOT, rng: () => number): (ItemStack | null)[] {
  const slots: (ItemStack | null)[] = Array(20).fill(null);
  const pool = CHEST_PRIMARY_LOOT[chestKind] ?? CHEST_PRIMARY_LOOT.surface_wood;
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  let pick = rng() * totalWeight;
  let chosen = pool[0];
  for (const e of pool) {
    pick -= e.weight;
    if (pick <= 0) {
      chosen = e;
      break;
    }
  }
  let idx = 0;
  slots[idx++] = {
    itemId: chosen.itemId,
    count: chosen.min + Math.floor(rng() * (chosen.max - chosen.min + 1)),
  };

  // Secondary authentic Terraria loot (bars, potions, torches, arrows, recall, coins)
  const secondary: [string, number, number, number][] = [
    ['iron_bar', 4, 10, 0.5],
    ['gold_bar', 3, 8, 0.35],
    ['lesser_healing_potion', 2, 5, 0.65],
    ['recall_potion', 1, 3, 0.5],
    ['torch', 8, 24, 0.7],
    ['wooden_arrow', 20, 45, 0.6],
    ['grenade', 2, 5, 0.35],
    ['silver_coin', 15, 60, 0.85],
    ['ironskin_potion', 1, 2, 0.35],
    ['spelunker_potion', 1, 2, 0.35],
  ];

  for (const [itemId, min, max, chance] of secondary) {
    if (idx >= slots.length) break;
    if (rng() < chance) {
      slots[idx++] = {
        itemId,
        count: min + Math.floor(rng() * (max - min + 1)),
      };
    }
  }

  return slots;
}
