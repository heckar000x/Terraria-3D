import { getBlockDef } from '@/data/blocks';
import { BlockId, CHUNK_SIZE, WORLD_HEIGHT } from '@/types/game';
import { idxInColumn } from './WorldGen';

export interface ColumnLighting {
  sky: Uint8Array; // 0..15 per voxel
  r: Uint8Array;   // 0..15 per voxel
  g: Uint8Array;
  b: Uint8Array;
}

export function computeColumnLighting(
  blocks: Uint16Array,
  neighborCols?: {
    px?: Uint16Array;
    nx?: Uint16Array;
    pz?: Uint16Array;
    nz?: Uint16Array;
  }
): ColumnLighting {
  const len = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
  const sky = new Uint8Array(len);
  const r = new Uint8Array(len);
  const g = new Uint8Array(len);
  const b = new Uint8Array(len);

  const skyQueue: number[] = [];
  const lightQueue: number[] = [];

  // 1. Vertical Skylight Pass
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let curSky = 15;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const idx = idxInColumn(lx, y, lz);
        const bid = blocks[idx];
        if (bid !== BlockId.Air) {
          const def = getBlockDef(bid);
          if (def.opaque) {
            curSky = 0;
          } else if (def.liquidType === 1) {
            curSky = Math.max(0, curSky - 2);
          } else if (def.transparent && def.solid) {
            curSky = Math.max(0, curSky - 1);
          }
          if (def.lightEmit && def.lightEmit > 0) {
            const lc = def.lightColor ?? [1, 0.9, 0.75];
            const lr = Math.min(15, Math.round(def.lightEmit * lc[0]));
            const lg = Math.min(15, Math.round(def.lightEmit * lc[1]));
            const lb = Math.min(15, Math.round(def.lightEmit * lc[2]));
            r[idx] = Math.max(r[idx], lr);
            g[idx] = Math.max(g[idx], lg);
            b[idx] = Math.max(b[idx], lb);
            lightQueue.push(idx);
          }
        }
        sky[idx] = curSky;
      }
    }
  }

  // Seed skylight bleed ONLY at boundary voxels adjacent to shaded non-opaque air/transparent blocks
  // (Avoids queuing thousands of open-sky voxels above the surface, boosting lighting speed ~20x)
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let y = 28; y < 184; y++) {
        const idx = idxInColumn(lx, y, lz);
        const s = sky[idx];
        if (s <= 2) continue;
        const threshold = s - 1;
        const needBleed =
          (lx + 1 < CHUNK_SIZE && sky[idxInColumn(lx + 1, y, lz)] < threshold && !getBlockDef(blocks[idxInColumn(lx + 1, y, lz)]).opaque) ||
          (lx - 1 >= 0 && sky[idxInColumn(lx - 1, y, lz)] < threshold && !getBlockDef(blocks[idxInColumn(lx - 1, y, lz)]).opaque) ||
          (lz + 1 < CHUNK_SIZE && sky[idxInColumn(lx, y, lz + 1)] < threshold && !getBlockDef(blocks[idxInColumn(lx, y, lz + 1)]).opaque) ||
          (lz - 1 >= 0 && sky[idxInColumn(lx, y, lz - 1)] < threshold && !getBlockDef(blocks[idxInColumn(lx, y, lz - 1)]).opaque) ||
          (y > 0 && sky[idxInColumn(lx, y - 1, lz)] < threshold && !getBlockDef(blocks[idxInColumn(lx, y - 1, lz)]).opaque);
        if (needBleed) {
          skyQueue.push(idx);
        }
      }
    }
  }

  // Also absorb skylight from immediate horizontal neighbors if exposed at chunk border
  if (neighborCols) {
    const seedBorder = (nb: Uint16Array | undefined, lxSelf: number, lxNb: number, isZ: boolean) => {
      if (!nb) return;
      for (let t = 0; t < CHUNK_SIZE; t++) {
        let nbSky = 15;
        for (let y = WORLD_HEIGHT - 1; y >= 28; y--) {
          const nIdx = isZ ? idxInColumn(t, y, lxNb) : idxInColumn(lxNb, y, t);
          const nBid = nb[nIdx];
          if (nBid !== BlockId.Air && getBlockDef(nBid).opaque) nbSky = 0;
          if (nbSky > 2) {
            const sIdx = isZ ? idxInColumn(t, y, lxSelf) : idxInColumn(lxSelf, y, t);
            if (!getBlockDef(blocks[sIdx]).opaque && sky[sIdx] < nbSky - 1) {
              sky[sIdx] = nbSky - 1;
              skyQueue.push(sIdx);
            }
          }
        }
      }
    };
    seedBorder(neighborCols.px, CHUNK_SIZE - 1, 0, false);
    seedBorder(neighborCols.nx, 0, CHUNK_SIZE - 1, false);
    seedBorder(neighborCols.pz, CHUNK_SIZE - 1, 0, true);
    seedBorder(neighborCols.nz, 0, CHUNK_SIZE - 1, true);
  }

  // 2. Skylight Horizontal/Vertical Bleed BFS (limited passes for speed)
  let head = 0;
  while (head < skyQueue.length) {
    const idx = skyQueue[head++];
    const val = sky[idx];
    if (val <= 2) continue;

    const lx = idx & 15;
    const lz = (idx >> 4) & 15;
    const y = idx >> 8;

    const step = (nx: number, ny: number, nz: number) => {
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT) return;
      const nIdx = idxInColumn(nx, ny, nz);
      const def = getBlockDef(blocks[nIdx]);
      if (def.opaque) return;
      const atten = def.liquidType === 1 ? 2 : 1;
      const nextVal = val - atten;
      if (nextVal > sky[nIdx]) {
        sky[nIdx] = nextVal;
        skyQueue.push(nIdx);
      }
    };

    step(lx + 1, y, lz);
    step(lx - 1, y, lz);
    step(lx, y, lz + 1);
    step(lx, y, lz - 1);
    step(lx, y + 1, lz);
    step(lx, y - 1, lz);
  }

  // 3. Colored Block Light BFS (Torches, Lava, Mushrooms, Gems, Crystals)
  head = 0;
  while (head < lightQueue.length) {
    const idx = lightQueue[head++];
    const vr = r[idx];
    const vg = g[idx];
    const vb = b[idx];
    if (vr <= 1 && vg <= 1 && vb <= 1) continue;

    const lx = idx & 15;
    const lz = (idx >> 4) & 15;
    const y = idx >> 8;

    const step = (nx: number, ny: number, nz: number) => {
      if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT) return;
      const nIdx = idxInColumn(nx, ny, nz);
      const def = getBlockDef(blocks[nIdx]);
      const drop = def.opaque ? 2 : 1; // let light illuminate one block into surface wall faces!
      const nr = Math.max(0, vr - drop);
      const ng = Math.max(0, vg - drop);
      const nb = Math.max(0, vb - drop);
      let updated = false;
      if (nr > r[nIdx]) { r[nIdx] = nr; updated = true; }
      if (ng > g[nIdx]) { g[nIdx] = ng; updated = true; }
      if (nb > b[nIdx]) { b[nIdx] = nb; updated = true; }
      if (updated && !def.opaque) {
        lightQueue.push(nIdx);
      }
    };

    step(lx + 1, y, lz);
    step(lx - 1, y, lz);
    step(lx, y, lz + 1);
    step(lx, y, lz - 1);
    step(lx, y + 1, lz);
    step(lx, y - 1, lz);
  }

  return { sky, r, g, b };
}
