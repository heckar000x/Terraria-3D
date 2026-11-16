import { getItemDef, getRarityColor } from '@/data/items';
import { RECIPES, STATION_NAMES } from '@/data/recipes';
import { GameEngine } from '@/engine/GameEngine';
import { HousingSystem, HouseValidationResult } from '@/systems/HousingSystem';
import { InventorySystem } from '@/systems/InventorySystem';
import { ArmorSlot, CraftingStationId, ItemStack, RecipeDef } from '@/types/game';
import { createItemSlotEl, formatCoins, getIconUrl, hideTooltip } from './UiHelpers';

export class InventoryPanel {
  public readonly root: HTMLDivElement;
  private card: HTMLDivElement;
  private engine: GameEngine;
  private heldCursor: ItemStack | null = null;
  private trashSlot: ItemStack | null = null;
  private activeSubTab: 'craft' | 'housing' = 'craft';
  private showAllRecipes = false;
  private recipeSearch = '';
  private lastHouseCheck: HouseValidationResult | null = null;

  public onClose?: () => void;

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
    return this.root.style.display !== 'none';
  }

  public open(tab?: 'craft' | 'housing'): void {
    if (tab) this.activeSubTab = tab;
    this.engine.paused = true;
    this.root.style.display = 'flex';
    this.render();
  }

  public close(): void {
    hideTooltip();
    if (this.heldCursor) {
      InventorySystem.addItem(this.engine.char, this.heldCursor.itemId, this.heldCursor.count, this.heldCursor.modifier);
      this.heldCursor = null;
    }
    this.engine.openChest = null;
    this.engine.paused = false;
    this.root.style.display = 'none';
    this.onClose?.();
  }

  private swapWithCursor(get: () => ItemStack | null, set: (s: ItemStack | null) => void, filterFn?: (s: ItemStack) => boolean): void {
    const cur = get();
    if (!this.heldCursor) {
      if (cur) {
        set(null);
        this.heldCursor = cur;
      }
    } else {
      if (filterFn && !filterFn(this.heldCursor)) return;
      if (cur && cur.itemId === this.heldCursor.itemId && (!cur.modifier || cur.modifier === 'none') && (!this.heldCursor.modifier || this.heldCursor.modifier === 'none')) {
        const max = getItemDef(cur.itemId)?.maxStack ?? 9999;
        const space = max - cur.count;
        const move = Math.min(space, this.heldCursor.count);
        if (move > 0) {
          cur.count += move;
          this.heldCursor.count -= move;
          if (this.heldCursor.count <= 0) this.heldCursor = null;
          this.render();
          return;
        }
      }
      set(this.heldCursor);
      this.heldCursor = cur;
    }
    this.render();
  }

  private quickUseOrEquip(slotIdx: number): void {
    const s = this.engine.char.inventory[slotIdx];
    if (!s) return;
    const def = getItemDef(s.itemId);
    if (!def) return;

    if (def.armorSlot) {
      const armorIdx = def.armorSlot === 'head' ? 0 : def.armorSlot === 'body' ? 1 : 2;
      const prev = this.engine.char.armor[armorIdx];
      this.engine.char.armor[armorIdx] = s;
      this.engine.char.inventory[slotIdx] = prev;
      this.engine.audio.playSfx('ui_click');
      this.render();
      return;
    }
    if (def.category === 'accessory') {
      const idx = this.engine.char.accessories.findIndex((a) => !a);
      const target = idx !== -1 ? idx : 0;
      const prev = this.engine.char.accessories[target];
      this.engine.char.accessories[target] = s;
      this.engine.char.inventory[slotIdx] = prev;
      this.engine.audio.playSfx('ui_click');
      this.render();
      return;
    }
    if (def.hookRange) {
      const prev = this.engine.char.equipment.hook;
      this.engine.char.equipment.hook = s;
      this.engine.char.inventory[slotIdx] = prev;
      this.render();
      return;
    }
    if (def.mountId) {
      const prev = this.engine.char.equipment.mount;
      this.engine.char.equipment.mount = s;
      this.engine.char.inventory[slotIdx] = prev;
      this.render();
      return;
    }
    if (def.petId) {
      const prev = this.engine.char.equipment.pet;
      this.engine.char.equipment.pet = s;
      this.engine.char.inventory[slotIdx] = prev;
      this.render();
      return;
    }
    this.engine.consumeInventoryStack(slotIdx);
    this.render();
  }

  public render(): void {
    const char = this.engine.char;
    const px = Math.floor(this.engine.player.position.x);
    const py = Math.floor(this.engine.player.position.y);
    const pz = Math.floor(this.engine.player.position.z);
    const nearbyStations = this.engine.world.getNearbyCraftingStations(px, py, pz);
    const stats = InventorySystem.computePlayerStats(char, this.engine.activeBuffs);

    this.card.innerHTML = '';

    // Header Bar
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
    const heldTxt = this.heldCursor
      ? `<span style="color:#ffd740;font-size:13px;">Holding: <b>${getItemDef(this.heldCursor.itemId)?.name ?? this.heldCursor.itemId} x${this.heldCursor.count}</b> (Click a slot to place)</span>`
      : `<span style="color:#9eb0df;font-size:12px;">Click to move · Right-click to equip/consume · Coins: <b style="color:#ffd740">${formatCoins(InventorySystem.getTotalCopper(char))}</b></span>`;
    hdr.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <h3 style="margin:0;color:#ffd740;">Inventory & Crafting</h3>
        ${heldTxt}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="t-btn" id="inv-sort">Sort Bag</button>
        <button class="t-btn t-btn-danger" id="inv-close">Close [E]</button>
      </div>
    `;
    hdr.querySelector('#inv-sort')?.addEventListener('click', () => {
      InventorySystem.sortInventory(char);
      this.engine.audio.playSfx('ui_click');
      this.render();
    });
    hdr.querySelector('#inv-close')?.addEventListener('click', () => this.close());
    this.card.appendChild(hdr);

    // Main Grid Body
    const body = document.createElement('div');
    body.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;overflow-y:auto;max-height:76vh;';

    // LEFT COLUMN: 40-slot Bag + Coins + Ammo + Chest (if open)
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    const bagGrid = document.createElement('div');
    bagGrid.style.cssText = 'display:grid;grid-template-columns:repeat(10, 1fr);gap:4px;';
    for (let i = 0; i < 40; i++) {
      const slot = createItemSlotEl(char.inventory[i], {
        indexLabel: i < 10 ? (i === 9 ? '0' : String(i + 1)) : undefined,
        active: i === this.engine.selectedHotbar,
        extraTooltip: 'Right-click to equip/consume',
        onClick: () => this.swapWithCursor(() => char.inventory[i], (s) => (char.inventory[i] = s)),
        onContextMenu: () => this.quickUseOrEquip(i),
      });
      bagGrid.appendChild(slot);
    }
    leftCol.appendChild(bagGrid);

    // Coins & Ammo Row + Trash
    const utilityRow = document.createElement('div');
    utilityRow.style.cssText = 'display:flex;gap:12px;align-items:center;flex-wrap:wrap;';

    const coinGroup = document.createElement('div');
    coinGroup.innerHTML = '<div style="font-size:11px;color:#ffd740;margin-bottom:3px;">Coins</div>';
    const coinSlots = document.createElement('div');
    coinSlots.style.cssText = 'display:flex;gap:4px;';
    for (let i = 0; i < 4; i++) {
      coinSlots.appendChild(
        createItemSlotEl(char.coins[i], {
          onClick: () =>
            this.swapWithCursor(
              () => char.coins[i],
              (s) => (char.coins[i] = s),
              (s) => getItemDef(s.itemId)?.category === 'coin'
            ),
        })
      );
    }
    coinGroup.appendChild(coinSlots);

    const ammoGroup = document.createElement('div');
    ammoGroup.innerHTML = '<div style="font-size:11px;color:#80d8ff;margin-bottom:3px;">Ammo</div>';
    const ammoSlots = document.createElement('div');
    ammoSlots.style.cssText = 'display:flex;gap:4px;';
    for (let i = 0; i < 4; i++) {
      ammoSlots.appendChild(
        createItemSlotEl(char.ammo[i], {
          onClick: () =>
            this.swapWithCursor(
              () => char.ammo[i],
              (s) => (char.ammo[i] = s),
              (s) => getItemDef(s.itemId)?.category === 'ammo'
            ),
        })
      );
    }
    ammoGroup.appendChild(ammoSlots);

    const trashGroup = document.createElement('div');
    trashGroup.innerHTML = '<div style="font-size:11px;color:#ff8a80;margin-bottom:3px;">Trash</div>';
    trashGroup.appendChild(
      createItemSlotEl(this.trashSlot, {
        onClick: () => {
          if (this.heldCursor) {
            this.trashSlot = this.heldCursor;
            this.heldCursor = null;
            this.render();
          } else if (this.trashSlot) {
            this.heldCursor = this.trashSlot;
            this.trashSlot = null;
            this.render();
          }
        },
      })
    );

    utilityRow.append(coinGroup, ammoGroup, trashGroup);
    leftCol.appendChild(utilityRow);

    // Open Chest Panel
    if (this.engine.openChest) {
      const chest = this.engine.openChest;
      const chestBox = document.createElement('div');
      chestBox.className = 't-panel';
      chestBox.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;';
      chestBox.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b style="color:#ffd740;">Chest Storage (${chest.x}, ${chest.y}, ${chest.z})</b>
          <div style="display:flex;gap:6px;">
            <button class="t-btn" id="ch-loot" style="padding:3px 8px;font-size:11px;">Loot All</button>
            <button class="t-btn" id="ch-quick" style="padding:3px 8px;font-size:11px;">Quick Stack</button>
          </div>
        </div>
      `;
      chestBox.querySelector('#ch-loot')?.addEventListener('click', () => {
        for (let i = 0; i < chest.items.length; i++) {
          const item = chest.items[i];
          if (item) {
            const added = InventorySystem.addItem(char, item.itemId, item.count, item.modifier);
            if (added >= item.count) chest.items[i] = null;
            else item.count -= added;
          }
        }
        this.render();
      });
      chestBox.querySelector('#ch-quick')?.addEventListener('click', () => {
        for (let i = 10; i < char.inventory.length; i++) {
          const inv = char.inventory[i];
          if (!inv) continue;
          const matching = chest.items.find((c) => c && c.itemId === inv.itemId);
          if (matching) {
            const max = getItemDef(inv.itemId)?.maxStack ?? 9999;
            const move = Math.min(inv.count, max - matching.count);
            if (move > 0) {
              matching.count += move;
              inv.count -= move;
              if (inv.count <= 0) char.inventory[i] = null;
            }
          }
        }
        this.render();
      });

      const cGrid = document.createElement('div');
      cGrid.style.cssText = 'display:grid;grid-template-columns:repeat(10, 1fr);gap:4px;';
      for (let i = 0; i < chest.items.length; i++) {
        cGrid.appendChild(
          createItemSlotEl(chest.items[i], {
            onClick: () => this.swapWithCursor(() => chest.items[i], (s) => (chest.items[i] = s)),
          })
        );
      }
      chestBox.appendChild(cGrid);
      leftCol.appendChild(chestBox);
    }

    // Equipment + Stats Box
    const equipBox = document.createElement('div');
    equipBox.className = 't-panel';
    equipBox.style.cssText = 'padding:8px;display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;';
    const armorCol = document.createElement('div');
    armorCol.innerHTML = '<div style="font-size:11px;color:#ffd740;margin-bottom:4px;">Armor & Mobility</div>';
    const armorRow = document.createElement('div');
    armorRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    const armorMeta: { idx: number; slot: ArmorSlot; label: string }[] = [
      { idx: 0, slot: 'head', label: 'H' },
      { idx: 1, slot: 'body', label: 'B' },
      { idx: 2, slot: 'legs', label: 'L' },
    ];
    for (const am of armorMeta) {
      armorRow.appendChild(
        createItemSlotEl(char.armor[am.idx], {
          indexLabel: am.label,
          onClick: () =>
            this.swapWithCursor(
              () => char.armor[am.idx],
              (s) => (char.armor[am.idx] = s),
              (s) => getItemDef(s.itemId)?.armorSlot === am.slot
            ),
        })
      );
    }
    armorRow.appendChild(
      createItemSlotEl(char.equipment.hook, {
        indexLabel: 'Hk',
        onClick: () =>
          this.swapWithCursor(
            () => char.equipment.hook,
            (s) => (char.equipment.hook = s),
            (s) => Boolean(getItemDef(s.itemId)?.hookRange)
          ),
      })
    );
    armorRow.appendChild(
      createItemSlotEl(char.equipment.mount, {
        indexLabel: 'Mt',
        onClick: () =>
          this.swapWithCursor(
            () => char.equipment.mount,
            (s) => (char.equipment.mount = s),
            (s) => Boolean(getItemDef(s.itemId)?.mountId)
          ),
      })
    );
    armorCol.appendChild(armorRow);

    const accCol = document.createElement('div');
    accCol.innerHTML = '<div style="font-size:11px;color:#80d8ff;margin-bottom:4px;">Accessories (7)</div>';
    const accRow = document.createElement('div');
    accRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    for (let i = 0; i < 7; i++) {
      accRow.appendChild(
        createItemSlotEl(char.accessories[i], {
          onClick: () =>
            this.swapWithCursor(
              () => char.accessories[i],
              (s) => (char.accessories[i] = s),
              (s) => getItemDef(s.itemId)?.category === 'accessory'
            ),
        })
      );
    }
    accCol.appendChild(accRow);

    const statsCol = document.createElement('div');
    statsCol.style.cssText = 'font-size:11px;line-height:1.45;color:#d6e2ff;min-width:165px;';
    statsCol.innerHTML = `
      <div>Defense: <b style="color:#81d4fa">${stats.defense}</b> · Crit: +${stats.critChanceBonus}%</div>
      <div>Dmg: M ${Math.round(stats.meleeDamageMult * 100)}% / R ${Math.round(stats.rangedDamageMult * 100)}% / Mg ${Math.round(stats.magicDamageMult * 100)}% / S ${Math.round(stats.summonDamageMult * 100)}%</div>
      <div>Speed: ${Math.round(stats.moveSpeedMult * 100)}% · Minions: ${stats.maxMinions}</div>
      ${stats.activeSetBonus ? `<div style="color:#69f0ae;">Set: ${stats.activeSetBonus}</div>` : ''}
    `;
    equipBox.append(armorCol, accCol, statsCol);
    leftCol.appendChild(equipBox);
    body.appendChild(leftCol);

    // RIGHT COLUMN: Crafting & Housing Tabs
    const rightCol = document.createElement('div');
    rightCol.className = 't-panel';
    rightCol.style.cssText = 'padding:10px;display:flex;flex-direction:column;gap:8px;max-height:70vh;';

    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
    tabs.innerHTML = `
      <button class="t-btn ${this.activeSubTab === 'craft' ? 't-btn-gold' : ''}" id="sub-craft">Crafting</button>
      <button class="t-btn ${this.activeSubTab === 'housing' ? 't-btn-gold' : ''}" id="sub-house">Town Housing</button>
    `;
    tabs.querySelector('#sub-craft')?.addEventListener('click', () => { this.activeSubTab = 'craft'; this.render(); });
    tabs.querySelector('#sub-house')?.addEventListener('click', () => { this.activeSubTab = 'housing'; this.render(); });
    rightCol.appendChild(tabs);

    if (this.activeSubTab === 'craft') {
      const stationList = Array.from(nearbyStations)
        .map((s) => STATION_NAMES[s as CraftingStationId] ?? s)
        .join(', ');
      const filterRow = document.createElement('div');
      filterRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
      filterRow.innerHTML = `
        <input class="t-input" id="rec-search" placeholder="Search recipes..." value="${this.recipeSearch}" style="flex:1;min-width:120px;font-size:12px;" />
        <button class="t-btn" id="rec-toggle" style="padding:5px 9px;font-size:11px;">${this.showAllRecipes ? 'Showing: All' : 'Showing: Craftable'}</button>
      `;
      const searchIn = filterRow.querySelector('#rec-search') as HTMLInputElement;
      searchIn.addEventListener('input', () => {
        this.recipeSearch = searchIn.value;
        this.renderRecipeList(recList, nearbyStations);
      });
      filterRow.querySelector('#rec-toggle')?.addEventListener('click', () => {
        this.showAllRecipes = !this.showAllRecipes;
        this.render();
      });

      const stNote = document.createElement('div');
      stNote.style.cssText = 'font-size:11px;color:#9eb0df;';
      stNote.textContent = `Nearby Stations: ${stationList}`;

      const recList = document.createElement('div');
      recList.className = 't-scroll';
      recList.style.cssText = 'display:flex;flex-direction:column;gap:5px;flex:1;min-height:220px;';
      this.renderRecipeList(recList, nearbyStations);

      rightCol.append(filterRow, stNote, recList);
    } else {
      // Housing Validation & NPC Assignment Panel
      const hPanel = document.createElement('div');
      hPanel.className = 't-scroll';
      hPanel.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:1;';
      const checkBtn = document.createElement('button');
      checkBtn.className = 't-btn t-btn-gold';
      checkBtn.textContent = `Check Current Room at (${px}, ${py}, ${pz})`;
      checkBtn.addEventListener('click', () => {
        this.lastHouseCheck = HousingSystem.validateHouse(this.engine.world, px, py, pz);
        this.render();
      });
      hPanel.appendChild(checkBtn);

      if (this.lastHouseCheck) {
        const res = this.lastHouseCheck;
        const box = document.createElement('div');
        box.style.cssText = `padding:8px;border-radius:6px;border:1px solid ${res.valid ? '#69f0ae' : '#ff5252'};font-size:12px;`;
        box.innerHTML = `
          <div style="font-weight:700;color:${res.valid ? '#69f0ae' : '#ff8a80'}">${res.reason}</div>
          <div style="margin-top:4px;color:#d6e2ff;">
            Interior: ${res.interiorCount} blocks · Light: ${res.hasLight ? 'Yes' : 'No'} · Table: ${res.hasTable ? 'Yes' : 'No'} · Chair: ${res.hasChair ? 'Yes' : 'No'} · Door: ${res.hasDoor ? 'Yes' : 'No'}
          </div>
        `;
        hPanel.appendChild(box);
      }

      const unlocked = HousingSystem.evaluateUnlockedNpcs(this.engine.world.meta, char);
      const npcList = document.createElement('div');
      npcList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
      npcList.innerHTML = `<div style="font-size:12px;font-weight:700;color:#ffd740;">Unlocked Town NPCs (${unlocked.length}):</div>`;

      for (const npcId of unlocked) {
        const assigned = this.engine.world.meta.npcHouses.find((h) => h.npcId === npcId);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:rgba(12,18,38,0.65);padding:6px 8px;border-radius:5px;font-size:12px;';
        row.innerHTML = `
          <div><b>${npcId.replace(/_/g, ' ').toUpperCase()}</b> ${assigned ? `<span style="color:#69f0ae;">@ (${assigned.x},${assigned.y},${assigned.z})</span>` : '<span style="color:#9eb0df;">(Homeless)</span>'}</div>
          <button class="t-btn" style="padding:3px 8px;font-size:11px;" ${!this.lastHouseCheck?.valid ? 'disabled' : ''}>Assign Here</button>
        `;
        row.querySelector('button')?.addEventListener('click', () => {
          if (!this.lastHouseCheck?.valid) return;
          const [hx, hy, hz] = this.lastHouseCheck.center;
          const existing = this.engine.world.meta.npcHouses.find((h) => h.npcId === npcId);
          if (existing) {
            existing.x = hx; existing.y = hy; existing.z = hz; existing.valid = true;
          } else {
            this.engine.world.meta.npcHouses.push({ npcId, x: hx, y: hy, z: hz, valid: true });
          }
          const npcEnt = this.engine.entities.npcs.find((n) => n.id === npcId);
          if (npcEnt) {
            npcEnt.homePos.set(hx, hy, hz);
            npcEnt.position.set(hx, hy, hz);
          }
          this.engine.unlockAchievement('home_sweet_home');
          this.engine.notify(`Assigned ${npcId} to (${hx}, ${hy}, ${hz})!`, '#69f0ae');
          this.render();
        });
        npcList.appendChild(row);
      }
      hPanel.appendChild(npcList);
      rightCol.appendChild(hPanel);
    }

    body.appendChild(rightCol);
    this.card.appendChild(body);
  }

  private renderRecipeList(container: HTMLDivElement, nearbyStations: Set<string>): void {
    container.innerHTML = '';
    const char = this.engine.char;
    const isHm = this.engine.world.meta.isHardmode;
    const q = this.recipeSearch.trim().toLowerCase();

    const filtered: RecipeDef[] = RECIPES.filter((r) => {
      const outDef = getItemDef(r.resultId);
      if (!outDef) return false;
      if (q && !outDef.name.toLowerCase().includes(q) && !r.resultId.includes(q)) return false;
      if (!this.showAllRecipes) {
        return InventorySystem.canCraft(char, r, nearbyStations, isHm);
      }
      return true;
    }).slice(0, 80);

    if (filtered.length === 0) {
      container.innerHTML = '<div style="color:#9eb0df;font-size:12px;padding:12px;">No matching recipes. Toggle "Showing: All" or stand near a Work Bench / Furnace / Anvil!</div>';
      return;
    }

    for (const r of filtered) {
      const outDef = getItemDef(r.resultId)!;
      const craftable = InventorySystem.canCraft(char, r, nearbyStations, isHm);
      const stationName = STATION_NAMES[r.station] ?? r.station;
      const ingText = r.ingredients
        .map((ing) => {
          const have = InventorySystem.countItem(char, ing.itemId);
          const nm = getItemDef(ing.itemId)?.name ?? ing.itemId;
          return `<span style="color:${have >= ing.count ? '#a5d6a7' : '#ff8a80'}">${have}/${ing.count} ${nm}</span>`;
        })
        .join(' · ');

      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;background:rgba(12,18,38,0.72);border:1px solid ${craftable ? '#4d67b8' : '#2a3355'};opacity:${craftable ? 1 : 0.72};`;
      row.innerHTML = `
        <img src="${getIconUrl(r.resultId)}" style="width:28px;height:28px;image-rendering:pixelated;" />
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:${getRarityColor(outDef.rarity)};">${outDef.name}${r.resultCount > 1 ? ` x${r.resultCount}` : ''}</div>
          <div style="font-size:11px;">${ingText}</div>
          <div style="font-size:10px;color:#8fa4d8;">Station: ${stationName}</div>
        </div>
        <button class="t-btn ${craftable ? 't-btn-gold' : ''}" style="padding:4px 10px;font-size:11px;" ${craftable ? '' : 'disabled'}>Craft</button>
      `;
      row.querySelector('button')?.addEventListener('click', () => {
        if (InventorySystem.craftRecipe(char, r, nearbyStations, isHm)) {
          this.engine.audio.playSfx('craft');
          if (this.engine.char.difficulty === 'journey') {
            this.engine.char.researchedItems[r.resultId] = (this.engine.char.researchedItems[r.resultId] ?? 0) + r.resultCount;
          }
          this.render();
        }
      });
      container.appendChild(row);
    }
  }
}
