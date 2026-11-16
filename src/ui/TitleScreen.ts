import { ACHIEVEMENTS } from '@/data/achievements';
import { getContentStatusReport } from '@/data/contentRegistry';
import { AudioEngine } from '@/audio/AudioEngine';
import { createDefaultCharacter, createNewWorldSave, SaveManager } from '@/systems/SaveManager';
import {
  CharacterAppearance,
  CharacterDifficulty,
  CharacterSave,
  EvilType,
  GameDifficulty,
  GameSettings,
  WorldSave,
  WorldSize,
} from '@/types/game';

export interface TitleCallbacks {
  onLaunchGame: (char: CharacterSave, world: WorldSave, settings: GameSettings) => void;
}

type ScreenView = 'main' | 'characters' | 'new_char' | 'worlds' | 'new_world' | 'settings' | 'achievements' | 'checklist';

const DEFAULT_APPEARANCE: CharacterAppearance = {
  hairStyle: 0,
  hairColor: '#6d4c41',
  skinColor: '#f5cfa0',
  eyeColor: '#1e88e5',
  shirtColor: '#43a047',
  undershirtColor: '#cfd8dc',
  pantsColor: '#3949ab',
  shoeColor: '#4e342e',
};

export class TitleScreen {
  public readonly root: HTMLDivElement;
  private bgCanvas: HTMLCanvasElement;
  private contentEl: HTMLDivElement;
  private saveManager: SaveManager;
  private audio: AudioEngine;
  private cb: TitleCallbacks;

  private view: ScreenView = 'main';
  private characters: CharacterSave[] = [];
  private worlds: WorldSave[] = [];
  private selectedChar: CharacterSave | null = null;
  private settings: GameSettings;
  private animId = 0;

  constructor(saveManager: SaveManager, audio: AudioEngine, cb: TitleCallbacks) {
    this.saveManager = saveManager;
    this.audio = audio;
    this.cb = cb;
    this.settings = saveManager.loadSettings();

    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;';

    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;';
    this.root.appendChild(this.bgCanvas);

    this.contentEl = document.createElement('div');
    this.contentEl.className = 't-scroll';
    this.contentEl.style.cssText = 'position:relative;z-index:1;width:min(860px,94vw);max-height:94dvh;padding:10px 0;display:flex;flex-direction:column;align-items:center;gap:12px;';
    this.root.appendChild(this.contentEl);

    this.render();
    void this.initData();
    this.startBackdropAnimation();
  }

  private async initData(): Promise<void> {
    this.characters = await this.saveManager.listCharacters();
    this.worlds = await this.saveManager.listWorlds();
    this.render();
  }

  private startBackdropAnimation(): void {
    const draw = (t: number) => {
      this.animId = requestAnimationFrame(draw);
      const w = (this.bgCanvas.width = window.innerWidth);
      const h = (this.bgCanvas.height = window.innerHeight);
      const ctx = this.bgCanvas.getContext('2d');
      if (!ctx) return;

      const cycle = (Math.sin(t * 0.00015) + 1) * 0.5;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, cycle > 0.35 ? '#1c4f9c' : '#080e24');
      grad.addColorStop(1, cycle > 0.35 ? '#7ec8f2' : '#18244d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = cycle > 0.35 ? '#ffe57f' : '#e3f2fd';
      ctx.beginPath();
      ctx.arc(w * (0.15 + cycle * 0.7), h * (0.28 - Math.sin(cycle * Math.PI) * 0.14), 34, 0, Math.PI * 2);
      ctx.fill();

      const layers = [
        { color: '#1b3d2f', base: 0.72, amp: 52, spd: 0.015 },
        { color: '#27593d', base: 0.8, amp: 36, spd: 0.025 },
        { color: '#3b2c20', base: 0.88, amp: 18, spd: 0.04 },
      ];
      for (const l of layers) {
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const step = 28;
        for (let x = 0; x <= w + step; x += step) {
          const offset = Math.floor((x + t * l.spd) / step);
          const y = h * l.base - Math.abs(Math.sin(offset * 0.35)) * l.amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }
    };
    this.animId = requestAnimationFrame(draw);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animId);
  }

  private async handleQuickPlay(): Promise<void> {
    this.audio.unlock();
    let char = this.characters[0];
    if (!char) {
      char = createDefaultCharacter('Terrarian', 'classic', { ...DEFAULT_APPEARANCE });
      await this.saveManager.saveCharacter(char);
      this.characters.push(char);
    }
    let world = this.worlds[0];
    if (!world) {
      world = createNewWorldSave('Emerald Realm', Math.floor(Math.random() * 9999999) + 1, 'small', 'classic', 'corruption');
      await this.saveManager.saveWorld(world);
      this.worlds.push(world);
    }
    this.cb.onLaunchGame(char, world, this.settings);
  }

  public render(): void {
    if (this.view === 'main') this.renderMain();
    else if (this.view === 'characters') this.renderCharacters();
    else if (this.view === 'new_char') this.renderNewCharacter();
    else if (this.view === 'worlds') this.renderWorlds();
    else if (this.view === 'new_world') this.renderNewWorld();
    else if (this.view === 'settings') this.renderSettings();
    else if (this.view === 'achievements') this.renderAchievements();
    else if (this.view === 'checklist') this.renderChecklist();
  }

  private renderMain(): void {
    this.contentEl.innerHTML = `
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:clamp(34px,6vw,60px);font-weight:900;letter-spacing:2px;color:#62f29b;text-shadow:0 4px 0 #1f4d32, 0 8px 20px rgba(0,0,0,0.75);">
          TERRARIA <span style="color:#ffd740;">3D</span>
        </div>
        <div style="font-size:14px;color:#d0e2ff;text-shadow:0 2px 4px #000;">Full Three-Dimensional Voxel Sandbox Adventure</div>
      </div>
      <div class="t-panel" style="padding:20px;width:min(360px,92vw);display:flex;flex-direction:column;gap:10px;">
        <button class="t-btn t-btn-gold" id="m-quick" style="font-size:16px;padding:12px;">Quick Play</button>
        <button class="t-btn" id="m-single" style="font-size:15px;padding:10px;">Single Player (Characters & Worlds)</button>
        <button class="t-btn" id="m-settings">Settings</button>
        <button class="t-btn" id="m-ach">Achievements (${this.characters[0]?.unlockedAchievements.length ?? 0}/${ACHIEVEMENTS.length})</button>
        <button class="t-btn" id="m-check">Content & Feature Status</button>
      </div>
      <div style="font-size:12px;color:#c2d4f8;text-shadow:0 1px 3px #000;">WebGL2 · Procedural Voxel Engine · Up to 120 FPS · Desktop & Mobile Landscape</div>
    `;

    this.contentEl.querySelector('#m-quick')?.addEventListener('click', () => void this.handleQuickPlay());
    this.contentEl.querySelector('#m-single')?.addEventListener('click', () => { this.audio.unlock(); this.view = 'characters'; this.render(); });
    this.contentEl.querySelector('#m-settings')?.addEventListener('click', () => { this.view = 'settings'; this.render(); });
    this.contentEl.querySelector('#m-ach')?.addEventListener('click', () => { this.view = 'achievements'; this.render(); });
    this.contentEl.querySelector('#m-check')?.addEventListener('click', () => { this.view = 'checklist'; this.render(); });
  }

  private renderCharacters(): void {
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Select Character</h2>
          <div style="display:flex;gap:8px;">
            <button class="t-btn t-btn-gold" id="c-new">+ New Character</button>
            <button class="t-btn" id="c-back">Back</button>
          </div>
        </div>
        <div class="t-scroll" id="c-list" style="display:flex;flex-direction:column;gap:8px;max-height:58vh;"></div>
      </div>
    `;
    this.contentEl.querySelector('#c-new')?.addEventListener('click', () => { this.view = 'new_char'; this.render(); });
    this.contentEl.querySelector('#c-back')?.addEventListener('click', () => { this.view = 'main'; this.render(); });

    const list = this.contentEl.querySelector('#c-list')!;
    if (this.characters.length === 0) {
      list.innerHTML = '<div style="padding:14px;color:#9eb0df;">No saved characters yet. Create a new character!</div>';
      return;
    }
    for (const c of this.characters) {
      const row = document.createElement('div');
      row.className = 't-panel';
      row.style.cssText = 'padding:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:28px;height:40px;border:2px solid #fff;border-radius:4px;background:linear-gradient(180deg,${c.appearance.hairColor} 22%,${c.appearance.skinColor} 45%,${c.appearance.shirtColor} 75%,${c.appearance.pantsColor} 100%);"></div>
          <div>
            <div style="font-weight:700;color:#ffd740;">${c.name} <span style="font-size:11px;color:#80d8ff;">[${c.difficulty.toUpperCase()}]</span></div>
            <div style="font-size:12px;color:#cbd7fa;">HP: ${c.maxHp} · Mana: ${c.maxMana} · Achievements: ${c.unlockedAchievements.length}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="t-btn t-btn-gold" data-play="${c.id}">Play</button>
          <button class="t-btn t-btn-danger" data-del="${c.id}">Delete</button>
        </div>
      `;
      row.querySelector('[data-play]')?.addEventListener('click', () => {
        this.selectedChar = c;
        this.view = 'worlds';
        this.render();
      });
      row.querySelector('[data-del]')?.addEventListener('click', async () => {
        await this.saveManager.deleteCharacter(c.id);
        this.characters = await this.saveManager.listCharacters();
        this.render();
      });
      list.appendChild(row);
    }
  }

  private renderNewCharacter(): void {
    const draft = createDefaultCharacter('Hero', 'classic', { ...DEFAULT_APPEARANCE });

    this.contentEl.innerHTML = `
      <div class="t-panel modal-card" style="max-width:560px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Create Character</h2>
          <button class="t-btn" id="nc-back">Back</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
          <label>Name:<br/><input class="t-input" id="nc-name" value="Hero" style="width:100%;" /></label>
          <label>Difficulty:<br/>
            <select class="t-select" id="nc-diff" style="width:100%;">
              <option value="classic">Classic (Drops coins)</option>
              <option value="mediumcore">Mediumcore (Drops items)</option>
              <option value="hardcore">Hardcore (Permadeath)</option>
              <option value="journey">Journey (Creative Powers)</option>
            </select>
          </label>
          <label>Hair Style: <select class="t-select" id="nc-hair-st">${[0, 1, 2, 3, 4, 5].map((i) => `<option value="${i}">Style ${i + 1}</option>`).join('')}</select></label>
          <label>Skin: <input type="color" id="nc-skin" value="${draft.appearance.skinColor}" /></label>
          <label>Hair: <input type="color" id="nc-hair" value="${draft.appearance.hairColor}" /></label>
          <label>Shirt: <input type="color" id="nc-shirt" value="${draft.appearance.shirtColor}" /></label>
          <label>Pants: <input type="color" id="nc-pants" value="${draft.appearance.pantsColor}" /></label>
          <label>Eyes: <input type="color" id="nc-eyes" value="${draft.appearance.eyeColor}" /></label>
        </div>
        <button class="t-btn t-btn-gold" id="nc-create">Create Character</button>
      </div>
    `;
    this.contentEl.querySelector('#nc-back')?.addEventListener('click', () => { this.view = 'characters'; this.render(); });
    this.contentEl.querySelector('#nc-create')?.addEventListener('click', async () => {
      const name = (this.contentEl.querySelector('#nc-name') as HTMLInputElement).value.trim() || 'Hero';
      const diff = (this.contentEl.querySelector('#nc-diff') as HTMLSelectElement).value as CharacterDifficulty;
      const appearance: CharacterAppearance = {
        ...DEFAULT_APPEARANCE,
        hairStyle: Number((this.contentEl.querySelector('#nc-hair-st') as HTMLSelectElement).value),
        skinColor: (this.contentEl.querySelector('#nc-skin') as HTMLInputElement).value,
        hairColor: (this.contentEl.querySelector('#nc-hair') as HTMLInputElement).value,
        shirtColor: (this.contentEl.querySelector('#nc-shirt') as HTMLInputElement).value,
        pantsColor: (this.contentEl.querySelector('#nc-pants') as HTMLInputElement).value,
        eyeColor: (this.contentEl.querySelector('#nc-eyes') as HTMLInputElement).value,
      };
      const char = createDefaultCharacter(name, diff, appearance);
      await this.saveManager.saveCharacter(char);
      this.characters = await this.saveManager.listCharacters();
      this.selectedChar = char;
      this.view = 'worlds';
      this.render();
    });
  }

  private renderWorlds(): void {
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h2 style="margin:0;color:#ffd740;">Select World for ${this.selectedChar?.name ?? 'Player'}</h2>
          <div style="display:flex;gap:8px;">
            <button class="t-btn t-btn-gold" id="w-new">+ New World</button>
            <button class="t-btn" id="w-back">Back</button>
          </div>
        </div>
        <div class="t-scroll" id="w-list" style="display:flex;flex-direction:column;gap:8px;max-height:58vh;"></div>
      </div>
    `;
    this.contentEl.querySelector('#w-new')?.addEventListener('click', () => { this.view = 'new_world'; this.render(); });
    this.contentEl.querySelector('#w-back')?.addEventListener('click', () => { this.view = 'characters'; this.render(); });

    const list = this.contentEl.querySelector('#w-list')!;
    if (this.worlds.length === 0) {
      list.innerHTML = '<div style="padding:14px;color:#9eb0df;">No saved worlds yet. Create a new 3D world!</div>';
      return;
    }
    for (const w of this.worlds) {
      const row = document.createElement('div');
      row.className = 't-panel';
      row.style.cssText = 'padding:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;';
      row.innerHTML = `
        <div>
          <div style="font-weight:700;color:#ffd740;">${w.meta.name} ${w.meta.isHardmode ? '<span style="color:#ff80ff;">[HARDMODE]</span>' : ''}</div>
          <div style="font-size:12px;color:#cbd7fa;">
            Size: ${w.meta.size.toUpperCase()} · ${w.meta.difficulty.toUpperCase()} · Evil: <span style="color:${w.meta.evilType === 'corruption' ? '#b388ff' : '#ff6b6b'}">${w.meta.evilType.toUpperCase()}</span> · Seed: ${w.meta.seed} · Day ${w.meta.dayCount}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="t-btn t-btn-gold" data-enter="${w.meta.id}">Enter World</button>
          <button class="t-btn" data-exp="${w.meta.id}">Export</button>
          <button class="t-btn t-btn-danger" data-del="${w.meta.id}">Delete</button>
        </div>
      `;
      row.querySelector('[data-enter]')?.addEventListener('click', () => {
        if (!this.selectedChar) return;
        this.cb.onLaunchGame(this.selectedChar, w, this.settings);
      });
      row.querySelector('[data-exp]')?.addEventListener('click', () => {
        const json = JSON.stringify({ character: this.selectedChar, world: w }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `terraria3d_${w.meta.name.replace(/\s+/g, '_')}.json`;
        a.click();
      });
      row.querySelector('[data-del]')?.addEventListener('click', async () => {
        await this.saveManager.deleteWorld(w.meta.id);
        this.worlds = await this.saveManager.listWorlds();
        this.render();
      });
      list.appendChild(row);
    }
  }

  private renderNewWorld(): void {
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card" style="max-width:560px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Generate New 3D World</h2>
          <button class="t-btn" id="nw-back">Back</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
          <label>World Name:<br/><input class="t-input" id="nw-name" value="Aether Realm" style="width:100%;" /></label>
          <label>Seed (blank = random):<br/><input class="t-input" id="nw-seed" placeholder="e.g. 42198" style="width:100%;" /></label>
          <label>Size:<br/>
            <select class="t-select" id="nw-size" style="width:100%;">
              <option value="small">Small (480x480x256)</option>
              <option value="medium">Medium (768x768x256)</option>
              <option value="large">Large (1024x1024x256)</option>
            </select>
          </label>
          <label>Difficulty:<br/>
            <select class="t-select" id="nw-diff" style="width:100%;">
              <option value="classic">Classic</option>
              <option value="expert">Expert (Treasure Bags)</option>
              <option value="master">Master (2.3x Bosses)</option>
              <option value="journey">Journey</option>
            </select>
          </label>
          <label style="grid-column:span 2;">World Evil Biome:<br/>
            <select class="t-select" id="nw-evil" style="width:100%;">
              <option value="random">Random (Corruption or Crimson)</option>
              <option value="corruption">The Corruption (Purple Chasms & Eater)</option>
              <option value="crimson">The Crimson (Flesh Caves & Brain)</option>
            </select>
          </label>
        </div>
        <button class="t-btn t-btn-gold" id="nw-create">Create & Enter World</button>
      </div>
    `;
    this.contentEl.querySelector('#nw-back')?.addEventListener('click', () => { this.view = 'worlds'; this.render(); });
    this.contentEl.querySelector('#nw-create')?.addEventListener('click', async () => {
      const name = (this.contentEl.querySelector('#nw-name') as HTMLInputElement).value.trim() || 'New World';
      const rawSeed = (this.contentEl.querySelector('#nw-seed') as HTMLInputElement).value.trim();
      const seed = rawSeed ? (Number.isFinite(Number(rawSeed)) ? Math.abs(Math.floor(Number(rawSeed))) : rawSeed.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) : Math.floor(Math.random() * 9999999) + 1;
      const size = (this.contentEl.querySelector('#nw-size') as HTMLSelectElement).value as WorldSize;
      const diff = (this.contentEl.querySelector('#nw-diff') as HTMLSelectElement).value as GameDifficulty;
      const evilSel = (this.contentEl.querySelector('#nw-evil') as HTMLSelectElement).value;
      const evil: EvilType = evilSel === 'random' ? (Math.random() < 0.5 ? 'corruption' : 'crimson') : (evilSel as EvilType);

      const world = createNewWorldSave(name, seed, size, diff, evil);
      await this.saveManager.saveWorld(world);
      this.worlds = await this.saveManager.listWorlds();
      if (this.selectedChar) {
        this.cb.onLaunchGame(this.selectedChar, world, this.settings);
      } else {
        this.view = 'worlds';
        this.render();
      }
    });
  }

  private renderSettings(): void {
    const s = this.settings;
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card" style="max-width:560px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Settings</h2>
          <button class="t-btn" id="s-back">Back</button>
        </div>
        <div class="t-scroll" style="display:flex;flex-direction:column;gap:8px;font-size:13px;max-height:66dvh;">
          <label>Graphics Preset:
            <select class="t-select" id="ts-preset">
              <option value="low" ${s.graphicsPreset === 'low' ? 'selected' : ''}>Low (Turbo FPS)</option>
              <option value="medium" ${s.graphicsPreset === 'medium' ? 'selected' : ''}>Medium (Balanced)</option>
              <option value="high" ${s.graphicsPreset === 'high' ? 'selected' : ''}>High (Full Shadows & AO)</option>
            </select>
          </label>
          <label>Target FPS:
            <select class="t-select" id="ts-fps">
              <option value="120" ${(s.targetFps ?? 120) >= 120 ? 'selected' : ''}>Up to 120 FPS (Uncapped)</option>
              <option value="60" ${s.targetFps === 60 ? 'selected' : ''}>60 FPS (Smooth)</option>
              <option value="30" ${s.targetFps === 30 ? 'selected' : ''}>30 FPS (Battery Saver)</option>
            </select>
          </label>
          <label>Resolution Scale:
            <select class="t-select" id="ts-res">
              <option value="1" ${(s.resolutionScale ?? 1) >= 0.95 ? 'selected' : ''}>100% Native Sharp</option>
              <option value="0.85" ${(s.resolutionScale ?? 1) >= 0.8 && (s.resolutionScale ?? 1) < 0.95 ? 'selected' : ''}>85% Performance Boost</option>
              <option value="0.7" ${(s.resolutionScale ?? 1) < 0.8 ? 'selected' : ''}>70% Ultra FPS</option>
            </select>
          </label>
          <label>Render Distance: <b>${s.renderDistance}</b> <input type="range" id="ts-rd" min="2" max="8" value="${s.renderDistance}" /></label>
          <label>Master Volume: <b>${Math.round(s.masterVolume * 100)}%</b> <input type="range" id="ts-mv" min="0" max="1" step="0.05" value="${s.masterVolume}" /></label>
          <label>Mobile Touch Controls:
            <select class="t-select" id="ts-mob">
              <option value="auto" ${s.touchControlsMode === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="on" ${s.touchControlsMode === 'on' ? 'selected' : ''}>Always On</option>
              <option value="off" ${s.touchControlsMode === 'off' ? 'selected' : ''}>Off</option>
            </select>
          </label>
        </div>
      </div>
    `;
    this.contentEl.querySelector('#s-back')?.addEventListener('click', () => { this.view = 'main'; this.render(); });
    this.contentEl.querySelector('#ts-preset')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as GameSettings['graphicsPreset'];
      s.graphicsPreset = val;
      if (val === 'low') { s.renderDistance = 3; s.shadows = false; s.ambientOcclusion = false; s.resolutionScale = 0.85; }
      else if (val === 'medium') { s.renderDistance = 4; s.shadows = true; s.ambientOcclusion = true; s.resolutionScale = 1.0; }
      else { s.renderDistance = 6; s.shadows = true; s.ambientOcclusion = true; s.resolutionScale = 1.0; }
      this.saveManager.saveSettings(s);
      this.renderSettings();
    });
    this.contentEl.querySelector('#ts-fps')?.addEventListener('change', (e) => { s.targetFps = Number((e.target as HTMLSelectElement).value) as GameSettings['targetFps']; this.saveManager.saveSettings(s); });
    this.contentEl.querySelector('#ts-res')?.addEventListener('change', (e) => { s.resolutionScale = Number((e.target as HTMLSelectElement).value); this.saveManager.saveSettings(s); });
    this.contentEl.querySelector('#ts-rd')?.addEventListener('input', (e) => { s.renderDistance = Number((e.target as HTMLInputElement).value); this.saveManager.saveSettings(s); this.renderSettings(); });
    this.contentEl.querySelector('#ts-mv')?.addEventListener('input', (e) => { s.masterVolume = Number((e.target as HTMLInputElement).value); this.saveManager.saveSettings(s); this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume); this.renderSettings(); });
    this.contentEl.querySelector('#ts-mob')?.addEventListener('change', (e) => { s.touchControlsMode = (e.target as HTMLSelectElement).value as GameSettings['touchControlsMode']; this.saveManager.saveSettings(s); });
  }

  private renderAchievements(): void {
    const unlocked = new Set(this.characters[0]?.unlockedAchievements ?? []);
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Achievements (${unlocked.size} / ${ACHIEVEMENTS.length})</h2>
          <button class="t-btn" id="a-back">Back</button>
        </div>
        <div class="t-scroll" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;max-height:60vh;">
          ${ACHIEVEMENTS.map((a) => {
            const done = unlocked.has(a.id);
            return `<div class="t-panel" style="padding:8px;border-color:${done ? '#69f0ae' : '#4d67b8'};opacity:${done ? 1 : 0.72};">
              <div style="font-weight:700;color:${done ? '#ffd740' : '#d6e2ff'};">${a.name} ${done ? '✓' : ''}</div>
              <div style="font-size:11px;color:#9eb0df;">${a.description}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    this.contentEl.querySelector('#a-back')?.addEventListener('click', () => { this.view = 'main'; this.render(); });
  }

  private renderChecklist(): void {
    const rows = getContentStatusReport();
    this.contentEl.innerHTML = `
      <div class="t-panel modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;color:#ffd740;">Terraria 3D Content & System Status</h2>
          <button class="t-btn" id="chk-back">Back</button>
        </div>
        <div class="t-scroll" style="display:flex;flex-direction:column;gap:6px;max-height:64vh;">
          ${rows
            .map(
              (r) => `
            <div class="t-panel" style="padding:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;">
              <div>
                <div style="font-weight:700;font-size:13px;">${r.category} <span style="color:#ffd740;">(${r.fullyImplemented}/${r.totalCount})</span></div>
                <div style="font-size:11px;color:#cbd7fa;">${r.notes}</div>
              </div>
              <span style="font-size:11px;font-weight:700;color:${r.partiallyImplemented === 0 ? '#69f0ae' : '#ffab40'};">${r.partiallyImplemented === 0 ? 'IMPLEMENTED' : 'PARTIAL'}</span>
            </div>`
            )
            .join('')}
        </div>
      </div>
    `;
    this.contentEl.querySelector('#chk-back')?.addEventListener('click', () => { this.view = 'main'; this.render(); });
  }
}
