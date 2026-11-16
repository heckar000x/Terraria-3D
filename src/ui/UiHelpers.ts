import { getItemDef, getRarityColor } from '@/data/items';
import { MODIFIERS } from '@/data/modifiers';
import { GameSettings, ItemStack } from '@/types/game';
import { getItemIconDataUrl } from '@/world/TextureAtlas';

let tooltipEl: HTMLDivElement | null = null;

export function isTouchVisible(settings: GameSettings): boolean {
  if (settings.touchControlsMode === 'on') return true;
  if (settings.touchControlsMode === 'off') return false;
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

export function ensureTooltip(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 't-panel item-tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

export function hideTooltip(): void {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

export function showItemTooltip(stack: ItemStack | null, x: number, y: number, extraNote?: string): void {
  const el = ensureTooltip();
  if (!stack) {
    el.style.display = 'none';
    return;
  }
  const def = getItemDef(stack.itemId);
  if (!def) {
    el.style.display = 'none';
    return;
  }
  const mod = stack.modifier ? MODIFIERS[stack.modifier] : undefined;
  const title = mod && mod.label ? `${mod.label} ${def.name}` : def.name;
  const rarityColor = getRarityColor(def.rarity);

  const lines: string[] = [
    `<div style="font-weight:700;color:${rarityColor};font-size:13px">${title}</div>`,
  ];
  if (def.damage) lines.push(`<div style="color:#ffd54f">${def.damage} ${def.damageType ?? ''} damage</div>`);
  if (def.bonuses?.defense) lines.push(`<div style="color:#81d4fa">${def.bonuses.defense} defense</div>`);
  if (def.pickPower) lines.push(`<div>${def.pickPower}% pickaxe power</div>`);
  if (def.axePower) lines.push(`<div>${def.axePower}% axe power</div>`);
  if (def.hammerPower) lines.push(`<div>${def.hammerPower}% hammer power</div>`);
  if (def.manaCost) lines.push(`<div style="color:#4fc3f7">Uses ${def.manaCost} mana</div>`);
  if (def.healHp) lines.push(`<div style="color:#69f0ae">Restores ${def.healHp} life</div>`);
  if (def.healMana) lines.push(`<div style="color:#40c4ff">Restores ${def.healMana} mana</div>`);
  if (def.bonuses?.setBonusDescription) lines.push(`<div style="color:#a5d6a7">${def.bonuses.setBonusDescription}</div>`);
  if (def.tooltip) lines.push(`<div style="color:#b9c7ec;margin-top:3px">${def.tooltip}</div>`);
  if (mod && mod.id !== 'none') {
    if (mod.damageMult && mod.damageMult !== 1) lines.push(`<div style="color:#80cbc4">${Math.round((mod.damageMult - 1) * 100)}% damage</div>`);
    if (mod.defenseBonus) lines.push(`<div style="color:#80cbc4">+${mod.defenseBonus} defense</div>`);
  }
  if (extraNote) lines.push(`<div style="color:#ffd740;margin-top:3px">${extraNote}</div>`);

  el.innerHTML = lines.join('');
  el.style.display = 'block';
  el.style.left = `${Math.min(window.innerWidth - 270, x + 14)}px`;
  el.style.top = `${Math.min(window.innerHeight - 160, y + 14)}px`;
}

export function getIconUrl(itemId: string): string {
  const def = getItemDef(itemId);
  return def ? getItemIconDataUrl(def) : '';
}

export function createItemSlotEl(
  stack: ItemStack | null,
  options: {
    indexLabel?: string;
    active?: boolean;
    onClick?: (ev: MouseEvent) => void;
    onContextMenu?: (ev: MouseEvent) => void;
    extraTooltip?: string;
  } = {}
): HTMLDivElement {
  const slot = document.createElement('div');
  slot.className = `item-slot${options.active ? ' active' : ''}`;

  if (options.indexLabel) {
    const num = document.createElement('span');
    num.className = 'slot-num';
    num.textContent = options.indexLabel;
    slot.appendChild(num);
  }

  if (stack && stack.count > 0) {
    const img = document.createElement('img');
    img.src = getIconUrl(stack.itemId);
    img.alt = stack.itemId;
    slot.appendChild(img);

    if (stack.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'slot-count';
      cnt.textContent = String(stack.count);
      slot.appendChild(cnt);
    }
  }

  if (options.onClick) slot.addEventListener('click', options.onClick);
  if (options.onContextMenu) {
    slot.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      options.onContextMenu?.(ev);
    });
  }

  slot.addEventListener('mousemove', (ev) => showItemTooltip(stack, ev.clientX, ev.clientY, options.extraTooltip));
  slot.addEventListener('mouseleave', hideTooltip);
  return slot;
}

export function formatCoins(copper: number): string {
  const p = Math.floor(copper / 1_000_000);
  const g = Math.floor((copper % 1_000_000) / 10_000);
  const s = Math.floor((copper % 10_000) / 100);
  const c = copper % 100;
  const parts: string[] = [];
  if (p) parts.push(`${p}p`);
  if (g) parts.push(`${g}g`);
  if (s) parts.push(`${s}s`);
  if (c || parts.length === 0) parts.push(`${c}c`);
  return parts.join(' ');
}
