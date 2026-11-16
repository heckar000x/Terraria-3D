import { getItemDef } from '@/data/items';
import { HudSnapshot } from '@/engine/GameEngine';
import { CharacterSave } from '@/types/game';
import { createItemSlotEl } from './UiHelpers';

export interface HudCallbacks {
  onSelectHotbar: (idx: number) => void;
  onOpenInventory: () => void;
  onToggleMap: () => void;
  onToggleBestiary: () => void;
  onToggleJourney: () => void;
  onToggleCamera: () => void;
  onTogglePause: () => void;
  onTalkNpc: () => void;
  onRespawnNow: () => void;
}

export class HudOverlay {
  public readonly root: HTMLDivElement;
  private hotbarRow: HTMLDivElement;
  private heldItemLabel: HTMLDivElement;
  private vitalsEl: HTMLDivElement;
  private bossBarWrap: HTMLDivElement;
  private eventBarWrap: HTMLDivElement;
  private notifFeed: HTMLDivElement;
  private targetLabelEl: HTMLDivElement;
  private floatingLayer: HTMLDivElement;
  private npcPromptBtn: HTMLButtonElement;
  private deathOverlay: HTMLDivElement;
  private cb: HudCallbacks;
  private char: CharacterSave;

  private lastHotbarKey = '';

  constructor(char: CharacterSave, cb: HudCallbacks) {
    this.char = char;
    this.cb = cb;

    this.root = document.createElement('div');
    this.root.className = 'hud-layer';

    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    this.root.appendChild(crosshair);

    // Top-Left Hotbar
    const hotbarWrap = document.createElement('div');
    hotbarWrap.className = 'hud-hotbar';
    this.heldItemLabel = document.createElement('div');
    this.heldItemLabel.style.cssText = 'font-size:13px;font-weight:700;text-shadow:1px 1px 3px #000;color:#ffe082;padding-left:2px;';
    this.hotbarRow = document.createElement('div');
    this.hotbarRow.className = 'hotbar-row hud-interactive';
    hotbarWrap.append(this.heldItemLabel, this.hotbarRow);
    this.root.appendChild(hotbarWrap);

    // Top-Right Vitals & Toolbar
    this.vitalsEl = document.createElement('div');
    this.vitalsEl.className = 'hud-vitals';
    this.root.appendChild(this.vitalsEl);

    // Center Target Block Mining Indicator
    this.targetLabelEl = document.createElement('div');
    this.targetLabelEl.style.cssText = 'position:fixed;left:50%;top:55%;transform:translateX(-50%);text-align:center;pointer-events:none;font-size:12px;text-shadow:1px 1px 2px #000;';
    this.root.appendChild(this.targetLabelEl);

    // Floating Numbers Layer
    this.floatingLayer = document.createElement('div');
    this.floatingLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
    this.root.appendChild(this.floatingLayer);

    // Notifications Feed
    this.notifFeed = document.createElement('div');
    this.notifFeed.className = 'notif-feed';
    this.root.appendChild(this.notifFeed);

    // Event Progress Bar
    this.eventBarWrap = document.createElement('div');
    this.eventBarWrap.className = 't-panel';
    this.eventBarWrap.style.cssText = 'position:absolute;bottom:140px;right:14px;padding:6px 10px;width:230px;display:none;';
    this.root.appendChild(this.eventBarWrap);

    // Boss Bar
    this.bossBarWrap = document.createElement('div');
    this.bossBarWrap.className = 't-panel boss-bar-wrap';
    this.bossBarWrap.style.display = 'none';
    this.root.appendChild(this.bossBarWrap);

    // NPC Prompt
    this.npcPromptBtn = document.createElement('button');
    this.npcPromptBtn.className = 't-btn t-btn-gold hud-interactive';
    this.npcPromptBtn.style.cssText = 'position:absolute;bottom:195px;left:50%;transform:translateX(-50%);display:none;';
    this.npcPromptBtn.addEventListener('click', () => this.cb.onTalkNpc());
    this.root.appendChild(this.npcPromptBtn);

    // Death Overlay
    this.deathOverlay = document.createElement('div');
    this.deathOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(90,8,12,0.52);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:55;pointer-events:auto;';
    this.root.appendChild(this.deathOverlay);
  }

  public update(hud: HudSnapshot): void {
    // 1. Rebuild hotbar only when slot contents or selection change!
    const keyParts: string[] = [String(hud.selectedHotbar)];
    for (let i = 0; i < 10; i++) {
      const s = this.char.inventory[i];
      keyParts.push(s ? `${s.itemId}:${s.count}:${s.modifier ?? ''}` : '_');
    }
    const hotbarKey = keyParts.join('|');
    if (hotbarKey !== this.lastHotbarKey) {
      this.lastHotbarKey = hotbarKey;
      this.hotbarRow.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const s = this.char.inventory[i];
        const el = createItemSlotEl(s, {
          indexLabel: i === 9 ? '0' : String(i + 1),
          active: i === hud.selectedHotbar,
          onClick: () => this.cb.onSelectHotbar(i),
        });
        this.hotbarRow.appendChild(el);
      }
      const held = this.char.inventory[hud.selectedHotbar];
      const def = held ? getItemDef(held.itemId) : undefined;
      this.heldItemLabel.textContent = def ? def.name : 'Empty Hand';
    }

    // 2. Vitals, Hearts, Stars, Info Strip, Quick Buttons
    const totalHearts = Math.ceil(hud.maxHp / 20);
    const fullHearts = Math.floor(hud.hp / 20);
    const hasHalfHeart = hud.hp % 20 >= 10;
    let heartsHtml = '';
    for (let i = 0; i < Math.min(20, totalHearts); i++) {
      const isGoldHeart = i >= 20 - Math.max(0, totalHearts - 20) && hud.maxHp > 400;
      const color = i < fullHearts ? (isGoldHeart ? '#ffd740' : '#ff3d57') : i === fullHearts && hasHalfHeart ? '#ff8a80' : '#3a2230';
      heartsHtml += `<span class="heart-icon" style="color:${color}">♥</span>`;
    }

    const totalStars = Math.ceil(hud.maxMana / 20);
    let starsHtml = '';
    for (let i = 0; i < totalStars; i++) {
      const filled = (i + 1) * 20 <= hud.mana + 10;
      starsHtml += `<span style="font-size:15px;color:${filled ? '#40c4ff' : '#23324f'};text-shadow:0 1px 2px #000">★</span>`;
    }

    const buffsHtml = hud.activeBuffs
      .map(
        (b) =>
          `<span style="background:rgba(20,30,64,0.85);border:1px solid #5be0ff;border-radius:4px;padding:2px 6px;font-size:11px;">${b.id.replace(/_/g, ' ')} ${Math.ceil(b.remaining)}s</span>`
      )
      .join('');

    this.vitalsEl.innerHTML = `
      <div style="font-size:12px;font-weight:700;text-shadow:1px 1px 2px #000;">Life: ${hud.hp} / ${hud.maxHp} &nbsp;|&nbsp; Def: ${hud.defense}</div>
      <div class="hearts-grid">${heartsHtml}</div>
      <div style="font-size:12px;font-weight:700;text-shadow:1px 1px 2px #000;color:#80d8ff;">Mana: ${hud.mana} / ${hud.maxMana}</div>
      <div class="mana-grid">${starsHtml}</div>
      ${hud.breath < hud.maxBreath ? `<div style="font-size:12px;color:#80deea;font-weight:700;">Breath: ${Math.ceil((hud.breath / hud.maxBreath) * 100)}%</div>` : ''}
      ${buffsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;">${buffsHtml}</div>` : ''}
      <div class="t-panel" style="padding:5px 9px;font-size:11px;text-align:right;line-height:1.4;">
        <div><b>${hud.biomeName}</b> ${hud.isHardmode ? '<span style="color:#ff80ff">[HM]</span>' : ''}</div>
        <div>Day ${hud.dayCount} · ${hud.clockText} · ${hud.weather}</div>
        <div style="color:#9eb0df;">XYZ: ${hud.coords.join(', ')} · ${hud.fps} FPS</div>
      </div>
      <div class="hud-interactive" style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
        <button class="t-btn" data-act="inv" style="padding:4px 8px;font-size:11px;">Bag [E]</button>
        <button class="t-btn" data-act="map" style="padding:4px 8px;font-size:11px;">Map [M]</button>
        <button class="t-btn" data-act="best" style="padding:4px 8px;font-size:11px;">Bestiary [B]</button>
        ${this.char.difficulty === 'journey' ? `<button class="t-btn t-btn-gold" data-act="jour" style="padding:4px 8px;font-size:11px;">Journey [J]</button>` : ''}
        <button class="t-btn" data-act="cam" style="padding:4px 8px;font-size:11px;">View [V]</button>
        <button class="t-btn" data-act="esc" style="padding:4px 8px;font-size:11px;">Menu</button>
      </div>
    `;

    this.vitalsEl.querySelectorAll('button').forEach((btn) => {
      const act = (btn as HTMLButtonElement).dataset.act;
      btn.addEventListener('click', () => {
        if (act === 'inv') this.cb.onOpenInventory();
        else if (act === 'map') this.cb.onToggleMap();
        else if (act === 'best') this.cb.onToggleBestiary();
        else if (act === 'jour') this.cb.onToggleJourney();
        else if (act === 'cam') this.cb.onToggleCamera();
        else if (act === 'esc') this.cb.onTogglePause();
      });
    });

    // 3. Target Block + Mining bar
    if (hud.targetLabel) {
      const pct = Math.min(100, Math.round(hud.targetMiningProgress * 100));
      this.targetLabelEl.innerHTML = `
        <div style="color:#fff;font-weight:600;">${hud.targetLabel}</div>
        ${pct > 0 ? `<div style="width:90px;height:5px;background:#111;border:1px solid #ffd740;margin:3px auto 0;"><div style="width:${pct}%;height:100%;background:#ffd740;"></div></div>` : ''}
      `;
    } else {
      this.targetLabelEl.innerHTML = '';
    }

    // 4. Floating Numbers
    this.floatingLayer.innerHTML = hud.floatingNumbers
      .map(
        (fn) =>
          `<div class="floating-dmg" style="left:${fn.x}px;top:${fn.y}px;color:${fn.color};opacity:${fn.alpha};font-size:${fn.crit ? '19px' : '15px'};">${fn.text}</div>`
      )
      .join('');

    // 5. Boss Bar
    if (hud.bossHud) {
      const pct = Math.max(0, Math.min(100, (hud.bossHud.hp / hud.bossHud.maxHp) * 100));
      this.bossBarWrap.style.display = 'block';
      this.bossBarWrap.innerHTML = `
        <div style="font-size:13px;font-weight:700;color:#ffd740;">${hud.bossHud.name} — <span style="color:#d0dcf8;font-weight:400;">${hud.bossHud.title}</span> (${hud.bossHud.hp} / ${hud.bossHud.maxHp})</div>
        <div class="boss-bar-track"><div class="boss-bar-fill" style="width:${pct}%"></div></div>
      `;
    } else {
      this.bossBarWrap.style.display = 'none';
    }

    // 6. Active Event Bar
    if (hud.activeEventName) {
      this.eventBarWrap.style.display = 'block';
      const pct = hud.eventTarget > 0 ? Math.min(100, Math.round((hud.eventProgress / hud.eventTarget) * 100)) : 100;
      this.eventBarWrap.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:#ff80ab;">${hud.activeEventName}</div>
        <div style="font-size:11px;margin-top:2px;">Progress: ${pct}%</div>
      `;
    } else {
      this.eventBarWrap.style.display = 'none';
    }

    // 7. Notifications
    this.notifFeed.innerHTML = hud.notifications
      .map((n) => `<div class="notif-line" style="color:${n.color}">${n.text}</div>`)
      .join('');

    // 8. NPC Prompt
    if (hud.nearbyNpc) {
      this.npcPromptBtn.style.display = 'block';
      this.npcPromptBtn.textContent = `Talk to ${hud.nearbyNpc.name} (Right-Click)`;
    } else {
      this.npcPromptBtn.style.display = 'none';
    }

    // 9. Death / Respawn Banner
    if (hud.isDead) {
      this.deathOverlay.style.display = 'flex';
      this.deathOverlay.innerHTML = `
        <div style="font-size:32px;font-weight:900;color:#ff4c5b;text-shadow:0 3px 10px #000;">YOU WERE SLAIN</div>
        <div style="font-size:16px;color:#ffd5d5;">${hud.deathMessage}</div>
        <div style="font-size:15px;color:#ffe082;">Respawning in ${hud.respawnTimer}s...</div>
        <button class="t-btn t-btn-gold" id="btn-respawn-now">Respawn Now</button>
      `;
      this.deathOverlay.querySelector('#btn-respawn-now')?.addEventListener('click', () => this.cb.onRespawnNow());
    } else {
      this.deathOverlay.style.display = 'none';
    }
  }
}
