import { BIOMES } from '@/data/biomes';
import { getBlockDef } from '@/data/blocks';
import { BOSSES } from '@/data/bosses';
import { ENEMIES } from '@/data/enemies';
import { ALL_ITEMS, getItemDef, getRarityColor } from '@/data/items';
import { MODIFIERS, rollModifierForCategory } from '@/data/modifiers';
import { GameEngine } from '@/engine/GameEngine';
import { HousingSystem } from '@/systems/HousingSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { CHUNK_SIZE, GameSettings, NpcDef } from '@/types/game';
import { formatCoins, getIconUrl, hideTooltip } from './UiHelpers';

export type ActiveModalType = null | 'npc' | 'map' | 'bestiary' | 'journey' | 'pause';

const QUEST_FISH_NAMES = ['Amanita Fungifin', 'Angelfish', 'Batfish', 'Bloody Manowar', 'Bonefish', 'Bumblebee Tuna', 'Cloud Fish', 'Clownfish'];

export class ModalPanels {
  public readonly root: HTMLDivElement;
  private card: HTMLDivElement;
  private engine: GameEngine;
  private activeModal: ActiveModalType = null;
  private activeNpc: NpcDef | null = null;
  private bestiaryQuery = '';
  private journeyQuery = '';
  private anglerQuestIdx = 0;

  public onExitToTitle?: () => void;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.root = document.createElement('div');
    this.root.className = 'modal-backdrop';
    this.root.style.display = 'none';

    this.card = document.createElement('div');
    this.card.className = 't-panel modal-card';
    this.root.appendChild(this.card);

    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) this.close();
    });
  }

  public isOpen(): boolean {
    return this.activeModal !== null;
  }

  public open(type: ActiveModalType, npc?: NpcDef | null): void {
    if (!type) {
      this.close();
      return;
    }
    this.activeModal = type;
    if (npc !== undefined) this.activeNpc = npc;
    this.engine.paused = true;
    this.root.style.display = 'flex';
    this.render();
  }

  public close(): void {
    hideTooltip();
    this.activeModal = null;
    this.engine.activeNpcDialog = null;
    this.engine.paused = false;
    this.root.style.display = 'none';
  }

  public render(): void {
    if (this.activeModal === 'npc' && this.activeNpc) this.renderNpc(this.activeNpc);
    else if (this.activeModal === 'map') this.renderMap();
    else if (this.activeModal === 'bestiary') this.renderBestiary();
    else if (this.activeModal === 'journey') this.renderJourney();
    else if (this.activeModal === 'pause') this.renderPause();
  }

  private renderNpc(npc: NpcDef): void {
    const char = this.engine.char;
    const px = Math.floor(this.engine.player.position.x);
    const py = Math.floor(this.engine.player.position.y);
    const pz = Math.floor(this.engine.player.position.z);
    const happy = HousingSystem.getHappinessPriceMultiplier(npc, this.engine.world, [px, py, pz]);
    const coins = InventorySystem.getTotalCopper(char);

    const quote = npc.quotes[Math.floor(Math.random() * npc.quotes.length)];
    let dynamicNote = '';
    if (npc.specialAction === 'guide_craft') {
      const defeated = this.engine.world.meta.defeatedBosses;
      if (!defeated.includes('eye_of_cthulhu')) dynamicNote = 'Tip: Craft a Suspicious Looking Eye at a Demon/Crimson Altar or gather 200 HP & Gold/Platinum gear to challenge the Eye of Cthulhu at Night!';
      else if (!this.engine.world.meta.isHardmode) dynamicNote = 'Tip: Dig down to the Underworld at Y < 28 and use a Guide Voodoo Doll to defeat the Wall of Flesh and unlock Hardmode!';
      else if (!defeated.includes('plantera')) dynamicNote = 'Tip: Smash Demon Altars with the Pwnhammer, defeat the 3 Mechanical Bosses, then harvest Plantera Bulbs in the Underground Jungle!';
      else dynamicNote = 'Tip: Conquer the Golem in the Jungle Temple, defeat the Lunatic Cultist, destroy the 4 Celestial Pillars, and face the Moon Lord!';
    }

    this.card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;color:#ffd740;">${npc.name} (${npc.title})</h3>
          <div style="font-size:12px;color:#9eb0df;">Mood: ${happy.mood} (Price multiplier: ${Math.round(happy.mult * 100)}%) · Your Coins: <b style="color:#ffd740;">${formatCoins(coins)}</b></div>
        </div>
        <button class="t-btn t-btn-danger" id="npc-close">Close</button>
      </div>
      <div class="t-panel" style="padding:10px;font-size:13px;line-height:1.5;">
        "${quote}"
        ${dynamicNote ? `<div style="margin-top:6px;color:#69f0ae;"><b>${dynamicNote}</b></div>` : ''}
      </div>
      <div id="npc-action-area" class="t-scroll" style="display:flex;flex-direction:column;gap:8px;max-height:55vh;"></div>
    `;
    this.card.querySelector('#npc-close')?.addEventListener('click', () => this.close());

    const area = this.card.querySelector('#npc-action-area') as HTMLDivElement;

    if (npc.specialAction === 'heal') {
      const stats = InventorySystem.computePlayerStats(char, this.engine.activeBuffs);
      const missing = Math.max(0, stats.maxHp - Math.floor(char.hp));
      const cost = Math.max(25, Math.round(missing * 4 * happy.mult));
      const btn = document.createElement('button');
      btn.className = 't-btn t-btn-gold';
      btn.textContent = missing > 0 ? `Heal Full Health & Clear Debuffs (${formatCoins(cost)})` : 'You are already at full health!';
      btn.disabled = missing === 0 || coins < cost;
      btn.addEventListener('click', () => {
        if (InventorySystem.spendCopper(char, cost)) {
          char.hp = stats.maxHp;
          this.engine.activeBuffs = this.engine.activeBuffs.filter((b) => b.id !== 'on_fire' && b.id !== 'poisoned' && b.id !== 'cursed_inferno');
          this.engine.audio.playSfx('potion');
          this.renderNpc(npc);
        }
      });
      area.appendChild(btn);
    }

    if (npc.specialAction === 'reforge') {
      const heldIdx = this.engine.selectedHotbar;
      const stack = char.inventory[heldIdx];
      const def = stack ? getItemDef(stack.itemId) : undefined;
      const canReforge = Boolean(def && (def.category === 'weapon' || def.category === 'accessory' || def.category === 'tool'));
      const cost = Math.max(1000, Math.round((def?.valueCopper ?? 5000) * 0.35 * happy.mult));
      const row = document.createElement('div');
      row.className = 't-panel';
      row.style.cssText = 'padding:8px;display:flex;justify-content:space-between;align-items:center;';
      row.innerHTML = `
        <div style="font-size:12px;">
          <b>Reforge Selected Hotbar Item:</b> ${def ? `${stack?.modifier && MODIFIERS[stack.modifier]?.label ? MODIFIERS[stack.modifier].label + ' ' : ''}${def.name}` : 'Select a weapon, tool, or accessory in Hotbar'}
        </div>
        <button class="t-btn t-btn-gold" id="btn-reforge" ${!canReforge || coins < cost ? 'disabled' : ''}>Reforge (${formatCoins(cost)})</button>
      `;
      row.querySelector('#btn-reforge')?.addEventListener('click', () => {
        if (!stack || !def || !InventorySystem.spendCopper(char, cost)) return;
        const cat = def.category === 'accessory' ? 'accessory' : 'weapon';
        stack.modifier = rollModifierForCategory(cat, def.damageType);
        this.engine.audio.playSfx('craft');
        this.renderNpc(npc);
      });
      area.appendChild(row);
    }

    if (npc.specialAction === 'angler_quest') {
      const targetFish = QUEST_FISH_NAMES[this.anglerQuestIdx % QUEST_FISH_NAMES.length];
      const haveQuest = InventorySystem.countItem(char, 'quest_fish') > 0;
      const qBox = document.createElement('div');
      qBox.className = 't-panel';
      qBox.style.cssText = 'padding:8px;display:flex;justify-content:space-between;align-items:center;';
      qBox.innerHTML = `
        <div style="font-size:12px;"><b>Daily Quest:</b> Catch a <i>${targetFish}</i> and turn in a Quest Fish!</div>
        <button class="t-btn t-btn-gold" id="btn-angler" ${!haveQuest ? 'disabled' : ''}>Turn In Quest Fish</button>
      `;
      qBox.querySelector('#btn-angler')?.addEventListener('click', () => {
        if (InventorySystem.consumeItem(char, 'quest_fish', 1)) {
          InventorySystem.addItem(char, 'gold_coin', 3);
          InventorySystem.addItem(char, 'apprentice_bait', 5);
          this.anglerQuestIdx++;
          this.engine.audio.playSfx('craft');
          this.engine.notify('Angler Quest Completed! Received 3 Gold & Bait!', '#ffd740');
          this.renderNpc(npc);
        }
      });
      area.appendChild(qBox);
    }

    if (npc.shop.length > 0) {
      const shopGrid = document.createElement('div');
      shopGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;';
      for (const entry of npc.shop) {
        const def = getItemDef(entry.itemId);
        if (!def) continue;
        const price = Math.max(10, Math.round(entry.priceCopper * happy.mult));
        const itemRow = document.createElement('div');
        itemRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;background:rgba(12,18,38,0.78);border:1px solid #4d67b8;border-radius:5px;';
        itemRow.innerHTML = `
          <img src="${getIconUrl(entry.itemId)}" style="width:28px;height:28px;image-rendering:pixelated;" />
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:700;color:${getRarityColor(def.rarity)};">${def.name}</div>
            <div style="font-size:11px;color:#ffd740;">${formatCoins(price)}</div>
          </div>
          <button class="t-btn" style="padding:4px 8px;font-size:11px;" ${coins < price ? 'disabled' : ''}>Buy</button>
        `;
        itemRow.querySelector('button')?.addEventListener('click', () => {
          if (InventorySystem.spendCopper(char, price)) {
            InventorySystem.addItem(char, entry.itemId, 1);
            this.engine.audio.playSfx('coin');
            this.renderNpc(npc);
          }
        });
        shopGrid.appendChild(itemRow);
      }
      area.appendChild(shopGrid);
    }
  }

  private renderMap(): void {
    this.card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;color:#ffd740;">Explored World Map (${this.engine.world.exploredChunks.size} chunks explored)</h3>
        <button class="t-btn t-btn-danger" id="map-close">Close [M]</button>
      </div>
      <canvas id="world-map-canvas" width="760" height="420" style="width:100%;height:auto;background:#070b18;border:2px solid #4d67b8;border-radius:6px;"></canvas>
      <div style="font-size:12px;color:#9eb0df;">Yellow Dot = You · Cyan Dots = Town NPCs · Red Dots = Active Bosses · Colored Pixels = Surface Terrain</div>
    `;
    this.card.querySelector('#map-close')?.addEventListener('click', () => this.close());

    const canvas = this.card.querySelector('#world-map-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const px = this.engine.player.position.x;
    const pz = this.engine.player.position.z;
    const scale = 2.6;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, cw, ch);

    for (const key of this.engine.world.exploredChunks) {
      const col = this.engine.world.columns.get(key);
      if (!col) continue;
      const baseX = col.cx * CHUNK_SIZE;
      const baseZ = col.cz * CHUNK_SIZE;
      const sx = cw * 0.5 + (baseX - px) * scale;
      const sz = ch * 0.5 + (baseZ - pz) * scale;
      if (sx < -45 || sx > cw + 45 || sz < -45 || sz > ch + 45) continue;

      for (let lx = 0; lx < CHUNK_SIZE; lx += 2) {
        for (let lz = 0; lz < CHUNK_SIZE; lz += 2) {
          let topBlock = 0;
          for (let y = 230; y >= 20; y -= 2) {
            const b = col.blocks[y * 256 + lz * 16 + lx];
            if (b !== 0) {
              topBlock = b;
              break;
            }
          }
          if (topBlock !== 0) {
            ctx.fillStyle = getBlockDef(topBlock).mapColor;
            ctx.fillRect(sx + lx * scale, sz + lz * scale, scale * 2 + 0.5, scale * 2 + 0.5);
          }
        }
      }
    }

    ctx.fillStyle = '#5be0ff';
    for (const npc of this.engine.entities.npcs) {
      const nx = cw * 0.5 + (npc.position.x - px) * scale;
      const nz = ch * 0.5 + (npc.position.z - pz) * scale;
      ctx.beginPath();
      ctx.arc(nx, nz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ff3b5c';
    for (const b of this.engine.entities.bosses) {
      const bx = cw * 0.5 + (b.position.x - px) * scale;
      const bz = ch * 0.5 + (b.position.z - pz) * scale;
      ctx.beginPath();
      ctx.arc(bx, bz, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#ffd740';
    ctx.beginPath();
    ctx.arc(cw * 0.5, ch * 0.5, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderBestiary(): void {
    const kills = this.engine.world.meta.bestiaryKills;
    const defeatedBosses = this.engine.world.meta.defeatedBosses;
    const q = this.bestiaryQuery.trim().toLowerCase();

    const filteredEnemies = ENEMIES.filter((e) => !q || e.name.toLowerCase().includes(q) || e.biomes.some((b) => b.includes(q)));
    const filteredBosses = BOSSES.filter((b) => !q || b.name.toLowerCase().includes(q));

    this.card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h3 style="margin:0;color:#ffd740;">Bestiary (${ENEMIES.length} Enemies · ${BOSSES.length} Bosses)</h3>
        <input class="t-input" id="best-search" placeholder="Search enemy, boss, or biome..." value="${this.bestiaryQuery}" style="width:240px;" />
        <button class="t-btn t-btn-danger" id="best-close">Close [B]</button>
      </div>
      <div class="t-scroll" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;max-height:70vh;">
        ${filteredBosses
          .map(
            (b) => `
          <div class="t-panel" style="padding:8px;border-color:${defeatedBosses.includes(b.id) ? '#ffd740' : '#4d67b8'};">
            <div style="font-weight:700;color:#ffd740;">[BOSS #${b.progressionOrder}] ${b.name} ${defeatedBosses.includes(b.id) ? '✓' : ''}</div>
            <div style="font-size:11px;color:#9eb0df;">${b.title} · ${b.isHardmode ? 'HARDMODE' : 'PRE-HARDMODE'}</div>
            <div style="font-size:11px;margin-top:4px;">HP: ${b.maxHp} · DMG: ${b.damage} · DEF: ${b.defense}</div>
          </div>`
          )
          .join('')}
        ${filteredEnemies
          .map(
            (e) => `
          <div class="t-panel" style="padding:8px;">
            <div style="font-weight:700;color:${e.colorPrimary};">${e.name} <span style="float:right;color:#9eb0df;">Kills: ${kills[e.id] ?? 0}</span></div>
            <div style="font-size:11px;color:#9eb0df;">Biomes: ${e.biomes.map((b) => BIOMES[b]?.name ?? b).slice(0, 3).join(', ')}</div>
            <div style="font-size:11px;margin-top:4px;">HP: ${e.maxHp} · DMG: ${e.damage} · DEF: ${e.defense}</div>
          </div>`
          )
          .join('')}
      </div>
    `;

    this.card.querySelector('#best-close')?.addEventListener('click', () => this.close());
    const search = this.card.querySelector('#best-search') as HTMLInputElement;
    search?.addEventListener('input', () => {
      this.bestiaryQuery = search.value;
      this.renderBestiary();
    });
  }

  private renderJourney(): void {
    const jp = this.engine.journeyPowers;
    const q = this.journeyQuery.trim().toLowerCase();
    const dupItems = ALL_ITEMS.filter((it) => {
      const researched = this.engine.char.researchedItems[it.id] ?? 0;
      const unlocked = researched > 0 || it.id === 'wood' || it.id === 'torch';
      if (!unlocked) return false;
      return !q || it.name.toLowerCase().includes(q);
    }).slice(0, 60);

    this.card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;color:#ffd740;">Journey Mode Powers</h3>
        <button class="t-btn t-btn-danger" id="jour-close">Close [J]</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="t-btn ${jp.godmode ? 't-btn-gold' : ''}" id="jp-god">Godmode: ${jp.godmode ? 'ON' : 'OFF'}</button>
        <button class="t-btn ${jp.timeFrozen ? 't-btn-gold' : ''}" id="jp-freeze">Freeze Time: ${jp.timeFrozen ? 'ON' : 'OFF'}</button>
        <button class="t-btn ${jp.placementRangeBoost ? 't-btn-gold' : ''}" id="jp-reach">Reach +5: ${jp.placementRangeBoost ? 'ON' : 'OFF'}</button>
        <button class="t-btn" id="jp-dawn">Set Dawn</button>
        <button class="t-btn" id="jp-dusk">Set Night</button>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;">
        <label>Time Rate: <b>${jp.timeRate}x</b> <input type="range" id="jp-tr" min="1" max="24" value="${jp.timeRate}" /></label>
        <label>Spawn Rate: <b>${jp.spawnRateMult}x</b> <input type="range" id="jp-sr" min="0" max="10" step="0.5" value="${jp.spawnRateMult}" /></label>
        <label>Weather:
          <select class="t-select" id="jp-wx">
            <option value="none" ${jp.weatherLocked === 'none' ? 'selected' : ''}>Natural</option>
            <option value="clear" ${jp.weatherLocked === 'clear' ? 'selected' : ''}>Lock Clear</option>
            <option value="rain" ${jp.weatherLocked === 'rain' ? 'selected' : ''}>Lock Rain</option>
            <option value="storm" ${jp.weatherLocked === 'storm' ? 'selected' : ''}>Lock Storm</option>
          </select>
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <b style="color:#ffd740;">Duplication Menu:</b>
        <input class="t-input" id="jp-search" placeholder="Search researched items..." value="${this.journeyQuery}" style="flex:1;" />
      </div>
      <div class="t-scroll" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;max-height:46vh;">
        ${dupItems
          .map(
            (it) => `
          <button class="t-btn" data-dup="${it.id}" style="display:flex;align-items:center;gap:6px;padding:5px;text-align:left;font-size:11px;">
            <img src="${getIconUrl(it.id)}" style="width:24px;height:24px;image-rendering:pixelated;" />
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it.name}</span>
          </button>`
          )
          .join('')}
      </div>
    `;

    this.card.querySelector('#jour-close')?.addEventListener('click', () => this.close());
    this.card.querySelector('#jp-god')?.addEventListener('click', () => { jp.godmode = !jp.godmode; this.renderJourney(); });
    this.card.querySelector('#jp-freeze')?.addEventListener('click', () => { jp.timeFrozen = !jp.timeFrozen; this.renderJourney(); });
    this.card.querySelector('#jp-reach')?.addEventListener('click', () => { jp.placementRangeBoost = !jp.placementRangeBoost; this.renderJourney(); });
    this.card.querySelector('#jp-dawn')?.addEventListener('click', () => { this.engine.world.meta.timeOfDay = 300; });
    this.card.querySelector('#jp-dusk')?.addEventListener('click', () => { this.engine.world.meta.timeOfDay = 1200; });
    this.card.querySelector('#jp-tr')?.addEventListener('input', (e) => { jp.timeRate = Number((e.target as HTMLInputElement).value); this.renderJourney(); });
    this.card.querySelector('#jp-sr')?.addEventListener('input', (e) => { jp.spawnRateMult = Number((e.target as HTMLInputElement).value); this.renderJourney(); });
    this.card.querySelector('#jp-wx')?.addEventListener('change', (e) => { jp.weatherLocked = (e.target as HTMLSelectElement).value as any; });
    const search = this.card.querySelector('#jp-search') as HTMLInputElement;
    search?.addEventListener('input', () => { this.journeyQuery = search.value; this.renderJourney(); });
    this.card.querySelectorAll('[data-dup]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.dup!;
        const max = getItemDef(id)?.maxStack ?? 1;
        InventorySystem.addItem(this.engine.char, id, Math.min(99, max));
        this.engine.audio.playSfx('pickup');
      });
    });
  }

  private renderPause(): void {
    const s = { ...this.engine.settings };

    this.card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;color:#ffd740;">Game Menu & Settings</h3>
        <button class="t-btn t-btn-gold" id="pause-resume">Resume Game</button>
      </div>
      <div class="t-scroll" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;max-height:68vh;">
        <div class="t-panel" style="padding:10px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
          <b style="color:#ffd740;">Graphics & Camera</b>
          <label>Preset:
            <select class="t-select" id="set-preset">
              <option value="low" ${s.graphicsPreset === 'low' ? 'selected' : ''}>Low (High FPS)</option>
              <option value="medium" ${s.graphicsPreset === 'medium' ? 'selected' : ''}>Medium (Balanced)</option>
              <option value="high" ${s.graphicsPreset === 'high' ? 'selected' : ''}>High (Full Shadows & AO)</option>
              <option value="custom" ${s.graphicsPreset === 'custom' ? 'selected' : ''}>Custom</option>
            </select>
          </label>
          <label>Render Distance: <b>${s.renderDistance} chunks</b> <input type="range" id="set-rd" min="2" max="8" value="${s.renderDistance}" /></label>
          <label>Field of View: <b>${s.fov}°</b> <input type="range" id="set-fov" min="60" max="105" value="${s.fov}" /></label>
          <label>Sensitivity: <b>${s.cameraSensitivity.toFixed(1)}</b> <input type="range" id="set-sens" min="0.3" max="2.5" step="0.1" value="${s.cameraSensitivity}" /></label>
          <label><input type="checkbox" id="set-shadows" ${s.shadows ? 'checked' : ''} /> Dynamic Shadows</label>
          <label><input type="checkbox" id="set-ao" ${s.ambientOcclusion ? 'checked' : ''} /> Voxel Ambient Occlusion</label>
          <label><input type="checkbox" id="set-autojump" ${s.autoJump ? 'checked' : ''} /> Auto-Step / Auto-Jump</label>
          <label><input type="checkbox" id="set-inverty" ${s.invertY ? 'checked' : ''} /> Invert Camera Y</label>
          <label>Mobile Touch Controls:
            <select class="t-select" id="set-mobile">
              <option value="auto" ${s.touchControlsMode === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="on" ${s.touchControlsMode === 'on' ? 'selected' : ''}>Always On</option>
              <option value="off" ${s.touchControlsMode === 'off' ? 'selected' : ''}>Off</option>
            </select>
          </label>
        </div>
        <div class="t-panel" style="padding:10px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
          <b style="color:#ffd740;">Audio & Controls</b>
          <label>Master Volume: <b>${Math.round(s.masterVolume * 100)}%</b> <input type="range" id="set-mv" min="0" max="1" step="0.05" value="${s.masterVolume}" /></label>
          <label>Music Volume: <b>${Math.round(s.musicVolume * 100)}%</b> <input type="range" id="set-muv" min="0" max="1" step="0.05" value="${s.musicVolume}" /></label>
          <label>SFX Volume: <b>${Math.round(s.sfxVolume * 100)}%</b> <input type="range" id="set-sv" min="0" max="1" step="0.05" value="${s.sfxVolume}" /></label>
          <div style="background:rgba(12,18,38,0.65);padding:8px;border-radius:5px;line-height:1.5;color:#cbd7fa;">
            <b>Controls:</b><br/>
            WASD = Move · Space = Jump/Wings · Shift / Double-Tap = Dash<br/>
            Left Click = Attack / Mine · Right Click = Place / Interact<br/>
            G = Grappling Hook · R = Mount · V = 1st/3rd Person<br/>
            H = Quick Heal · N = Quick Mana · 1-0 = Hotbar<br/>
            E = Bag/Crafting · M = Map · B = Bestiary · J = Journey
          </div>
          <div style="display:flex;gap:8px;margin-top:auto;flex-wrap:wrap;">
            <button class="t-btn" id="btn-save-now">Save World Now</button>
            <button class="t-btn t-btn-danger" id="btn-save-exit">Save & Exit to Title</button>
          </div>
        </div>
      </div>
    `;

    const applyUpdate = (patch: Partial<GameSettings>) => {
      const updated = { ...this.engine.settings, ...patch };
      this.engine.applySettings(updated);
      this.engine.saveManager.saveSettings(updated);
    };

    this.card.querySelector('#pause-resume')?.addEventListener('click', () => this.close());
    this.card.querySelector('#set-preset')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value as GameSettings['graphicsPreset'];
      if (val === 'low') applyUpdate({ graphicsPreset: 'low', renderDistance: 3, shadows: false, ambientOcclusion: false, particleDensity: 0.4 });
      else if (val === 'medium') applyUpdate({ graphicsPreset: 'medium', renderDistance: 4, shadows: true, ambientOcclusion: true, particleDensity: 0.8 });
      else if (val === 'high') applyUpdate({ graphicsPreset: 'high', renderDistance: 6, shadows: true, ambientOcclusion: true, particleDensity: 1.0 });
      else applyUpdate({ graphicsPreset: 'custom' });
      this.renderPause();
    });
    this.card.querySelector('#set-rd')?.addEventListener('input', (e) => { applyUpdate({ graphicsPreset: 'custom', renderDistance: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });
    this.card.querySelector('#set-fov')?.addEventListener('input', (e) => { applyUpdate({ fov: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });
    this.card.querySelector('#set-sens')?.addEventListener('input', (e) => { applyUpdate({ cameraSensitivity: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });
    this.card.querySelector('#set-shadows')?.addEventListener('change', (e) => { applyUpdate({ graphicsPreset: 'custom', shadows: (e.target as HTMLInputElement).checked }); });
    this.card.querySelector('#set-ao')?.addEventListener('change', (e) => { applyUpdate({ graphicsPreset: 'custom', ambientOcclusion: (e.target as HTMLInputElement).checked }); });
    this.card.querySelector('#set-autojump')?.addEventListener('change', (e) => { applyUpdate({ autoJump: (e.target as HTMLInputElement).checked }); });
    this.card.querySelector('#set-inverty')?.addEventListener('change', (e) => { applyUpdate({ invertY: (e.target as HTMLInputElement).checked }); });
    this.card.querySelector('#set-mobile')?.addEventListener('change', (e) => { applyUpdate({ touchControlsMode: (e.target as HTMLSelectElement).value as GameSettings['touchControlsMode'] }); });
    this.card.querySelector('#set-mv')?.addEventListener('input', (e) => { applyUpdate({ masterVolume: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });
    this.card.querySelector('#set-muv')?.addEventListener('input', (e) => { applyUpdate({ musicVolume: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });
    this.card.querySelector('#set-sv')?.addEventListener('input', (e) => { applyUpdate({ sfxVolume: Number((e.target as HTMLInputElement).value) }); this.renderPause(); });

    this.card.querySelector('#btn-save-now')?.addEventListener('click', async () => {
      await this.engine.saveProgress();
      this.engine.notify('World & Character saved!', '#69f0ae');
    });
    this.card.querySelector('#btn-save-exit')?.addEventListener('click', async () => {
      await this.engine.saveProgress();
      this.close();
      this.onExitToTitle?.();
    });
  }
}
