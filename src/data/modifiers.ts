import { ModifierId } from '@/types/game';

export interface ModifierDef {
  id: ModifierId;
  label: string;
  appliesTo: 'melee' | 'ranged' | 'magic' | 'summon' | 'universal' | 'accessory';
  damageMult?: number;
  speedMult?: number; // >1 faster
  critBonus?: number;
  knockbackMult?: number;
  manaCostMult?: number;
  defenseBonus?: number;
  moveSpeedBonus?: number;
  valueMult: number;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  none: { id: 'none', label: '', appliesTo: 'universal', valueMult: 1.0 },
  keen: { id: 'keen', label: 'Keen', appliesTo: 'universal', critBonus: 3, valueMult: 1.12 },
  superior: { id: 'superior', label: 'Superior', appliesTo: 'universal', damageMult: 1.1, critBonus: 3, knockbackMult: 1.1, valueMult: 1.35 },
  forceful: { id: 'forceful', label: 'Forceful', appliesTo: 'universal', knockbackMult: 1.15, valueMult: 1.12 },
  broken: { id: 'broken', label: 'Broken', appliesTo: 'universal', damageMult: 0.7, knockbackMult: 0.8, valueMult: 0.56 },
  damaged: { id: 'damaged', label: 'Damaged', appliesTo: 'universal', damageMult: 0.85, valueMult: 0.72 },
  shoddy: { id: 'shoddy', label: 'Shoddy', appliesTo: 'universal', damageMult: 0.9, knockbackMult: 0.85, valueMult: 0.75 },
  quick: { id: 'quick', label: 'Quick', appliesTo: 'universal', speedMult: 1.1, valueMult: 1.2 },
  deadly: { id: 'deadly', label: 'Deadly', appliesTo: 'universal', damageMult: 1.1, speedMult: 1.1, valueMult: 1.4 },
  agile: { id: 'agile', label: 'Agile', appliesTo: 'universal', speedMult: 1.1, critBonus: 3, valueMult: 1.3 },
  nimble: { id: 'nimble', label: 'Nimble', appliesTo: 'universal', speedMult: 1.05, valueMult: 1.1 },
  murderous: { id: 'murderous', label: 'Murderous', appliesTo: 'universal', damageMult: 1.07, speedMult: 1.06, critBonus: 3, valueMult: 1.45 },
  slow: { id: 'slow', label: 'Slow', appliesTo: 'universal', speedMult: 0.85, valueMult: 0.8 },
  sluggish: { id: 'sluggish', label: 'Sluggish', appliesTo: 'universal', speedMult: 0.8, valueMult: 0.72 },
  lazy: { id: 'lazy', label: 'Lazy', appliesTo: 'universal', speedMult: 0.92, valueMult: 0.86 },
  annoying: { id: 'annoying', label: 'Annoying', appliesTo: 'universal', damageMult: 0.8, speedMult: 0.85, valueMult: 0.65 },
  nasty: { id: 'nasty', label: 'Nasty', appliesTo: 'universal', damageMult: 1.05, speedMult: 1.1, critBonus: 2, knockbackMult: 0.9, valueMult: 1.16 },
  legendary: { id: 'legendary', label: 'Legendary', appliesTo: 'melee', damageMult: 1.15, speedMult: 1.1, critBonus: 5, knockbackMult: 1.15, valueMult: 2.0 },
  unreal: { id: 'unreal', label: 'Unreal', appliesTo: 'ranged', damageMult: 1.15, speedMult: 1.1, critBonus: 5, knockbackMult: 1.15, valueMult: 2.0 },
  mythical: { id: 'mythical', label: 'Mythical', appliesTo: 'magic', damageMult: 1.15, speedMult: 1.1, critBonus: 5, knockbackMult: 1.15, manaCostMult: 0.9, valueMult: 2.0 },
  godly: { id: 'godly', label: 'Godly', appliesTo: 'universal', damageMult: 1.15, critBonus: 5, knockbackMult: 1.15, valueMult: 1.8 },
  demonic: { id: 'demonic', label: 'Demonic', appliesTo: 'universal', damageMult: 1.15, critBonus: 5, valueMult: 1.6 },
  ruthless: { id: 'ruthless', label: 'Ruthless', appliesTo: 'summon', damageMult: 1.18, knockbackMult: 0.9, valueMult: 1.4 },
  warding: { id: 'warding', label: 'Warding', appliesTo: 'accessory', defenseBonus: 4, valueMult: 1.44 },
  armored: { id: 'armored', label: 'Armored', appliesTo: 'accessory', defenseBonus: 3, valueMult: 1.3 },
  menacing: { id: 'menacing', label: 'Menacing', appliesTo: 'accessory', damageMult: 1.04, valueMult: 1.44 },
  lucky: { id: 'lucky', label: 'Lucky', appliesTo: 'accessory', critBonus: 4, valueMult: 1.44 },
  arcane: { id: 'arcane', label: 'Arcane', appliesTo: 'accessory', valueMult: 1.44 },
  quick_acc: { id: 'quick_acc', label: 'Quick', appliesTo: 'accessory', moveSpeedBonus: 0.04, valueMult: 1.44 },
  violent: { id: 'violent', label: 'Violent', appliesTo: 'accessory', speedMult: 1.04, valueMult: 1.44 },
};

const WEAPON_MOD_POOL: Record<string, ModifierId[]> = {
  melee: ['keen', 'superior', 'forceful', 'broken', 'damaged', 'quick', 'deadly', 'agile', 'murderous', 'slow', 'godly', 'demonic', 'legendary'],
  ranged: ['keen', 'superior', 'forceful', 'damaged', 'quick', 'deadly', 'agile', 'murderous', 'slow', 'godly', 'demonic', 'unreal'],
  magic: ['keen', 'superior', 'forceful', 'damaged', 'quick', 'deadly', 'agile', 'murderous', 'slow', 'godly', 'demonic', 'mythical'],
  summon: ['keen', 'superior', 'forceful', 'ruthless', 'godly', 'demonic', 'mythical'],
};

const ACCESSORY_MOD_POOL: ModifierId[] = ['warding', 'armored', 'menacing', 'lucky', 'arcane', 'quick_acc', 'violent'];

export function rollModifierForCategory(category: 'weapon' | 'accessory', damageType?: string, rng = Math.random): ModifierId {
  if (category === 'accessory') {
    return ACCESSORY_MOD_POOL[Math.floor(rng() * ACCESSORY_MOD_POOL.length)];
  }
  const pool = WEAPON_MOD_POOL[damageType ?? 'melee'] ?? WEAPON_MOD_POOL.melee;
  return pool[Math.floor(rng() * pool.length)];
}
