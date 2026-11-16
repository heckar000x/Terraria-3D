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

  private lifeLineEl: HTMLDivElement;
  private heartsGridEl: HTMLDivElement;
  private manaLineEl: HTMLDivElement;
  private starsGridEl: HTMLDivElement;
  private compactBarsEl: HTMLDivElement;
  private compactHpFill: HTMLDivElement;
  private compactMpFill: HTMLDivElement;
  private breathLineEl: HTMLDivElement;
  private buffsEl: HTMLDivElement;
  private infoBoxEl: HTMLDivElement;

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
  private lastVitalsKey = '';
  private lastBuffsKey = '';
  private lastInfoKey = '';
  private lastTargetKey = '';
  private lastFloatKey = '';
  private lastBossKey = '';
  private lastEventKey = '';
  private lastNotifKey = '';
  private lastNpcName = '';
  private lastDeathKey = '';

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
    this.hotbarRow = document.createElement('div');
    this.hotbarRow.className = 'hotbar-row hud-interactive';
    this.heldItemLabel = document.createElement('div');
    this.heldItemLabel.className = 'held-item-label';
    hotbarWrap.append(this.hotbarRow, this.heldItemLabel);
    this.root.appendChild(hotbarWrap);

    // Top-Right Vitals & Persistent Quick Toolbar (Zero DOM churn!)
    this.vitalsEl = document.createElement('div');
    this.vitalsEl.className = 'hud-vitals';

    this.lifeLineEl = document.createElement('div');
    this.lifeLineEl.className = 'vitals-line';

    this.heartsGridEl = document.createElement('div');
    this.heartsGridEl.className = 'hearts-grid';

    this.manaLineEl = document.createElement('div');
    this.manaLineEl.className = 'vitals-line';
    this.manaLineEl.style.color = '#80d8ff';

    this.starsGridEl = document.createElement('div');
    this.starsGridEl.className = 'mana-grid';

    // Compact mobile progress bars (shown only on compact viewports via CSS)
    this.compactBarsEl = document.createElement('div');
    this.compactBarsEl.className = 'vital-bars-compact';
    const hpTrack = document.createElement('div');
    hpTrack.className = 'vital-bar-track';
    this.compactHpFill = document.createElement('div');
    this.compactHpFill.className = 'vital-bar-fill-hp';
    hpTrack.appendChild(this.compactHpFill);

    const mpTrack = document.createElement('div');
    mpTrack.className = 'vital-bar-track';
    this.compactMpFill = document.createElement('div');
    this.compactMpFill.className = 'vital-bar-fill-mp';
    mpTrack.appendChild(this.compactMpFill);
    this.compactBarsEl.append(hpTrack, mpTrack);

    this.breathLineEl = document.createElement('div');
    this.breathLineEl.className = 'vitals-line';
    this.breathLineEl.style.cssText = 'color:#80deea;display:none;';

    this.buffsEl = document.createElement('div');
    this.buffsEl.className = 'hud-buffs';

    this.infoBoxEl = document.createElement('div');
    this.infoBoxEl.className = 't-panel hud-info-box';

    const toolbar = document.createElement('div');
    toolbar.className = 'hud-toolbar hud-interactive';
    const mkBtn = (label: string, onClick: () => void, cls = '') => {
      const btn = document.createElement('button');
      btn.className = `t-btn hud-tool-btn ${cls}`.trim();
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    };
    toolbar.append(
      mkBtn('Bag [E]', () => this.cb.onOpenInventory()),
      mkBtn('Map [M]', () => this.cb.onToggleMap()),
      mkBtn('Bestiary [B]', () => this.cb.onToggleBestiary())
    );
    if (this.char.difficulty === 'journey') {
      toolbar.appendChild(mkBtn('Journey [J]', () => this.cb.onToggleJourney(), 't-btn-gold'));
    }
    toolbar.append(
      mkBtn('View [V]', () => this.cb.onToggleCamera()),
      mkBtn('Full', () => this.toggleFullscreen()),
      mkBtn('Menu', () => this.cb.onTogglePause())
    );

    this.vitalsEl.append(
      this.lifeLineEl,
      this.heartsGridEl,
      this.manaLineEl,
      this.starsGridEl,
      this.compactBarsEl,
      this.breathLineEl,
      this.buffsEl,
      this.infoBoxEl,
      toolbar
    );
    this.root.appendChild(this.vitalsEl);

    // Center Target Block Mining Indicator
    this.targetLabelEl = document.createElement('div');
    this.targetLabelEl.className = 'target-indicator';
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
    this.eventBarWrap.className = 't-panel event-bar-wrap';
    this.eventBarWrap.style.display = 'none';
    this.root.appendChild(this.eventBarWrap);

    // Boss Bar
    this.bossBarWrap = document.createElement('div');
    this.bossBarWrap.className = 't-panel boss-bar-wrap';
    this.bossBarWrap.style.display = 'none';
    this.root.appendChild(this.bossBarWrap);

    // NPC Prompt
    this.npcPromptBtn = document.createElement('button');
    this.npcPromptBtn.className = 't-btn t-btn-gold hud-interactive npc-prompt-btn';
    this.npcPromptBtn.style.display = 'none';
    this.npcPromptBtn.addEventListener('click', () => this.cb.onTalkNpc());
    this.root.appendChild(this.npcPromptBtn);

    // Death Overlay
    this.deathOverlay = document.createElement('div');
    this.deathOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(90,8,12,0.55);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:55;pointer-events:auto;';
    this.root.appendChild(this.deathOverlay);
  }

  private toggleFullscreen(): void {
    try {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.()?.then?.(() => {
          const ori = (screen as unknown as { orientation?: { lock?: (m: string) => Promise<void> } }).orientation;
          ori?.lock?.('landscape').catch(() => {});
        })?.catch?.(() => {});
      } else {
        void document.exitFullscreen?.()?.catch?.(() => {});
      }
    } catch {
      // Ignore fullscreen denial on restricted browsers
    }
  }

  public update(hud: HudSnapshot): void {
    // 1. Rebuild hotbar only when slot contents or selection change
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
      this.heldItemLabel.textContent = def ? def.name : 'Empty Hand (Chop Wood / Punch)';
    }

    // 2. Vitals (only update when HP/Mana/Defense/Breath change)
    const vKey = `${hud.hp}/${hud.maxHp}/${hud.mana}/${hud.maxMana}/${hud.defense}/${hud.breath}/${hud.maxBreath}`;
    if (vKey !== this.lastVitalsKey) {
      this.lastVitalsKey = vKey;
      this.lifeLineEl.textContent = `Life: ${hud.hp}/${hud.maxHp} · Def: ${hud.defense}`;
      this.manaLineEl.textContent = `Mana: ${hud.mana}/${hud.maxMana}`;

      this.compactHpFill.style.width = `${Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100))}%`;
      this.compactMpFill.style.width = `${Math.max(0, Math.min(100, (hud.mana / Math.max(1, hud.maxMana)) * 100))}%`;

      const totalHearts = Math.ceil(hud.maxHp / 20);
      const fullHearts = Math.floor(hud.hp / 20);
      const hasHalfHeart = hud.hp % 20 >= 10;
      let heartsHtml = '';
      for (let i = 0; i < Math.min(20, totalHearts); i++) {
        const isGoldHeart = i >= 20 - Math.max(0, totalHearts - 20) && hud.maxHp > 400;
        const color = i < fullHearts ? (isGoldHeart ? '#ffd740' : '#ff3d57') : i === fullHearts && hasHalfHeart ? '#ff8a80' : '#3a2230';
        heartsHtml += `<span class="heart-icon" style="color:${color}">♥</span>`;
      }
      this.heartsGridEl.innerHTML = heartsHtml;

      const totalStars = Math.ceil(hud.maxMana / 20);
      let starsHtml = '';
      for (let i = 0; i < totalStars; i++) {
        const filled = (i + 1) * 20 <= hud.mana + 10;
        starsHtml += `<span class="star-icon" style="color:${filled ? '#40c4ff' : '#23324f'}">★</span>`;
      }
      this.starsGridEl.innerHTML = starsHtml;

      if (hud.breath < hud.maxBreath) {
        this.breathLineEl.style.display = 'block';
        this.breathLineEl.textContent = `Breath: ${Math.ceil((hud.breath / hud.maxBreath) * 100)}%`;
      } else {
        this.breathLineEl.style.display = 'none';
      }
    }

    // 3. Buffs
    const bKey = hud.activeBuffs.map((b) => `${b.id}:${Math.ceil(b.remaining)}`).join('|');
    if (bKey !== this.lastBuffsKey) {
      this.lastBuffsKey = bKey;
      this.buffsEl.innerHTML = hud.activeBuffs
        .map(
          (b) =>
            `<span style="background:rgba(20,30,64,0.85);border:1px solid #5be0ff;border-radius:4px;padding:1px 5px;font-size:10px;">${b.id.replace(/_/g, ' ')} ${Math.ceil(b.remaining)}s</span>`
        )
        .join('');
    }

    // 4. Info Strip
    const iKey = `${hud.biomeName}|${hud.isHardmode}|${hud.dayCount}|${hud.clockText}|${hud.weather}|${hud.coords.join(',')}|${hud.fps}`;
    if (iKey !== this.lastInfoKey) {
      this.lastInfoKey = iKey;
      this.infoBoxEl.innerHTML = `
        <div><b>${hud.biomeName}</b> ${hud.isHardmode ? '<span style="color:#ff80ff">[HM]</span>' : ''} · Day ${hud.dayCount} · ${hud.clockText}</div>
        <div style="color:#9eb0df;">${hud.weather} · XYZ ${hud.coords.join(', ')} · <b style="color:${hud.fps >= 55 ? '#69f0ae' : hud.fps >= 35 ? '#ffd740' : '#ff6b81'}">${hud.fps} FPS</b></div>
      `;
    }

    // 5. Target Block + Mining bar
    const pct = Math.min(100, Math.round(hud.targetMiningProgress * 100));
    const tKey = `${hud.targetLabel ?? ''}|${pct}`;
    if (tKey !== this.lastTargetKey) {
      this.lastTargetKey = tKey;
      if (hud.targetLabel) {
        this.targetLabelEl.innerHTML = `
          <div style="color:#fff;font-weight:600;">${hud.targetLabel}</div>
          ${pct > 0 ? `<div style="width:90px;height:5px;background:#111;border:1px solid #ffd740;margin:3px auto 0;"><div style="width:${pct}%;height:100%;background:#ffd740;"></div></div>` : ''}
        `;
      } else {
        this.targetLabelEl.innerHTML = '';
      }
    }

    // 6. Floating Numbers
    const fKey = hud.floatingNumbers.length === 0 ? '' : hud.floatingNumbers.map((f) => `${f.text}:${Math.round(f.x)}:${Math.round(f.y)}:${f.alpha.toFixed(1)}`).join('|');
    if (fKey !== this.lastFloatKey) {
      this.lastFloatKey = fKey;
      this.floatingLayer.innerHTML = hud.floatingNumbers
        .map(
          (fn) =>
            `<div class="floating-dmg" style="left:${fn.x}px;top:${fn.y}px;color:${fn.color};opacity:${fn.alpha};font-size:${fn.crit ? '19px' : '15px'};">${fn.text}</div>`
        )
        .join('');
    }

    // 7. Boss Bar
    const bossKey = hud.bossHud ? `${hud.bossHud.id}:${hud.bossHud.hp}/${hud.bossHud.maxHp}` : '';
    if (bossKey !== this.lastBossKey) {
      this.lastBossKey = bossKey;
      if (hud.bossHud) {
        const bpct = Math.max(0, Math.min(100, (hud.bossHud.hp / hud.bossHud.maxHp) * 100));
        this.bossBarWrap.style.display = 'block';
        this.bossBarWrap.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:#ffd740;">${hud.bossHud.name} — <span style="color:#d0dcf8;font-weight:400;">${hud.bossHud.title}</span> (${hud.bossHud.hp}/${hud.bossHud.maxHp})</div>
          <div class="boss-bar-track"><div class="boss-bar-fill" style="width:${bpct}%"></div></div>
        `;
      } else {
        this.bossBarWrap.style.display = 'none';
      }
    }

    // 8. Active Event Bar
    const evKey = hud.activeEventName ? `${hud.activeEventName}:${hud.eventProgress}/${hud.eventTarget}` : '';
    if (evKey !== this.lastEventKey) {
      this.lastEventKey = evKey;
      if (hud.activeEventName) {
        this.eventBarWrap.style.display = 'block';
        const epct = hud.eventTarget > 0 ? Math.min(100, Math.round((hud.eventProgress / hud.eventTarget) * 100)) : 100;
        this.eventBarWrap.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:#ff80ab;">${hud.activeEventName}</div>
          <div style="font-size:10px;margin-top:2px;">Progress: ${epct}%</div>
        `;
      } else {
        this.eventBarWrap.style.display = 'none';
      }
    }

    // 9. Notifications
    const nKey = hud.notifications.map((n) => n.id).join(',');
    if (nKey !== this.lastNotifKey) {
      this.lastNotifKey = nKey;
      this.notifFeed.innerHTML = hud.notifications
        .map((n) => `<div class="notif-line" style="color:${n.color}">${n.text}</div>`)
        .join('');
    }

    // 10. NPC Prompt
    const npcName = hud.nearbyNpc?.name ?? '';
    if (npcName !== this.lastNpcName) {
      this.lastNpcName = npcName;
      if (npcName) {
        this.npcPromptBtn.style.display = 'block';
        this.npcPromptBtn.textContent = `Talk to ${npcName}`;
      } else {
        this.npcPromptBtn.style.display = 'none';
      }
    }

    // 11. Death / Respawn Banner
    const dKey = hud.isDead ? `1|${hud.respawnTimer}|${hud.deathMessage}` : '0';
    if (dKey !== this.lastDeathKey) {
      this.lastDeathKey = dKey;
      if (hud.isDead) {
        this.deathOverlay.style.display = 'flex';
        this.deathOverlay.innerHTML = `
          <div style="font-size:30px;font-weight:900;color:#ff4c5b;text-shadow:0 3px 10px #000;">YOU WERE SLAIN</div>
          <div style="font-size:15px;color:#ffd5d5;">${hud.deathMessage}</div>
          <div style="font-size:14px;color:#ffe082;">Respawning in ${hud.respawnTimer}s...</div>
          <button class="t-btn t-btn-gold" id="btn-respawn-now">Respawn Now</button>
        `;
        this.deathOverlay.querySelector('#btn-respawn-now')?.addEventListener('click', () => this.cb.onRespawnNow());
      } else {
        this.deathOverlay.style.display = 'none';
      }
    }
  }
}
