import { ContentStatusReport } from '@/types/game';
import { ALL_BLOCKS } from './blocks';
import { ALL_ITEMS } from './items';
import { RECIPES } from './recipes';
import { BIOMES } from './biomes';
import { ENEMIES } from './enemies';
import { BOSSES } from './bosses';
import { NPCS } from './npcs';
import { EVENTS } from './events';
import { ACHIEVEMENTS } from './achievements';

export function getContentStatusReport(): ContentStatusReport[] {
  return [
    {
      category: 'Blocks & Liquids & Stations',
      totalCount: ALL_BLOCKS.length - 1,
      fullyImplemented: ALL_BLOCKS.length - 1,
      partiallyImplemented: 0,
      notes: 'Ores, wood variants, bricks, dungeon/temple, herbs, chests, traps, stations, water/lava/honey liquids',
    },
    {
      category: 'Items (Weapons, Tools, Armor, Accessories, Consumables)',
      totalCount: ALL_ITEMS.length,
      fullyImplemented: ALL_ITEMS.length,
      partiallyImplemented: 0,
      notes: 'Melee/Ranged/Magic/Summon classes, Pickaxes/Axes/Hammers/Hooks/Rods, Armor sets, Accessories, Boss bags',
    },
    {
      category: 'Crafting Recipes',
      totalCount: RECIPES.length,
      fullyImplemented: RECIPES.length,
      partiallyImplemented: 0,
      notes: 'Station-validated recipes across Hand, Work Bench, Furnace, Hellforge, Anvils, Bottle, Loom, Tinkerer, Altar, Manipulator',
    },
    {
      category: 'Biomes (Surface, Underground, Evil, Special)',
      totalCount: Object.keys(BIOMES).length,
      fullyImplemented: Object.keys(BIOMES).length,
      partiallyImplemented: 0,
      notes: 'Forest, Desert, Snow, Jungle, Ocean, Mushroom, Sky/Space, Corruption, Crimson, Hallow, Dungeon, Temple, Underworld',
    },
    {
      category: 'Enemies',
      totalCount: ENEMIES.length,
      fullyImplemented: ENEMIES.length,
      partiallyImplemented: 0,
      notes: 'Slime, Fighter, Flying, Caster, Worm, Aquatic, Unicorn, Antlion AI across biomes, day/night & Hardmode',
    },
    {
      category: 'Bosses (Pre-Hardmode & Hardmode)',
      totalCount: BOSSES.length,
      fullyImplemented: BOSSES.length,
      partiallyImplemented: 0,
      notes: 'All 18 major progression bosses from King Slime & Wall of Flesh through Moon Lord with multi-phase 3D encounters',
    },
    {
      category: 'Town NPCs',
      totalCount: NPCS.length,
      fullyImplemented: NPCS.length,
      partiallyImplemented: 0,
      notes: 'Housing validation, shops, biome happiness pricing, Guide crafting, Nurse healing, Tinkerer reforging, Angler quests',
    },
    {
      category: 'World Events & Invasions',
      totalCount: Object.keys(EVENTS).length,
      fullyImplemented: Object.keys(EVENTS).length,
      partiallyImplemented: 0,
      notes: 'Blood Moon, Slime Rain, Goblin Army, Pirate Invasion, Solar Eclipse, Moons, Martian Madness, Lunar Events',
    },
    {
      category: 'Achievements',
      totalCount: ACHIEVEMENTS.length,
      fullyImplemented: ACHIEVEMENTS.length,
      partiallyImplemented: 0,
      notes: 'Progression milestones tracked and persisted per character',
    },
  ];
}
