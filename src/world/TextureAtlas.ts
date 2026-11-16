import * as THREE from 'three';
import { ALL_BLOCKS } from '@/data/blocks';
import { ItemDef } from '@/types/game';
import { hashCoords } from './Noise';

export interface TileUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

const TILE_PX = 16;
const PAD_PX = 2;
const CELL_PX = TILE_PX + PAD_PX * 2; // 20px

export class TextureAtlas {
  public readonly uvMap = new Map<string, TileUV>();
  public readonly canvas: HTMLCanvasElement;
  public readonly texture: THREE.CanvasTexture;
  private tileNames: string[] = [];

  constructor() {
    const names = new Set<string>();
    for (const b of ALL_BLOCKS) {
      names.add(b.tileTop);
      names.add(b.tileSide);
      names.add(b.tileBottom);
    }
    this.tileNames = Array.from(names);
    const cols = Math.ceil(Math.sqrt(this.tileNames.length));
    const rows = Math.ceil(this.tileNames.length / cols);

    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * CELL_PX;
    this.canvas.height = rows * CELL_PX;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let idx = 0; idx < this.tileNames.length; idx++) {
      const name = this.tileNames[idx];
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const px = gx * CELL_PX + PAD_PX;
      const py = gy * CELL_PX + PAD_PX;

      this.drawTile(ctx, name, px, py);
      // Extrude border 2px for seamless Nearest/Mipmap sampling
      ctx.drawImage(this.canvas, px, py, TILE_PX, 1, px, py - PAD_PX, TILE_PX, PAD_PX);
      ctx.drawImage(this.canvas, px, py + TILE_PX - 1, TILE_PX, 1, px, py + TILE_PX, TILE_PX, PAD_PX);
      ctx.drawImage(this.canvas, px, py, 1, TILE_PX, px - PAD_PX, py, PAD_PX, TILE_PX);
      ctx.drawImage(this.canvas, px + TILE_PX - 1, py, 1, TILE_PX, px + TILE_PX, py, PAD_PX, TILE_PX);

      const W = this.canvas.width;
      const H = this.canvas.height;
      // Note Canvas Y is top-down while WebGL flipY=true flips V
      const u0 = (px + 0.05) / W;
      const u1 = (px + TILE_PX - 0.05) / W;
      const v1 = 1 - (py + 0.05) / H;
      const v0 = 1 - (py + TILE_PX - 0.05) / H;
      this.uvMap.set(name, { u0, v0, u1, v1 });
    }

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  public getUV(tileName: string): TileUV {
    return this.uvMap.get(tileName) ?? this.uvMap.get('stone') ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  }

  private drawTile(ctx: CanvasRenderingContext2D, name: string, ox: number, oy: number): void {
    // Helper to paint noisy pixel surface
    const seed = Array.from(name).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 17);
    const fillNoisy = (baseHex: string, darkHex: string, lightHex: string, threshold = 0.25) => {
      ctx.fillStyle = baseHex;
      ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const r = hashCoords(seed, x, y);
          if (r < threshold) {
            ctx.fillStyle = darkHex;
            ctx.fillRect(ox + x, oy + y, 1, 1);
          } else if (r > 1 - threshold * 0.7) {
            ctx.fillStyle = lightHex;
            ctx.fillRect(ox + x, oy + y, 1, 1);
          }
        }
      }
    };

    const drawOre = (stoneHex: string, stoneDark: string, oreHex: string, oreHighlight: string) => {
      fillNoisy(stoneHex, stoneDark, '#9898a0', 0.22);
      const flecks = [
        [3, 3, 3, 2],
        [9, 2, 4, 3],
        [2, 9, 3, 4],
        [9, 9, 4, 3],
        [6, 6, 3, 3],
      ];
      for (const [fx, fy, fw, fh] of flecks) {
        ctx.fillStyle = oreHex;
        ctx.fillRect(ox + fx, oy + fy, fw, fh);
        ctx.fillStyle = oreHighlight;
        ctx.fillRect(ox + fx, oy + fy, Math.max(1, fw - 1), 1);
      }
    };

    const drawGrassSide = (soil: string, soilDark: string, grass: string, grassLight: string) => {
      fillNoisy(soil, soilDark, soil, 0.28);
      for (let x = 0; x < TILE_PX; x++) {
        const drop = 3 + Math.floor(hashCoords(seed + 5, x, 0) * 3);
        ctx.fillStyle = grass;
        ctx.fillRect(ox + x, oy, 1, drop);
        ctx.fillStyle = grassLight;
        ctx.fillRect(ox + x, oy, 1, 1);
      }
    };

    const drawBricks = (base: string, mortar: string, light: string) => {
      ctx.fillStyle = base;
      ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
      ctx.fillStyle = mortar;
      for (let y = 0; y < TILE_PX; y += 4) {
        ctx.fillRect(ox, oy + y, TILE_PX, 1);
        const shift = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = shift; x < TILE_PX; x += 8) {
          ctx.fillRect(ox + x, oy + y, 1, 4);
        }
      }
      ctx.fillStyle = light;
      for (let y = 1; y < TILE_PX; y += 4) {
        ctx.fillRect(ox + 1, oy + y, TILE_PX - 2, 1);
      }
    };

    const drawPlanks = (base: string, dark: string, light: string) => {
      ctx.fillStyle = base;
      ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
      for (let y = 0; y < TILE_PX; y += 4) {
        ctx.fillStyle = dark;
        ctx.fillRect(ox, oy + y, TILE_PX, 1);
        ctx.fillStyle = light;
        ctx.fillRect(ox, oy + y + 1, TILE_PX, 1);
      }
      ctx.fillStyle = dark;
      ctx.fillRect(ox + 7, oy, 1, 4);
      ctx.fillRect(ox + 3, oy + 4, 1, 4);
      ctx.fillRect(ox + 12, oy + 8, 1, 4);
      ctx.fillRect(ox + 6, oy + 12, 1, 4);
    };

    const drawCrossPlant = (stem: string, blossom: string, accent?: string) => {
      ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
      ctx.fillStyle = stem;
      ctx.fillRect(ox + 7, oy + 6, 2, 10);
      ctx.fillRect(ox + 5, oy + 10, 2, 2);
      ctx.fillRect(ox + 9, oy + 9, 2, 2);
      ctx.fillStyle = blossom;
      ctx.fillRect(ox + 5, oy + 2, 6, 5);
      if (accent) {
        ctx.fillStyle = accent;
        ctx.fillRect(ox + 7, oy + 4, 2, 2);
      }
    };

    switch (name) {
      case 'dirt': fillNoisy('#8f5f3c', '#73492b', '#a6734e'); break;
      case 'grass_top': fillNoisy('#48a842', '#378a32', '#64c95b'); break;
      case 'grass_side': drawGrassSide('#8f5f3c', '#73492b', '#48a842', '#64c95b'); break;
      case 'stone': fillNoisy('#7d7d82', '#636369', '#94949c'); break;
      case 'sand': fillNoisy('#e0c975', '#c7af5a', '#f2de94'); break;
      case 'hardened_sand': fillNoisy('#c99b52', '#ab7f3a', '#deb26d'); break;
      case 'sandstone': drawBricks('#b87d3b', '#8f5d24', '#d19552'); break;
      case 'mud': fillNoisy('#5c443d', '#45312b', '#75584f'); break;
      case 'clay': fillNoisy('#9c634f', '#7d4a38', '#b57b65'); break;
      case 'snow': fillNoisy('#e8f5fc', '#cde4f2', '#ffffff'); break;
      case 'ice': fillNoisy('#8ccdf2', '#6db5e0', '#b5e3fc', 0.18); break;
      case 'thin_ice': fillNoisy('#b5e3fc', '#8ccdf2', '#e8f8ff', 0.2); break;
      case 'ash': fillNoisy('#453e42', '#2e282c', '#5c5459'); break;
      case 'obsidian': fillNoisy('#291f42', '#171029', '#4a3a73', 0.2); break;
      case 'ebonstone': fillNoisy('#4c3e66', '#35294a', '#655485'); break;
      case 'crimstone': fillNoisy('#782e34', '#571c21', '#994148'); break;
      case 'pearlstone': fillNoisy('#c4b8cf', '#a395b0', '#e2d7eb'); break;
      case 'corrupt_grass_top': fillNoisy('#6e5299', '#523978', '#8c6ec2'); break;
      case 'corrupt_grass_side': drawGrassSide('#8f5f3c', '#73492b', '#6e5299', '#8c6ec2'); break;
      case 'crimson_grass_top': fillNoisy('#ba363c', '#8f2429', '#de5259'); break;
      case 'crimson_grass_side': drawGrassSide('#8f5f3c', '#73492b', '#ba363c', '#de5259'); break;
      case 'hallowed_grass_top': fillNoisy('#47b8c9', '#2e93a3', '#70dce8'); break;
      case 'hallowed_grass_side': drawGrassSide('#8f5f3c', '#73492b', '#47b8c9', '#70dce8'); break;
      case 'jungle_grass_top': fillNoisy('#56a62e', '#3d801c', '#74c748'); break;
      case 'jungle_grass_side': drawGrassSide('#5c443d', '#45312b', '#56a62e', '#74c748'); break;
      case 'mushroom_grass_top': fillNoisy('#365ce0', '#2340b0', '#5e83ff'); break;
      case 'mushroom_grass_side': drawGrassSide('#5c443d', '#45312b', '#365ce0', '#5e83ff'); break;
      case 'glowing_mushroom_block':
        ctx.fillStyle = '#2b47ba';
        ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#75a6ff';
        ctx.fillRect(ox + 2, oy + 2, 4, 4);
        ctx.fillRect(ox + 10, oy + 3, 3, 3);
        ctx.fillRect(ox + 5, oy + 10, 5, 4);
        break;
      case 'wood_top': fillNoisy('#b08354', '#7a5432', '#cfa374'); break;
      case 'wood_side': fillNoisy('#7a5432', '#593b20', '#966b43', 0.35); break;
      case 'wood_plank': drawPlanks('#a87849', '#7d542d', '#bf8e5c'); break;
      case 'boreal_wood_top': fillNoisy('#8c705c', '#5e4738', '#a68b76'); break;
      case 'boreal_wood_side': fillNoisy('#695140', '#4a372a', '#826754', 0.35); break;
      case 'palm_wood_top': fillNoisy('#d1ab73', '#997440', '#e3c18d'); break;
      case 'palm_wood_side': fillNoisy('#b38b54', '#8a6738', '#cca268', 0.35); break;
      case 'mahogany_top': fillNoisy('#9e574e', '#692f29', '#b86c63'); break;
      case 'mahogany_side': fillNoisy('#7d4039', '#572822', '#99534b', 0.35); break;
      case 'ebonwood_top': fillNoisy('#6d6280', '#443b54', '#877b9c'); break;
      case 'ebonwood_side': fillNoisy('#524961', '#383045', '#6b607d', 0.35); break;
      case 'shadewood_top': fillNoisy('#8a5259', '#572d32', '#a66870'); break;
      case 'shadewood_side': fillNoisy('#693c42', '#472529', '#824e55', 0.35); break;
      case 'pearlwood_top': fillNoisy('#ded1b4', '#b0a07f', '#f0e5cc'); break;
      case 'pearlwood_side': fillNoisy('#c7b897', '#9e8f6f', '#ded0b1', 0.35); break;
      case 'living_wood': fillNoisy('#6e4726', '#4a2d15', '#875c36', 0.32); break;
      case 'leaf': fillNoisy('#3c8f38', '#256322', '#5cb557', 0.3); break;
      case 'boreal_leaf': fillNoisy('#4a7a78', '#2f5452', '#679c99', 0.3); break;
      case 'jungle_leaf': fillNoisy('#3d992b', '#266b18', '#5ec248', 0.3); break;
      case 'palm_leaf': fillNoisy('#69ad38', '#457d1e', '#88cc52', 0.3); break;
      case 'hallowed_leaf': fillNoisy('#56c2d6', '#338fa1', '#87e4f5', 0.3); break;

      // Ores & Gems
      case 'copper_ore': drawOre('#7d7d82', '#636369', '#bd6a3e', '#f29e6d'); break;
      case 'tin_ore': drawOre('#7d7d82', '#636369', '#999788', '#cccab8'); break;
      case 'iron_ore': drawOre('#7d7d82', '#636369', '#8c7264', '#bfa191'); break;
      case 'lead_ore': drawOre('#7d7d82', '#636369', '#4b5769', '#7788a3'); break;
      case 'silver_ore': drawOre('#7d7d82', '#636369', '#c2cbd4', '#ffffff'); break;
      case 'tungsten_ore': drawOre('#7d7d82', '#636369', '#75917a', '#a3c4a9'); break;
      case 'gold_ore': drawOre('#7d7d82', '#636369', '#e0bc36', '#fff280'); break;
      case 'platinum_ore': drawOre('#7d7d82', '#636369', '#b5ccf0', '#ffffff'); break;
      case 'demonite_ore': drawOre('#4c3e66', '#35294a', '#6b47c9', '#ab8cff'); break;
      case 'crimtane_ore': drawOre('#782e34', '#571c21', '#d92b3a', '#ff808b'); break;
      case 'hellstone': drawOre('#453e42', '#2e282c', '#e64219', '#ffb347'); break;
      case 'meteorite': drawOre('#4a3833', '#2e221e', '#ad4b32', '#ff824d'); break;
      case 'cobalt_ore': drawOre('#7d7d82', '#636369', '#2567c9', '#6ba7ff'); break;
      case 'palladium_ore': drawOre('#7d7d82', '#636369', '#d96b2b', '#ffab75'); break;
      case 'mythril_ore': drawOre('#7d7d82', '#636369', '#37b589', '#7dffce'); break;
      case 'orichalcum_ore': drawOre('#7d7d82', '#636369', '#d44ac4', '#ff99f3'); break;
      case 'adamantite_ore': drawOre('#7d7d82', '#636369', '#cc2944', '#ff7088'); break;
      case 'titanium_ore': drawOre('#7d7d82', '#636369', '#8d99a6', '#e0ecf7'); break;
      case 'chlorophyte_ore': drawOre('#5c443d', '#45312b', '#66d130', '#b4ff87'); break;
      case 'luminite_ore': drawOre('#2d3840', '#1a2229', '#69f0c8', '#d4fff2'); break;
      case 'amethyst_ore': drawOre('#7d7d82', '#636369', '#9c42d9', '#dc9eff'); break;
      case 'topaz_ore': drawOre('#7d7d82', '#636369', '#e6ae22', '#ffe073'); break;
      case 'sapphire_ore': drawOre('#7d7d82', '#636369', '#2965e6', '#82abff'); break;
      case 'emerald_ore': drawOre('#7d7d82', '#636369', '#27c258', '#82ffa9'); break;
      case 'ruby_ore': drawOre('#7d7d82', '#636369', '#e02b43', '#ff8293'); break;
      case 'diamond_ore': drawOre('#7d7d82', '#636369', '#87e5ff', '#ffffff'); break;

      // Bricks & Structures
      case 'gray_brick': drawBricks('#70727a', '#4a4b52', '#8f929c'); break;
      case 'red_brick': drawBricks('#9e473c', '#692a22', '#ba5d52'); break;
      case 'blue_dungeon_brick': drawBricks('#374c78', '#1e2b47', '#506ca6'); break;
      case 'green_dungeon_brick': drawBricks('#376b54', '#1d4030', '#4f9174'); break;
      case 'pink_dungeon_brick': drawBricks('#82466b', '#522741', '#a6608b'); break;
      case 'obsidian_brick': drawBricks('#3a2b57', '#1d1430', '#54417a'); break;
      case 'hellstone_brick': drawBricks('#ab3619', '#661c0a', '#ff7043'); break;
      case 'lihzahrd_brick': drawBricks('#87481d', '#542a0e', '#ab6230'); break;
      case 'sunplate': drawBricks('#517ec4', '#315287', '#ffd740'); break;
      case 'gold_brick': drawBricks('#e0bd38', '#9e7d19', '#ffe875'); break;
      case 'copper_brick': drawBricks('#bf6c40', '#854322', '#e08e60'); break;
      case 'meteorite_brick': drawBricks('#674c8f', '#3c295c', '#ff6e40'); break;
      case 'pearlstone_brick': drawBricks('#cfc2d9', '#9a8ba6', '#efe6f7'); break;
      case 'ebonstone_brick': drawBricks('#544573', '#35294d', '#736199'); break;
      case 'crimstone_brick': drawBricks('#8c323a', '#591b20', '#b34b54'); break;

      // Cloud, Granite, Marble, Hive, Glass
      case 'cloud': fillNoisy('#f2f7ff', '#d5e4fa', '#ffffff', 0.2); break;
      case 'rain_cloud': fillNoisy('#7689a3', '#53657d', '#98abc4', 0.25); break;
      case 'granite': fillNoisy('#363b69', '#21254a', '#525999'); break;
      case 'marble': fillNoisy('#e6e4ed', '#c7c3d4', '#ffffff'); break;
      case 'hive': fillNoisy('#c98826', '#915c11', '#e8a843'); break;
      case 'honey_block': fillNoisy('#f0b62b', '#c78c12', '#ffd663'); break;
      case 'crispy_honey': fillNoisy('#965e1f', '#663c0e', '#bd7e37'); break;
      case 'silt': fillNoisy('#5d6069', '#45474f', '#787b87'); break;
      case 'slush': fillNoisy('#7a9eb0', '#5a7b8c', '#a2c6d9'); break;
      case 'desert_fossil': drawOre('#b87d3b', '#8f5d24', '#e8dbb5', '#ffffff'); break;
      case 'cactus_top': fillNoisy('#4c9939', '#326e23', '#6bc255'); break;
      case 'cactus_side':
        fillNoisy('#4c9939', '#326e23', '#6bc255');
        ctx.fillStyle = '#2b5e1d';
        ctx.fillRect(ox + 3, oy, 2, TILE_PX);
        ctx.fillRect(ox + 10, oy, 2, TILE_PX);
        break;
      case 'glass':
        ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = 'rgba(195, 238, 255, 0.35)';
        ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#e0f7ff';
        ctx.fillRect(ox, oy, TILE_PX, 1);
        ctx.fillRect(ox, oy + TILE_PX - 1, TILE_PX, 1);
        ctx.fillRect(ox, oy, 1, TILE_PX);
        ctx.fillRect(ox + TILE_PX - 1, oy, 1, TILE_PX);
        ctx.fillRect(ox + 3, oy + 3, 4, 1);
        ctx.fillRect(ox + 3, oy + 4, 1, 3);
        break;

      // Liquids
      case 'water': fillNoisy('rgba(35, 137, 218, 0.78)', 'rgba(20, 100, 180, 0.82)', 'rgba(110, 195, 255, 0.75)', 0.2); break;
      case 'lava': fillNoisy('#ff5214', '#c92b04', '#ffbe3d', 0.3); break;
      case 'honey': fillNoisy('rgba(242, 183, 36, 0.85)', 'rgba(204, 136, 12, 0.88)', 'rgba(255, 224, 102, 0.85)', 0.2); break;

      // Torches, Plants, Stations, Chests
      case 'torch': drawCrossPlant('#8a5a32', '#ffaa22', '#fff59d'); break;
      case 'cursed_torch': drawCrossPlant('#5c4866', '#64ff2b', '#ccff90'); break;
      case 'ichor_torch': drawCrossPlant('#7a4838', '#ffea00', '#ffffff'); break;
      case 'ultrabright_torch': drawCrossPlant('#78909c', '#40c4ff', '#ffffff'); break;
      case 'water_candle': drawCrossPlant('#2962ff', '#40c4ff', '#ffffff'); break;
      case 'campfire': drawCrossPlant('#6d4c41', '#ff6d00', '#ffea00'); break;
      case 'sunflower': drawCrossPlant('#3d8f29', '#ffd740', '#795548'); break;
      case 'daybloom': drawCrossPlant('#3d8f29', '#ffee58'); break;
      case 'moonglow': drawCrossPlant('#26a69a', '#40c4ff', '#e0f7fa'); break;
      case 'blinkroot': drawCrossPlant('#8d6e63', '#ffb74d', '#fff59d'); break;
      case 'waterleaf': drawCrossPlant('#29b6f6', '#80d8ff'); break;
      case 'fireblossom': drawCrossPlant('#c62828', '#ff7043', '#ffee58'); break;
      case 'shiverthorn': drawCrossPlant('#4fc3f7', '#b3e5fc'); break;
      case 'deathweed': drawCrossPlant('#6a1b9a', '#ab47bc'); break;
      case 'cobweb':
        ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#eceff1';
        for (let i = 0; i < TILE_PX; i += 2) {
          ctx.fillRect(ox + i, oy + i, 2, 1);
          ctx.fillRect(ox + (TILE_PX - 1 - i), oy + i, 2, 1);
        }
        break;
      case 'coral': drawCrossPlant('#e91e63', '#ff80ab'); break;
      case 'crystal_shard': drawCrossPlant('#ba68c8', '#ea80fc', '#ffffff'); break;
      case 'life_crystal': drawCrossPlant('#d81b60', '#ff4081', '#ff80ab'); break;
      case 'life_fruit': drawCrossPlant('#689f38', '#c6ff00', '#ffd740'); break;
      case 'plantera_bulb': drawCrossPlant('#33691e', '#ff80ab', '#ffee58'); break;
      case 'larva': drawCrossPlant('#c98826', '#ffd740', '#ffffff'); break;
      case 'pot':
        ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#a66542';
        ctx.fillRect(ox + 4, oy + 5, 8, 10);
        ctx.fillStyle = '#7a4529';
        ctx.fillRect(ox + 5, oy + 3, 6, 2);
        break;
      case 'bottle':
        ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#81d4fa';
        ctx.fillRect(ox + 5, oy + 7, 6, 8);
        ctx.fillRect(ox + 6, oy + 4, 4, 3);
        break;

      // Chests & Stations
      case 'wood_chest_top': case 'wood_chest_side':
        drawPlanks('#ad783b', '#694319', '#d19b58');
        ctx.fillStyle = '#ffd740';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;
      case 'gold_chest_top': case 'gold_chest_side': case 'locked_gold_chest_side':
        drawPlanks('#ebbd36', '#9c7811', '#ffe875');
        ctx.fillStyle = name === 'locked_gold_chest_side' ? '#263238' : '#ffffff';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;
      case 'shadow_chest_top': case 'shadow_chest_side':
        drawPlanks('#5c3c82', '#311d4a', '#8c66bd');
        ctx.fillStyle = '#ff6e40';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;
      case 'skyware_chest_top': case 'skyware_chest_side':
        drawPlanks('#4884d4', '#29538f', '#ffd740');
        ctx.fillStyle = '#ffd740';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;
      case 'frozen_chest_top': case 'frozen_chest_side':
        drawPlanks('#7ac7f0', '#448bb5', '#d6f2ff');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;
      case 'ivy_chest_top': case 'ivy_chest_side':
        drawPlanks('#559638', '#33611f', '#82c763');
        ctx.fillStyle = '#ffd740';
        ctx.fillRect(ox + 6, oy + 6, 4, 4);
        break;

      case 'workbench_top': drawPlanks('#b07d4f', '#825731', '#cfa074'); break;
      case 'workbench_side':
        drawPlanks('#a67647', '#694319', '#c99765');
        ctx.fillStyle = '#4f351e';
        ctx.fillRect(ox + 3, oy + 8, 10, 8);
        break;
      case 'furnace_side':
        drawBricks('#70727a', '#4a4b52', '#8f929c');
        ctx.fillStyle = '#ff5722';
        ctx.fillRect(ox + 4, oy + 6, 8, 8);
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(ox + 6, oy + 9, 4, 4);
        break;
      case 'hellforge_side':
        drawBricks('#ab3619', '#661c0a', '#ff7043');
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(ox + 4, oy + 6, 8, 8);
        break;
      case 'anvil_top': case 'anvil_side':
        fillNoisy('#676b73', '#43464d', '#90959e');
        break;
      case 'mythril_anvil_top': case 'mythril_anvil_side':
        fillNoisy('#3ec799', '#248262', '#7dffce');
        break;
      case 'demon_altar':
        fillNoisy('#664096', '#3c215e', '#a575e6');
        ctx.fillStyle = '#ab47bc';
        ctx.fillRect(ox + 3, oy + 3, 10, 4);
        break;
      case 'crimson_altar':
        fillNoisy('#b0282f', '#6b1217', '#ff6169');
        ctx.fillStyle = '#ffd54f';
        ctx.fillRect(ox + 4, oy + 4, 3, 3);
        ctx.fillRect(ox + 9, oy + 4, 3, 3);
        break;
      case 'lihzahrd_altar':
        drawBricks('#87481d', '#542a0e', '#ffab00');
        ctx.fillStyle = '#ffea00';
        ctx.fillRect(ox + 5, oy + 3, 6, 6);
        break;
      case 'ancient_manipulator':
        fillNoisy('#223845', '#111d24', '#64ffda');
        ctx.fillStyle = '#64ffda';
        ctx.fillRect(ox + 4, oy + 4, 8, 8);
        break;
      case 'shadow_orb':
        fillNoisy('#4c3e66', '#2e2142', '#b388ff');
        ctx.fillStyle = '#7c4dff';
        ctx.fillRect(ox + 4, oy + 4, 8, 8);
        break;
      case 'crimson_heart':
        fillNoisy('#8f1d24', '#5c0e13', '#ff6670');
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(ox + 3, oy + 4, 10, 8);
        break;
      case 'bookcase':
        drawPlanks('#7d5232', '#52321a', '#9c6c46');
        ctx.fillStyle = '#c62828'; ctx.fillRect(ox + 2, oy + 2, 2, 5);
        ctx.fillStyle = '#1565c0'; ctx.fillRect(ox + 5, oy + 2, 2, 5);
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(ox + 8, oy + 2, 2, 5);
        ctx.fillStyle = '#f9a825'; ctx.fillRect(ox + 11, oy + 2, 2, 5);
        ctx.fillStyle = '#6a1b9a'; ctx.fillRect(ox + 3, oy + 9, 3, 5);
        ctx.fillStyle = '#00838f'; ctx.fillRect(ox + 7, oy + 9, 3, 5);
        ctx.fillStyle = '#d84315'; ctx.fillRect(ox + 11, oy + 9, 2, 5);
        break;
      case 'wood_door': case 'wood_door_open': case 'lihzahrd_door':
        drawPlanks(name === 'lihzahrd_door' ? '#87481d' : '#8c5f36', '#4a2f17', '#b37e4d');
        ctx.fillStyle = '#ffd740';
        ctx.fillRect(ox + 11, oy + 7, 2, 2);
        break;
      case 'wood_platform':
        ctx.clearRect(ox, oy, TILE_PX, TILE_PX);
        drawPlanks('#b07e4f', '#7a522c', '#cfa070');
        break;
      case 'tnt_top': case 'tnt_side':
        ctx.fillStyle = '#db3737';
        ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox, oy + 5, TILE_PX, 6);
        ctx.fillStyle = '#212121';
        ctx.fillRect(ox + 3, oy + 6, 2, 4);
        ctx.fillRect(ox + 7, oy + 6, 2, 4);
        ctx.fillRect(ox + 11, oy + 6, 2, 4);
        break;
      default:
        fillNoisy('#8a7d72', '#665b52', '#ab9e91', 0.25);
        break;
    }
  }
}

// Procedural 32x32 Crisp Pixel-Art Item Icon Generator (cached DataURLs)
const ICON_CACHE = new Map<string, string>();

export function getItemIconDataUrl(item: ItemDef): string {
  const cached = ICON_CACHE.get(item.id);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;

  const col = item.iconColor;
  const acc = item.iconAccent ?? '#ffffff';

  const px = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };

  switch (item.iconShape) {
    case 'sword':
      for (let i = 0; i < 18; i++) {
        px(24 - i, 4 + i, 3, 3, col);
        px(25 - i, 4 + i, 1, 1, acc);
      }
      px(6, 20, 6, 2, '#ffd740');
      px(8, 18, 2, 6, '#ffd740');
      px(4, 24, 3, 3, '#6d4c41');
      break;
    case 'pickaxe':
      for (let i = 0; i < 16; i++) px(7 + i, 24 - i, 2, 2, '#8d6e63');
      px(10, 4, 14, 3, col);
      px(21, 7, 3, 12, col);
      px(8, 6, 3, 2, acc);
      break;
    case 'axe':
      for (let i = 0; i < 16; i++) px(7 + i, 24 - i, 2, 2, '#8d6e63');
      px(14, 4, 10, 8, col);
      px(18, 12, 6, 4, col);
      break;
    case 'hammer':
      for (let i = 0; i < 16; i++) px(7 + i, 24 - i, 2, 2, '#8d6e63');
      px(14, 4, 11, 7, col);
      px(16, 11, 7, 4, col);
      break;
    case 'bow':
      px(18, 4, 3, 4, col);
      px(21, 8, 3, 16, col);
      px(18, 24, 3, 4, col);
      px(17, 6, 1, 20, '#eeeeee');
      break;
    case 'gun':
      px(5, 11, 21, 5, col);
      px(7, 16, 5, 9, '#5d4037');
      px(16, 10, 8, 2, acc);
      break;
    case 'staff':
      for (let i = 0; i < 18; i++) px(6 + i, 25 - i, 2, 2, '#8d6e63');
      px(20, 4, 7, 7, col);
      px(22, 6, 3, 3, acc);
      break;
    case 'book':
      px(7, 5, 18, 22, col);
      px(9, 5, 2, 22, '#4a148c');
      px(14, 10, 7, 5, acc);
      break;
    case 'whip':
      px(6, 22, 4, 5, '#5d4037');
      px(10, 18, 6, 3, col);
      px(16, 12, 8, 3, col);
      px(22, 6, 4, 6, acc);
      break;
    case 'yoyo':
      px(9, 9, 14, 14, col);
      px(13, 13, 6, 6, acc);
      px(15, 3, 2, 6, '#eeeeee');
      break;
    case 'boomerang':
      px(8, 6, 14, 4, col);
      px(18, 10, 4, 14, col);
      break;
    case 'flail':
      px(6, 22, 4, 5, '#5d4037');
      px(10, 17, 5, 2, '#90a4ae');
      px(15, 7, 11, 11, col);
      break;
    case 'spear':
      for (let i = 0; i < 20; i++) px(5 + i, 26 - i, 2, 2, '#8d6e63');
      px(21, 4, 6, 6, col);
      break;
    case 'arrow':
      for (let i = 0; i < 16; i++) px(7 + i, 23 - i, 2, 2, '#8d6e63');
      px(20, 5, 6, 6, col);
      px(5, 23, 4, 4, '#ffffff');
      break;
    case 'bullet':
      px(11, 8, 10, 15, col);
      px(13, 5, 6, 4, '#ffd740');
      break;
    case 'helmet':
      px(8, 8, 16, 14, col);
      px(10, 6, 12, 3, acc);
      px(11, 14, 10, 4, '#212121');
      break;
    case 'chestplate':
      px(6, 8, 20, 16, col);
      px(11, 8, 10, 4, acc);
      px(10, 12, 12, 12, col);
      break;
    case 'greaves':
      px(8, 6, 6, 20, col);
      px(18, 6, 6, 20, col);
      px(8, 6, 16, 5, acc);
      break;
    case 'boots':
      px(6, 10, 7, 14, col);
      px(6, 19, 11, 5, col);
      px(16, 10, 7, 14, col);
      px(16, 19, 11, 5, col);
      break;
    case 'wings':
      px(4, 7, 9, 16, col);
      px(19, 7, 9, 16, col);
      px(13, 12, 6, 6, acc);
      break;
    case 'shield':
      px(8, 6, 16, 16, col);
      px(11, 22, 10, 4, col);
      px(13, 10, 6, 8, acc);
      break;
    case 'potion':
      px(10, 11, 12, 14, col);
      px(13, 5, 6, 6, '#e0f7fa');
      px(13, 13, 3, 5, '#ffffff');
      break;
    case 'food':
      px(7, 12, 18, 11, col);
      px(9, 10, 14, 4, '#ffe0b2');
      break;
    case 'ore':
      px(8, 8, 16, 16, '#6d6d75');
      px(10, 10, 5, 5, col);
      px(17, 15, 5, 5, col);
      px(12, 17, 4, 4, acc);
      break;
    case 'bar':
      px(6, 12, 20, 9, col);
      px(8, 10, 16, 3, acc);
      break;
    case 'gem':
      px(12, 5, 8, 4, col);
      px(8, 9, 16, 12, col);
      px(12, 21, 8, 5, col);
      px(12, 11, 4, 4, '#ffffff');
      break;
    case 'coin':
      px(9, 7, 14, 18, col);
      px(12, 10, 8, 12, acc);
      break;
    case 'fish':
      px(9, 11, 15, 10, col);
      px(5, 12, 4, 8, col);
      px(20, 14, 2, 2, '#111111');
      break;
    case 'rod':
      for (let i = 0; i < 18; i++) px(5 + i, 24 - i, 2, 2, col);
      px(23, 8, 1, 14, '#eeeeee');
      break;
    case 'hook':
      px(6, 20, 6, 6, col);
      px(16, 6, 10, 10, col);
      px(12, 14, 6, 6, '#90a4ae');
      break;
    case 'boss_summon':
      px(8, 8, 16, 16, col);
      px(12, 12, 8, 8, acc);
      px(14, 5, 4, 22, acc);
      break;
    case 'crystal':
      px(13, 4, 6, 24, col);
      px(8, 10, 16, 12, col);
      px(13, 8, 3, 6, '#ffffff');
      break;
    case 'herb':
      px(14, 14, 4, 12, '#4caf50');
      px(9, 7, 14, 9, col);
      break;
    case 'torch':
      px(14, 12, 4, 15, '#8d6e63');
      px(12, 5, 8, 8, col);
      px(14, 7, 4, 4, '#fff59d');
      break;
    case 'bag':
      px(7, 9, 18, 18, col);
      px(11, 6, 10, 4, '#ffd740');
      px(13, 14, 6, 6, acc);
      break;
    case 'mount':
    case 'pet':
      px(8, 10, 16, 14, col);
      px(12, 6, 8, 4, acc);
      px(12, 14, 3, 3, '#111111');
      px(18, 14, 3, 3, '#111111');
      break;
    case 'key':
      px(7, 11, 8, 8, col);
      px(15, 14, 11, 3, col);
      px(22, 17, 3, 4, col);
      break;
    case 'station':
      px(5, 10, 22, 14, col);
      px(7, 24, 4, 4, '#4a3525');
      px(21, 24, 4, 4, '#4a3525');
      break;
    case 'block':
    default:
      px(6, 6, 20, 20, col);
      px(6, 6, 20, 4, acc);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(6, 22, 20, 4);
      break;
  }

  const url = c.toDataURL();
  ICON_CACHE.set(item.id, url);
  return url;
}
