import {
  CharacterAppearance,
  CharacterDifficulty,
  CharacterSave,
  EvilType,
  GameDifficulty,
  GameSettings,
  ItemStack,
  WorldSave,
  WorldSize,
} from '@/types/game';

const DB_NAME = 'Terraria3D_SaveDB';
const DB_VERSION = 1;
const STORE_CHARACTERS = 'characters';
const STORE_WORLDS = 'worlds';
const SETTINGS_KEY = 'terraria3d_settings_v1';

const isLikelyMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 920;
};

export const DEFAULT_SETTINGS: GameSettings = {
  graphicsPreset: isLikelyMobileDevice() ? 'medium' : 'high',
  renderDistance: isLikelyMobileDevice() ? 4 : 5,
  shadows: true,
  ambientOcclusion: true,
  particleDensity: isLikelyMobileDevice() ? 0.85 : 1.0,
  fov: 72,
  cameraSensitivity: 1.0,
  invertY: false,
  masterVolume: 0.7,
  musicVolume: 0.45,
  sfxVolume: 0.75,
  touchControlsMode: 'auto',
  autoJump: true,
  showFps: true,
  targetFps: 120,
  resolutionScale: 1.0,
};

export function createDefaultCharacter(
  name: string,
  difficulty: CharacterDifficulty,
  appearance: CharacterAppearance
): CharacterSave {
  // Players always begin empty-handed: punch trees & slimes to forge your first gear!
  const inv: (ItemStack | null)[] = Array(40).fill(null);

  return {
    schemaVersion: 2,
    id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Terrarian',
    difficulty,
    appearance,
    maxHp: 100,
    hp: 100,
    maxMana: 20,
    mana: 20,
    lifeCrystalsUsed: 0,
    lifeFruitsUsed: 0,
    manaCrystalsUsed: 0,
    inventory: inv,
    coins: Array(4).fill(null),
    ammo: Array(4).fill(null),
    armor: [null, null, null],
    vanityArmor: [null, null, null],
    accessories: Array(7).fill(null),
    equipment: { hook: null, mount: null, pet: null },
    piggyBank: Array(20).fill(null),
    researchedItems: {},
    unlockedAchievements: [],
    playTimeSeconds: 0,
    createdAt: Date.now(),
    lastPlayedAt: Date.now(),
  };
}

export function createNewWorldSave(
  name: string,
  seed: number,
  size: WorldSize,
  difficulty: GameDifficulty,
  evilType: EvilType
): WorldSave {
  return {
    meta: {
      id: `world_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || 'Terra 3D',
      seed: Number.isFinite(seed) ? Math.floor(seed) : Math.floor(Math.random() * 99999999),
      size,
      difficulty,
      evilType,
      isHardmode: false,
      defeatedBosses: [],
      altarsSmashed: 0,
      orbsSmashed: 0,
      timeOfDay: 490, // 8:10 AM bright morning
      dayCount: 1,
      weather: 'clear',
      weatherTimer: 240,
      activeEvent: null,
      eventProgress: 0,
      eventTarget: 0,
      pillarsRemaining: [],
      spawnPoint: [0, 145, 0],
      npcHouses: [],
      unlockedNpcs: ['guide'],
      anglerQuestsCompleted: 0,
      currentAnglerQuestFish: 'bass',
      bestiaryKills: {},
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
    },
    chunkDeltas: {},
    chests: {},
    exploredChunks: [],
    playerPositionsByChar: {},
  };
}

export class SaveManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
          db.createObjectStore(STORE_CHARACTERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_WORLDS)) {
          db.createObjectStore(STORE_WORLDS, { keyPath: 'meta.id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open DB'));
    });
    return this.dbPromise;
  }

  public loadSettings(): GameSettings {
    try {
      if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      const merged: GameSettings = { ...DEFAULT_SETTINGS, ...parsed };
      if (parsed.targetFps === undefined && isLikelyMobileDevice() && parsed.renderDistance === 5 && parsed.graphicsPreset === 'medium') {
        merged.renderDistance = 4;
      }
      return merged;
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public saveSettings(settings: GameSettings): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage quota edge cases
    }
  }

  public async saveCharacter(char: CharacterSave): Promise<void> {
    char.lastPlayedAt = Date.now();
    (char as CharacterSave & { schemaVersion?: number }).schemaVersion = 2;
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHARACTERS, 'readwrite');
      tx.objectStore(STORE_CHARACTERS).put(char);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async listCharacters(): Promise<CharacterSave[]> {
    try {
      const db = await this.getDB();
      return await new Promise<CharacterSave[]>((resolve, reject) => {
        const tx = db.transaction(STORE_CHARACTERS, 'readonly');
        const req = tx.objectStore(STORE_CHARACTERS).getAll();
        req.onsuccess = () => {
          const list = (req.result ?? [])
            .map((c) => this.recoverCharacter(c))
            .filter((c): c is CharacterSave => c !== null)
            .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public async deleteCharacter(id: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHARACTERS, 'readwrite');
      tx.objectStore(STORE_CHARACTERS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async saveWorld(world: WorldSave): Promise<void> {
    world.meta.lastPlayedAt = Date.now();
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).put(world);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async listWorlds(): Promise<WorldSave[]> {
    try {
      const db = await this.getDB();
      return await new Promise<WorldSave[]>((resolve, reject) => {
        const tx = db.transaction(STORE_WORLDS, 'readonly');
        const req = tx.objectStore(STORE_WORLDS).getAll();
        req.onsuccess = () => {
          const list = (req.result ?? [])
            .map((w) => this.recoverWorld(w))
            .filter((w): w is WorldSave => w !== null)
            .sort((a, b) => b.meta.lastPlayedAt - a.meta.lastPlayedAt);
          resolve(list);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public async loadWorld(id: string): Promise<WorldSave | null> {
    try {
      const db = await this.getDB();
      return await new Promise<WorldSave | null>((resolve, reject) => {
        const tx = db.transaction(STORE_WORLDS, 'readonly');
        const req = tx.objectStore(STORE_WORLDS).get(id);
        req.onsuccess = () => resolve(this.recoverWorld(req.result));
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  public async deleteWorld(id: string): Promise<void> {
    const db = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_WORLDS, 'readwrite');
      tx.objectStore(STORE_WORLDS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private recoverCharacter(raw: any): CharacterSave | null {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    const base = createDefaultCharacter(raw.name ?? 'Terrarian', raw.difficulty ?? 'classic', raw.appearance ?? {
      hairStyle: 0,
      hairColor: '#5c3b28',
      skinColor: '#f5cfa0',
      eyeColor: '#2962ff',
      shirtColor: '#4caf50',
      undershirtColor: '#d7ccc8',
      pantsColor: '#3949ab',
      shoeColor: '#4e342e',
    });
    const inv: (ItemStack | null)[] = Array.isArray(raw.inventory) ? raw.inventory.slice(0, 40) : base.inventory;
    // Upgrade untouched v1 starter characters (< 2 min playtime with only old starter kit) to true empty start
    const oldStarterIds = new Set([
      'copper_shortsword', 'copper_pickaxe', 'copper_axe', 'torch', 'lesser_healing_potion',
      'iron_pickaxe', 'iron_broadsword', 'finch_staff', 'grappling_hook', 'magic_mirror',
    ]);
    const isUntouchedV1Starter =
      raw.schemaVersion !== 2 &&
      (raw.playTimeSeconds ?? 0) < 120 &&
      inv.every((s) => !s || oldStarterIds.has(s.itemId));

    const recovered: CharacterSave & { schemaVersion?: number } = {
      ...base,
      ...raw,
      inventory: isUntouchedV1Starter ? Array(40).fill(null) : inv,
      coins: Array.isArray(raw.coins) ? raw.coins.slice(0, 4) : base.coins,
      ammo: Array.isArray(raw.ammo) ? raw.ammo.slice(0, 4) : base.ammo,
      armor: Array.isArray(raw.armor) ? raw.armor.slice(0, 3) : base.armor,
      vanityArmor: Array.isArray(raw.vanityArmor) ? raw.vanityArmor.slice(0, 3) : base.vanityArmor,
      accessories: Array.isArray(raw.accessories) ? raw.accessories.slice(0, 7) : base.accessories,
      equipment: { ...base.equipment, ...(raw.equipment ?? {}) },
      piggyBank: Array.isArray(raw.piggyBank) ? raw.piggyBank.slice(0, 20) : base.piggyBank,
      researchedItems: raw.researchedItems ?? {},
      unlockedAchievements: Array.isArray(raw.unlockedAchievements) ? raw.unlockedAchievements : [],
      schemaVersion: 2,
    };
    return recovered;
  }

  private recoverWorld(raw: any): WorldSave | null {
    if (!raw || typeof raw !== 'object' || !raw.meta || !raw.meta.id) return null;
    const fallback = createNewWorldSave(raw.meta.name ?? 'Terra 3D', raw.meta.seed ?? 12345, raw.meta.size ?? 'small', raw.meta.difficulty ?? 'classic', raw.meta.evilType ?? 'corruption');
    return {
      meta: { ...fallback.meta, ...raw.meta },
      chunkDeltas: raw.chunkDeltas ?? {},
      chests: raw.chests ?? {},
      exploredChunks: Array.isArray(raw.exploredChunks) ? raw.exploredChunks : [],
      playerPositionsByChar: raw.playerPositionsByChar ?? {},
    };
  }
}
