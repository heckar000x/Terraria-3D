export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 256;
export const VERTICAL_CHUNKS = WORLD_HEIGHT / CHUNK_SIZE; // 16

export type WorldSize = 'small' | 'medium' | 'large';
export type GameDifficulty = 'classic' | 'expert' | 'master' | 'journey';
export type CharacterDifficulty = 'classic' | 'mediumcore' | 'hardcore' | 'journey';
export type EvilChoice = 'random' | 'corruption' | 'crimson';
export type EvilType = 'corruption' | 'crimson';

export type BiomeId =
  | 'forest'
  | 'desert'
  | 'snow'
  | 'jungle'
  | 'ocean'
  | 'mushroom'
  | 'floating_island'
  | 'corruption'
  | 'crimson'
  | 'hallow'
  | 'dungeon'
  | 'temple'
  | 'underworld'
  | 'space'
  | 'sky'
  | 'underground_forest'
  | 'underground_desert'
  | 'underground_snow'
  | 'underground_jungle'
  | 'underground_mushroom'
  | 'underground_corruption'
  | 'underground_crimson'
  | 'underground_hallow';

export type LiquidType = 0 | 1 | 2 | 3; // 0=None, 1=Water, 2=Lava, 3=Honey

export enum BlockId {
  Air = 0,
  Dirt = 1,
  Grass = 2,
  Stone = 3,
  Sand = 4,
  HardenedSand = 5,
  Sandstone = 6,
  Mud = 7,
  Clay = 8,
  Snow = 9,
  Ice = 10,
  ThinIce = 11,
  Wood = 12,
  BorealWood = 13,
  PalmWood = 14,
  RichMahogany = 15,
  Ebonwood = 16,
  Shadewood = 17,
  Pearlwood = 18,
  Ash = 19,
  Obsidian = 20,
  Hellstone = 21,
  CopperOre = 22,
  TinOre = 23,
  IronOre = 24,
  LeadOre = 25,
  SilverOre = 26,
  TungstenOre = 27,
  GoldOre = 28,
  PlatinumOre = 29,
  DemoniteOre = 30,
  CrimtaneOre = 31,
  CobaltOre = 32,
  PalladiumOre = 33,
  MythrilOre = 34,
  OrichalcumOre = 35,
  AdamantiteOre = 36,
  TitaniumOre = 37,
  ChlorophyteOre = 38,
  LuminiteOre = 39,
  AmethystBlock = 40,
  TopazBlock = 41,
  SapphireBlock = 42,
  EmeraldBlock = 43,
  RubyBlock = 44,
  DiamondBlock = 45,
  GrayBrick = 46,
  RedBrick = 47,
  WoodPlank = 48,
  Glass = 49,
  BlueDungeonBrick = 50,
  GreenDungeonBrick = 51,
  PinkDungeonBrick = 52,
  ObsidianBrick = 53,
  HellstoneBrick = 54,
  LihzahrdBrick = 55,
  SunplateBlock = 56,
  Cloud = 57,
  RainCloud = 58,
  Ebonstone = 59,
  Crimstone = 60,
  Pearlstone = 61,
  CorruptGrass = 62,
  CrimsonGrass = 63,
  HallowedGrass = 64,
  JungleGrass = 65,
  MushroomGrass = 66,
  GlowingMushroomBlock = 67,
  Leaf = 68,
  BorealLeaf = 69,
  JungleLeaf = 70,
  PalmLeaf = 71,
  HallowedLeaf = 72,
  LivingWood = 73,
  Hive = 74,
  HoneyBlock = 75,
  CrispyHoney = 76,
  Cobweb = 77,
  Granite = 78,
  Marble = 79,
  Cactus = 80,
  Coral = 81,
  CrystalShard = 82,
  ShadowOrb = 83,
  CrimsonHeart = 84,
  LifeCrystalBlock = 85,
  LifeFruitBlock = 86,
  PlanteraBulb = 87,
  Larva = 88,
  Pot = 89,
  WoodChest = 90,
  GoldChest = 91,
  LockedGoldChest = 92,
  ShadowChest = 93,
  SkywareChest = 94,
  FrozenChest = 95,
  IvyChest = 96,
  Torch = 97,
  CursedTorch = 98,
  IchorTorch = 99,
  UltrabrightTorch = 100,
  Campfire = 101,
  WorkBench = 102,
  Furnace = 103,
  Hellforge = 104,
  IronAnvil = 105,
  MythrilAnvil = 106,
  AlchemyTable = 107,
  Sawmill = 108,
  Loom = 109,
  TinkererWorkshop = 110,
  DemonAltar = 111,
  CrimsonAltar = 112,
  LihzahrdAltar = 113,
  CrystalBall = 114,
  Autohammer = 115,
  AncientManipulator = 116,
  CookingPot = 117,
  HeavyWorkBench = 118,
  Bed = 119,
  WoodTable = 120,
  WoodChair = 121,
  WoodDoorClosed = 122,
  WoodDoorOpen = 123,
  WoodPlatform = 124,
  Bookcase = 125,
  Bottle = 126,
  Sunflower = 127,
  Daybloom = 128,
  Moonglow = 129,
  Blinkroot = 130,
  Waterleaf = 131,
  Fireblossom = 132,
  Shiverthorn = 133,
  Deathweed = 134,
  Spike = 135,
  DartTrap = 136,
  PressurePlate = 137,
  Lever = 138,
  TNT = 139,
  Timer1s = 140,
  Silt = 141,
  Slush = 142,
  FossilBlock = 143,
  Meteorite = 144,
  MeteoriteBrick = 145,
  GoldBrick = 146,
  CopperBrick = 147,
  PearlstoneBrick = 148,
  EbonstoneBrick = 149,
  CrimstoneBrick = 150,
  PumpkinBlock = 151,
  Hay = 152,
  WaterCandle = 153,
  LihzahrdDoorClosed = 154,
  LihzahrdDoorOpen = 155,
  Tombstone = 156,
  PiggyBank = 157,
  Safe = 158,
  PylonForest = 159,
  WireBlock = 160,
  ActuatorBlock = 161,
  Water = 200,
  Lava = 201,
  Honey = 202,
}

export type ToolRequirementType = 'pickaxe' | 'axe' | 'hammer' | 'any';

export interface BlockDef {
  id: BlockId;
  name: string;
  solid: boolean;
  opaque: boolean;
  transparent?: boolean;
  renderMode: 'cube' | 'cross' | 'torch' | 'slab' | 'door' | 'chest' | 'station' | 'liquid' | 'crystal';
  liquidType?: LiquidType;
  hardness: number; // Mining hits/durability base
  minPickPower: number; // Required pickaxe power (0 = any, 35 copper, 55 iron, 65 nightmare, 100 molten, 110 cobalt, 150 mythril, 200 adam/pickaxe axe, 210 picksaw)
  toolType: ToolRequirementType;
  dropItemId?: string;
  dropCount?: number;
  lightEmit?: number; // 0..15
  lightColor?: [number, number, number]; // RGB 0..1
  gravity?: boolean; // Sand, Silt, Slush
  flammable?: boolean;
  damageOnTouch?: number;
  isStation?: CraftingStationId;
  isHousingLight?: boolean;
  isHousingTable?: boolean;
  isHousingChair?: boolean;
  isHousingDoor?: boolean;
  isContainer?: boolean;
  tileTop: string;
  tileSide: string;
  tileBottom: string;
  mapColor: string;
  soundGroup: 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'glass' | 'metal' | 'plant' | 'liquid';
}

export type DamageType = 'melee' | 'ranged' | 'magic' | 'summon' | 'true';
export type Rarity =
  | 'gray'
  | 'white'
  | 'blue'
  | 'green'
  | 'orange'
  | 'light_red'
  | 'pink'
  | 'light_purple'
  | 'lime'
  | 'yellow'
  | 'cyan'
  | 'red'
  | 'purple'
  | 'rainbow'
  | 'fiery_red';

export type CraftingStationId =
  | 'hand'
  | 'workbench'
  | 'furnace'
  | 'hellforge'
  | 'iron_anvil'
  | 'mythril_anvil'
  | 'bottle'
  | 'alchemy_table'
  | 'sawmill'
  | 'loom'
  | 'tinkerer_workshop'
  | 'demon_altar'
  | 'cooking_pot'
  | 'crystal_ball'
  | 'autohammer'
  | 'ancient_manipulator'
  | 'heavy_workbench'
  | 'water'
  | 'lava'
  | 'honey';

export type ItemCategory =
  | 'weapon'
  | 'tool'
  | 'armor'
  | 'accessory'
  | 'material'
  | 'ore'
  | 'bar'
  | 'potion'
  | 'food'
  | 'block'
  | 'wall'
  | 'furniture'
  | 'station'
  | 'ammo'
  | 'fishing'
  | 'mount'
  | 'pet'
  | 'summon_boss'
  | 'vanity'
  | 'dye'
  | 'mechanism'
  | 'treasure'
  | 'quest'
  | 'coin';

export type WeaponSubType =
  | 'broadsword'
  | 'shortsword'
  | 'spear'
  | 'boomerang'
  | 'flail'
  | 'yoyo'
  | 'whip'
  | 'bow'
  | 'gun'
  | 'launcher'
  | 'throwing'
  | 'magic_staff'
  | 'magic_tome'
  | 'magic_beam'
  | 'summon_minion'
  | 'summon_sentry';

export type ArmorSlot = 'head' | 'body' | 'legs';

export type BuffId =
  | 'regen'
  | 'ironskin'
  | 'swiftness'
  | 'shine'
  | 'night_owl'
  | 'spelunker'
  | 'obsidian_skin'
  | 'gills'
  | 'archery'
  | 'magic_power'
  | 'summoning'
  | 'wrath'
  | 'rage'
  | 'endurance'
  | 'lifeforce'
  | 'featherfall'
  | 'well_fed'
  | 'campfire'
  | 'heart_lantern'
  | 'water_candle'
  | 'poisoned'
  | 'on_fire'
  | 'frostburn'
  | 'cursed_inferno'
  | 'ichor'
  | 'bleeding'
  | 'confused'
  | 'chilled'
  | 'potion_sickness'
  | 'mana_sickness';

export interface EquipmentBonuses {
  defense?: number;
  maxHpBonus?: number;
  maxManaBonus?: number;
  moveSpeedMult?: number;
  meleeDamageMult?: number;
  rangedDamageMult?: number;
  magicDamageMult?: number;
  summonDamageMult?: number;
  allDamageMult?: number;
  critChanceBonus?: number;
  meleeSpeedMult?: number;
  manaCostMult?: number;
  maxMinionsBonus?: number;
  maxSentriesBonus?: number;
  doubleJump?: boolean;
  jumpBoostMult?: number;
  noFallDamage?: boolean;
  dashEnabled?: boolean;
  knockbackImmune?: boolean;
  fireBlockImmune?: boolean;
  waterWalk?: boolean;
  lavaWalk?: boolean;
  swimSpeedMult?: number;
  hpRegenBonus?: number;
  manaRegenBonus?: number;
  wingFlightTicks?: number;
  shineRadius?: number;
  ammoSaveChance?: number;
  lifeSteal?: number;
  thorns?: number;
  setBonusId?: string;
  setBonusDescription?: string;
}

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  maxStack: number;
  valueCopper: number; // Sell price = valueCopper / 5
  tooltip?: string;
  iconColor: string;
  iconAccent?: string;
  iconShape:
    | 'sword'
    | 'pickaxe'
    | 'axe'
    | 'hammer'
    | 'bow'
    | 'gun'
    | 'staff'
    | 'book'
    | 'whip'
    | 'yoyo'
    | 'boomerang'
    | 'flail'
    | 'spear'
    | 'arrow'
    | 'bullet'
    | 'helmet'
    | 'chestplate'
    | 'greaves'
    | 'accessory'
    | 'wings'
    | 'boots'
    | 'shield'
    | 'potion'
    | 'food'
    | 'block'
    | 'ore'
    | 'bar'
    | 'gem'
    | 'coin'
    | 'fish'
    | 'rod'
    | 'hook'
    | 'boss_summon'
    | 'crystal'
    | 'herb'
    | 'torch'
    | 'station'
    | 'bag'
    | 'mount'
    | 'pet'
    | 'key'
    | 'misc';
  // Block placement
  placesBlock?: BlockId;
  placesWall?: number;
  // Tool properties
  pickPower?: number;
  axePower?: number;
  hammerPower?: number;
  toolSpeed?: number; // uses per second
  toolRange?: number;
  fishingPower?: number;
  baitPower?: number;
  hookRange?: number;
  // Combat properties
  weaponType?: WeaponSubType;
  damage?: number;
  damageType?: DamageType;
  knockback?: number;
  useTime?: number; // seconds per use
  critChance?: number; // base 4
  manaCost?: number;
  ammoType?: 'arrow' | 'bullet' | 'rocket' | 'star' | 'gel';
  consumesAmmo?: 'arrow' | 'bullet' | 'rocket' | 'star';
  projectileId?: string;
  projectileSpeed?: number;
  projectileCount?: number;
  spreadAngle?: number;
  autoReuse?: boolean;
  // Consumable properties
  healHp?: number;
  healMana?: number;
  grantsBuff?: { id: BuffId; duration: number };
  permanentLifeUp?: number;
  permanentManaUp?: number;
  summonsBoss?: string;
  triggersEvent?: EventId;
  opensBagLootId?: string;
  // Equipment properties
  armorSlot?: ArmorSlot;
  armorSetId?: string;
  bonuses?: EquipmentBonuses;
  // Mount / Pet
  mountId?: string;
  petId?: string;
  // Color/Light
  holdLight?: number;
  // Quest / Dye
  isQuestFish?: boolean;
}

export type ModifierId =
  | 'none'
  | 'keen'
  | 'superior'
  | 'forceful'
  | 'broken'
  | 'damaged'
  | 'shoddy'
  | 'quick'
  | 'deadly'
  | 'agile'
  | 'nimble'
  | 'murderous'
  | 'slow'
  | 'sluggish'
  | 'lazy'
  | 'annoying'
  | 'nasty'
  | 'legendary'
  | 'unreal'
  | 'mythical'
  | 'godly'
  | 'demonic'
  | 'ruthless'
  | 'warding'
  | 'armored'
  | 'menacing'
  | 'lucky'
  | 'arcane'
  | 'quick_acc'
  | 'violent';

export interface ItemStack {
  itemId: string;
  count: number;
  modifier?: ModifierId;
}

export interface RecipeIngredient {
  itemId: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  resultId: string;
  resultCount: number;
  ingredients: RecipeIngredient[];
  station: CraftingStationId;
  hardmodeOnly?: boolean;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  skyColorTop: string;
  skyColorBottom: string;
  fogColor: string;
  fogDensity: number;
  ambientColor: string;
  ambientIntensity: number;
  waterColor: string;
  musicTheme: string;
  isHardmodeEvil?: boolean;
  isUnderground?: boolean;
  mapColor: string;
}

export type EnemyAiType =
  | 'slime'
  | 'fighter'
  | 'flying'
  | 'caster'
  | 'worm'
  | 'aquatic'
  | 'archer'
  | 'antlion'
  | 'unicorn'
  | 'mimic';

export interface LootDrop {
  itemId: string;
  minCount: number;
  maxCount: number;
  chance: number; // 0..1
  hardmodeOnly?: boolean;
  expertOnly?: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  damage: number;
  defense: number;
  knockbackResist: number;
  aiType: EnemyAiType;
  biomes: BiomeId[];
  timeRule: 'any' | 'day' | 'night';
  hardmodeOnly?: boolean;
  postPlanteraOnly?: boolean;
  eventOnly?: EventId;
  size: [number, number, number]; // width, height, depth
  colorPrimary: string;
  colorSecondary: string;
  emissiveColor?: string;
  speed: number;
  jumpForce?: number;
  rangedProjectile?: string;
  rangedCooldown?: number;
  copperValue: number;
  drops: LootDrop[];
  bannerKills?: number;
  rarityWeight: number;
  description: string;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  maxHp: number;
  damage: number;
  defense: number;
  isHardmode: boolean;
  progressionOrder: number;
  summonItemId?: string;
  spawnBiome?: BiomeId | 'any';
  spawnTime?: 'any' | 'night';
  colorPrimary: string;
  colorSecondary: string;
  scale: number;
  treasureBagId: string;
  trophyItemId: string;
  drops: LootDrop[];
  unlockFlag: string;
  lore: string;
}

export interface NpcShopItem {
  itemId: string;
  priceCopper: number;
  condition?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  colorShirt: string;
  colorHair: string;
  colorSkin: string;
  preferredBiomes: BiomeId[];
  dislikedBiomes: BiomeId[];
  lovedNpcs: string[];
  dislikedNpcs: string[];
  unlockCondition: string;
  quotes: string[];
  shop: NpcShopItem[];
  specialAction?: 'heal' | 'reforge' | 'guide_craft' | 'angler_quest' | 'tax_collect' | 'cleanse';
}

export type EventId =
  | 'blood_moon'
  | 'slime_rain'
  | 'goblin_army'
  | 'pirate_invasion'
  | 'solar_eclipse'
  | 'frost_legion'
  | 'pumpkin_moon'
  | 'frost_moon'
  | 'martian_madness'
  | 'old_ones_army'
  | 'lunar_events';

export interface ActiveBuff {
  id: BuffId;
  remaining: number;
}

export interface CharacterAppearance {
  hairStyle: number; // 0..11
  hairColor: string;
  skinColor: string;
  eyeColor: string;
  shirtColor: string;
  undershirtColor: string;
  pantsColor: string;
  shoeColor: string;
}

export interface CharacterSave {
  id: string;
  name: string;
  difficulty: CharacterDifficulty;
  appearance: CharacterAppearance;
  maxHp: number;
  hp: number;
  maxMana: number;
  mana: number;
  lifeCrystalsUsed: number;
  lifeFruitsUsed: number;
  manaCrystalsUsed: number;
  demonHeartUsed?: boolean;
  inventory: (ItemStack | null)[]; // 40 main slots (0..9 = hotbar)
  coins: (ItemStack | null)[]; // 4 coin slots
  ammo: (ItemStack | null)[]; // 4 ammo slots
  armor: (ItemStack | null)[]; // 3 slots: head, body, legs
  vanityArmor: (ItemStack | null)[]; // 3 slots
  accessories: (ItemStack | null)[]; // 7 slots (5 base + 2 expert/master)
  equipment: {
    hook: ItemStack | null;
    mount: ItemStack | null;
    pet: ItemStack | null;
  };
  piggyBank: (ItemStack | null)[]; // 20 slots
  researchedItems: Record<string, number>; // Journey mode research counts
  unlockedAchievements: string[];
  playTimeSeconds: number;
  createdAt: number;
  lastPlayedAt: number;
}

export interface ChestContents {
  x: number;
  y: number;
  z: number;
  items: (ItemStack | null)[]; // 20 slots
}

export interface NpcHouseRecord {
  npcId: string;
  x: number;
  y: number;
  z: number;
  valid: boolean;
}

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  size: WorldSize;
  difficulty: GameDifficulty;
  evilType: EvilType;
  isHardmode: boolean;
  defeatedBosses: string[];
  altarsSmashed: number;
  orbsSmashed: number;
  timeOfDay: number; // 0..1440 (minutes in day, 270 = 4:30 AM dawn, 720 = noon, 1170 = 7:30 PM dusk)
  dayCount: number;
  weather: 'clear' | 'rain' | 'storm';
  weatherTimer: number;
  activeEvent: EventId | null;
  eventProgress: number;
  eventTarget: number;
  pillarsRemaining: ('solar' | 'vortex' | 'nebula' | 'stardust')[];
  spawnPoint: [number, number, number];
  npcHouses: NpcHouseRecord[];
  unlockedNpcs: string[];
  anglerQuestsCompleted: number;
  currentAnglerQuestFish: string;
  bestiaryKills: Record<string, number>;
  createdAt: number;
  lastPlayedAt: number;
}

export interface ChunkDeltaRecord {
  key: string; // `${cx},${cy},${cz}`
  blocks: Record<number, number>; // localIndex -> BlockId
  liquids?: Record<number, number>; // localIndex -> packed liquid
  walls?: Record<number, number>; // localIndex -> wall id
}

export interface WorldSave {
  meta: WorldMeta;
  chunkDeltas: Record<string, ChunkDeltaRecord>;
  chests: Record<string, ChestContents>;
  exploredChunks: string[]; // `${cx},${cz}`
  playerPositionsByChar: Record<string, [number, number, number]>;
}

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'custom';

export interface GameSettings {
  graphicsPreset: GraphicsPreset;
  renderDistance: number; // in chunks: 3..8
  shadows: boolean;
  ambientOcclusion: boolean;
  particleDensity: number; // 0.25..1.0
  fov: number; // 55..90
  cameraSensitivity: number;
  invertY: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  touchControlsMode: 'auto' | 'on' | 'off';
  autoJump: boolean;
  showFps: boolean;
}

export interface JourneyPowersState {
  godmode: boolean;
  timeFrozen: boolean;
  timeRate: number; // 1, 12, 24
  spawnRateMult: number; // 0, 0.5, 1, 2, 5, 10
  placementRangeBoost: boolean;
  weatherLocked: 'none' | 'clear' | 'rain' | 'storm';
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: 'collector' | 'slayer' | 'explorer' | 'challenger';
}

export interface ContentStatusReport {
  category: string;
  totalCount: number;
  fullyImplemented: number;
  partiallyImplemented: number;
  notes: string;
}
