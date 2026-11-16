import { getBlockDef } from '@/data/blocks';
import { BlockId, CHUNK_SIZE, VERTICAL_CHUNKS, WORLD_HEIGHT } from '@/types/game';
import { ColumnLighting } from './Lighting';
import { TileUV } from './TextureAtlas';
import { idxInColumn } from './WorldGen';

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  voxelLight: Float32Array;
  indices: Uint32Array;
}

export interface SubchunkMeshResult {
  cy: number;
  solid: MeshBuffers | null;
  cutout: MeshBuffers | null;
  liquid: MeshBuffers | null;
}

class MeshBuilder {
  private pos: number[] = [];
  private norm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private vlight: number[] = [];
  private idx: number[] = [];
  private vertCount = 0;

  addQuad(
    corners: [number, number, number][],
    normal: [number, number, number],
    tileUv: TileUV,
    ao: [number, number, number, number],
    lights: [number, number, number, number][], // 4 * [sky, r, g, b]
    tint: [number, number, number] = [1, 1, 1],
    flipDiag = false
  ): void {
    const uvCoords: [number, number][] = [
      [tileUv.u0, tileUv.v0],
      [tileUv.u1, tileUv.v0],
      [tileUv.u1, tileUv.v1],
      [tileUv.u0, tileUv.v1],
    ];

    const base = this.vertCount;
    for (let i = 0; i < 4; i++) {
      this.pos.push(corners[i][0], corners[i][1], corners[i][2]);
      this.norm.push(normal[0], normal[1], normal[2]);
      this.uv.push(uvCoords[i][0], uvCoords[i][1]);
      this.col.push(ao[i] * tint[0], ao[i] * tint[1], ao[i] * tint[2]);
      this.vlight.push(lights[i][0], lights[i][1], lights[i][2], lights[i][3]);
    }

    if (flipDiag) {
      this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base + 0);
    } else {
      this.idx.push(base + 0, base + 1, base + 2, base + 0, base + 2, base + 3);
    }
    this.vertCount += 4;
  }

  addBox(
    x0: number, y0: number, z0: number,
    x1: number, y1: number, z1: number,
    uvTop: TileUV, uvSide: TileUV, uvBot: TileUV,
    light: [number, number, number, number],
    tint: [number, number, number] = [1, 1, 1]
  ): void {
    const ao: [number, number, number, number] = [1, 1, 1, 1];
    const ls: [number, number, number, number][] = [light, light, light, light];
    // +X
    this.addQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], uvSide, ao, ls, tint);
    // -X
    this.addQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uvSide, ao, ls, tint);
    // +Y
    this.addQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uvTop, ao, ls, tint);
    // -Y
    this.addQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], uvBot, ao, ls, tint);
    // +Z
    this.addQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uvSide, ao, ls, tint);
    // -Z
    this.addQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uvSide, ao, ls, tint);
  }

  build(): MeshBuffers | null {
    if (this.vertCount === 0) return null;
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.norm),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.col),
      voxelLight: new Float32Array(this.vlight),
      indices: new Uint32Array(this.idx),
    };
  }
}

export interface NeighborColumnsData {
  px?: { blocks: Uint16Array; lighting: ColumnLighting };
  nx?: { blocks: Uint16Array; lighting: ColumnLighting };
  pz?: { blocks: Uint16Array; lighting: ColumnLighting };
  nz?: { blocks: Uint16Array; lighting: ColumnLighting };
}

const AO_TABLE = [1.0, 0.8, 0.65, 0.5];

export function meshColumnSubchunks(
  cx: number,
  cz: number,
  blocks: Uint16Array,
  lighting: ColumnLighting,
  uvLookup: (tileName: string) => TileUV,
  neighbors: NeighborColumnsData = {},
  enableAO = true,
  subchunkFilter?: number
): SubchunkMeshResult[] {
  const results: SubchunkMeshResult[] = [];

  const getBlock = (lx: number, y: number, lz: number): number => {
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return blocks[idxInColumn(lx, y, lz)];
    }
    if (lx >= CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && neighbors.px) {
      return neighbors.px.blocks[idxInColumn(lx - CHUNK_SIZE, y, lz)];
    }
    if (lx < 0 && lz >= 0 && lz < CHUNK_SIZE && neighbors.nx) {
      return neighbors.nx.blocks[idxInColumn(lx + CHUNK_SIZE, y, lz)];
    }
    if (lz >= CHUNK_SIZE && lx >= 0 && lx < CHUNK_SIZE && neighbors.pz) {
      return neighbors.pz.blocks[idxInColumn(lx, y, lz - CHUNK_SIZE)];
    }
    if (lz < 0 && lx >= 0 && lx < CHUNK_SIZE && neighbors.nz) {
      return neighbors.nz.blocks[idxInColumn(lx, y, lz + CHUNK_SIZE)];
    }
    return BlockId.Air;
  };

  const getLight = (lx: number, y: number, lz: number): [number, number, number, number] => {
    if (y < 0) return [0, 0, 0, 0];
    if (y >= WORLD_HEIGHT) return [1, 0, 0, 0];
    let src: ColumnLighting = lighting;
    let rx = lx;
    let rz = lz;
    if (lx >= CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && neighbors.px) {
      src = neighbors.px.lighting;
      rx = lx - CHUNK_SIZE;
    } else if (lx < 0 && lz >= 0 && lz < CHUNK_SIZE && neighbors.nx) {
      src = neighbors.nx.lighting;
      rx = lx + CHUNK_SIZE;
    } else if (lz >= CHUNK_SIZE && lx >= 0 && lx < CHUNK_SIZE && neighbors.pz) {
      src = neighbors.pz.lighting;
      rz = lz - CHUNK_SIZE;
    } else if (lz < 0 && lx >= 0 && lx < CHUNK_SIZE && neighbors.nz) {
      src = neighbors.nz.lighting;
      rz = lz + CHUNK_SIZE;
    } else if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
      return [y > 134 ? 1 : 0.1, 0, 0, 0];
    }
    const i = idxInColumn(rx, y, rz);
    return [src.sky[i] / 15, src.r[i] / 15, src.g[i] / 15, src.b[i] / 15];
  };

  const isOpaque = (lx: number, y: number, lz: number): boolean => {
    const b = getBlock(lx, y, lz);
    return b !== BlockId.Air && getBlockDef(b).opaque;
  };

  const calcAO = (s1: boolean, s2: boolean, c: boolean): number => {
    if (!enableAO) return 1.0;
    if (s1 && s2) return AO_TABLE[3];
    const occ = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (c ? 1 : 0);
    return AO_TABLE[occ];
  };

  const startCY = subchunkFilter !== undefined ? subchunkFilter : 0;
  const endCY = subchunkFilter !== undefined ? subchunkFilter : VERTICAL_CHUNKS - 1;

  for (let cy = startCY; cy <= endCY; cy++) {
    const yStart = cy * CHUNK_SIZE;
    const yEnd = yStart + CHUNK_SIZE;
    const solid = new MeshBuilder();
    const cutout = new MeshBuilder();
    const liquid = new MeshBuilder();

    for (let y = yStart; y < yEnd; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const bid = blocks[idxInColumn(lx, y, lz)];
          if (bid === BlockId.Air) continue;
          const def = getBlockDef(bid);
          const wx = cx * CHUNK_SIZE + lx;
          const wz = cz * CHUNK_SIZE + lz;

          if (def.renderMode === 'liquid') {
            const topBlock = getBlock(lx, y + 1, lz);
            const sameAbove = topBlock === bid;
            const topH = sameAbove ? 1.0 : 0.88;
            const uv = uvLookup(def.tileTop);
            const l = getLight(lx, y, lz);
            const lUp = getLight(lx, Math.min(WORLD_HEIGHT - 1, y + 1), lz);
            const useL = [
              Math.max(l[0], lUp[0]),
              Math.max(l[1], lUp[1]),
              Math.max(l[2], lUp[2]),
              Math.max(l[3], lUp[3]),
            ] as [number, number, number, number];
            const ls: [number, number, number, number][] = [useL, useL, useL, useL];
            const ao: [number, number, number, number] = [1, 1, 1, 1];
            const x0 = wx, x1 = wx + 1, y0 = y, y1 = y + topH, z0 = wz, z1 = wz + 1;

            if (!sameAbove && !isOpaque(lx, y + 1, lz)) {
              liquid.addQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uv, ao, ls);
            }
            const sideVisible = (nx: number, ny: number, nz: number) => {
              const nb = getBlock(nx, ny, nz);
              return nb !== bid && !getBlockDef(nb).opaque;
            };
            if (sideVisible(lx + 1, y, lz)) {
              liquid.addQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], uv, ao, ls);
            }
            if (sideVisible(lx - 1, y, lz)) {
              liquid.addQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uv, ao, ls);
            }
            if (sideVisible(lx, y, lz + 1)) {
              liquid.addQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uv, ao, ls);
            }
            if (sideVisible(lx, y, lz - 1)) {
              liquid.addQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uv, ao, ls);
            }
            continue;
          }

          if (def.renderMode === 'cross') {
            const uv = uvLookup(def.tileSide);
            const l = getLight(lx, y, lz);
            const ls: [number, number, number, number][] = [l, l, l, l];
            const ao: [number, number, number, number] = [1, 1, 1, 1];
            const x0 = wx + 0.12, x1 = wx + 0.88, z0 = wz + 0.12, z1 = wz + 0.88, y0 = y, y1 = y + 0.9;
            cutout.addQuad([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], [0, 1, 0], uv, ao, ls);
            cutout.addQuad([[x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1]], [0, 1, 0], uv, ao, ls);
            cutout.addQuad([[x0, y0, z1], [x1, y0, z0], [x1, y1, z0], [x0, y1, z1]], [0, 1, 0], uv, ao, ls);
            cutout.addQuad([[x1, y0, z0], [x0, y0, z1], [x0, y1, z1], [x1, y1, z0]], [0, 1, 0], uv, ao, ls);
            continue;
          }

          if (def.renderMode === 'torch') {
            const uv = uvLookup(def.tileSide);
            const l = getLight(lx, y, lz);
            cutout.addBox(wx + 0.42, y, wz + 0.42, wx + 0.58, y + 0.68, wz + 0.58, uv, uv, uv, l);
            continue;
          }

          if (def.renderMode === 'crystal') {
            const uv = uvLookup(def.tileSide);
            const l = getLight(lx, y, lz);
            cutout.addBox(wx + 0.28, y, wz + 0.28, wx + 0.72, y + 0.85, wz + 0.72, uv, uv, uv, l);
            cutout.addBox(wx + 0.16, y + 0.1, wz + 0.36, wx + 0.84, y + 0.55, wz + 0.64, uv, uv, uv, l);
            continue;
          }

          if (def.renderMode === 'slab') {
            const uvTop = uvLookup(def.tileTop);
            const uvSide = uvLookup(def.tileSide);
            const l = getLight(lx, y, lz);
            const y0 = bid === BlockId.WoodPlatform ? y + 0.72 : y;
            const y1 = bid === BlockId.WoodPlatform ? y + 1.0 : y + 0.5;
            solid.addBox(wx, y0, wz, wx + 1, y1, wz + 1, uvTop, uvSide, uvTop, l);
            continue;
          }

          if (def.renderMode === 'chest' || def.renderMode === 'station') {
            const uvTop = uvLookup(def.tileTop);
            const uvSide = uvLookup(def.tileSide);
            const uvBot = uvLookup(def.tileBottom);
            const l = getLight(lx, y, lz);
            const pad = def.renderMode === 'chest' ? 0.08 : 0.05;
            const h = def.renderMode === 'chest' ? 0.85 : 0.92;
            solid.addBox(wx + pad, y, wz + pad, wx + 1 - pad, y + h, wz + 1 - pad, uvTop, uvSide, uvBot, l);
            continue;
          }

          if (def.renderMode === 'door') {
            const uv = uvLookup(def.tileSide);
            const l = getLight(lx, y, lz);
            if (def.solid) {
              solid.addBox(wx, y, wz + 0.38, wx + 1, y + 1, wz + 0.62, uv, uv, uv, l);
            } else {
              cutout.addBox(wx, y, wz, wx + 0.22, y + 1, wz + 1, uv, uv, uv, l);
            }
            continue;
          }

          // Standard Full Cube with Hidden-Face Culling & 4-Corner Smooth Voxel AO
          const target = def.transparent ? cutout : solid;
          const uvTop = uvLookup(def.tileTop);
          const uvSide = uvLookup(def.tileSide);
          const uvBot = uvLookup(def.tileBottom);
          const x0 = wx, x1 = wx + 1, y0 = y, y1 = y + 1, z0 = wz, z1 = wz + 1;

          const showFace = (nx: number, ny: number, nz: number): boolean => {
            const nb = getBlock(nx, ny, nz);
            if (nb === BlockId.Air) return true;
            const nd = getBlockDef(nb);
            if (def.transparent && nb === bid) return false;
            return !nd.opaque;
          };

          // +X
          if (showFace(lx + 1, y, lz)) {
            const l = getLight(lx + 1, y, lz);
            const ao0 = calcAO(isOpaque(lx + 1, y - 1, lz), isOpaque(lx + 1, y, lz + 1), isOpaque(lx + 1, y - 1, lz + 1));
            const ao1 = calcAO(isOpaque(lx + 1, y - 1, lz), isOpaque(lx + 1, y, lz - 1), isOpaque(lx + 1, y - 1, lz - 1));
            const ao2 = calcAO(isOpaque(lx + 1, y + 1, lz), isOpaque(lx + 1, y, lz - 1), isOpaque(lx + 1, y + 1, lz - 1));
            const ao3 = calcAO(isOpaque(lx + 1, y + 1, lz), isOpaque(lx + 1, y, lz + 1), isOpaque(lx + 1, y + 1, lz + 1));
            target.addQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], uvSide, [ao0, ao1, ao2, ao3], [l, l, l, l], [0.92, 0.92, 0.92], ao0 + ao2 < ao1 + ao3);
          }
          // -X
          if (showFace(lx - 1, y, lz)) {
            const l = getLight(lx - 1, y, lz);
            const ao0 = calcAO(isOpaque(lx - 1, y - 1, lz), isOpaque(lx - 1, y, lz - 1), isOpaque(lx - 1, y - 1, lz - 1));
            const ao1 = calcAO(isOpaque(lx - 1, y - 1, lz), isOpaque(lx - 1, y, lz + 1), isOpaque(lx - 1, y - 1, lz + 1));
            const ao2 = calcAO(isOpaque(lx - 1, y + 1, lz), isOpaque(lx - 1, y, lz + 1), isOpaque(lx - 1, y + 1, lz + 1));
            const ao3 = calcAO(isOpaque(lx - 1, y + 1, lz), isOpaque(lx - 1, y, lz - 1), isOpaque(lx - 1, y + 1, lz - 1));
            target.addQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], uvSide, [ao0, ao1, ao2, ao3], [l, l, l, l], [0.88, 0.88, 0.88], ao0 + ao2 < ao1 + ao3);
          }
          // +Y
          if (showFace(lx, y + 1, lz)) {
            const l = getLight(lx, y + 1, lz);
            const ao0 = calcAO(isOpaque(lx - 1, y + 1, lz), isOpaque(lx, y + 1, lz + 1), isOpaque(lx - 1, y + 1, lz + 1));
            const ao1 = calcAO(isOpaque(lx + 1, y + 1, lz), isOpaque(lx, y + 1, lz + 1), isOpaque(lx + 1, y + 1, lz + 1));
            const ao2 = calcAO(isOpaque(lx + 1, y + 1, lz), isOpaque(lx, y + 1, lz - 1), isOpaque(lx + 1, y + 1, lz - 1));
            const ao3 = calcAO(isOpaque(lx - 1, y + 1, lz), isOpaque(lx, y + 1, lz - 1), isOpaque(lx - 1, y + 1, lz - 1));
            target.addQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], uvTop, [ao0, ao1, ao2, ao3], [l, l, l, l], [1, 1, 1], ao0 + ao2 < ao1 + ao3);
          }
          // -Y
          if (showFace(lx, y - 1, lz)) {
            const l = getLight(lx, y - 1, lz);
            const ao0 = calcAO(isOpaque(lx - 1, y - 1, lz), isOpaque(lx, y - 1, lz - 1), isOpaque(lx - 1, y - 1, lz - 1));
            const ao1 = calcAO(isOpaque(lx + 1, y - 1, lz), isOpaque(lx, y - 1, lz - 1), isOpaque(lx + 1, y - 1, lz - 1));
            const ao2 = calcAO(isOpaque(lx + 1, y - 1, lz), isOpaque(lx, y - 1, lz + 1), isOpaque(lx + 1, y - 1, lz + 1));
            const ao3 = calcAO(isOpaque(lx - 1, y - 1, lz), isOpaque(lx, y - 1, lz + 1), isOpaque(lx - 1, y - 1, lz + 1));
            target.addQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], uvBot, [ao0, ao1, ao2, ao3], [l, l, l, l], [0.76, 0.76, 0.76], ao0 + ao2 < ao1 + ao3);
          }
          // +Z
          if (showFace(lx, y, lz + 1)) {
            const l = getLight(lx, y, lz + 1);
            const ao0 = calcAO(isOpaque(lx - 1, y, lz + 1), isOpaque(lx, y - 1, lz + 1), isOpaque(lx - 1, y - 1, lz + 1));
            const ao1 = calcAO(isOpaque(lx + 1, y, lz + 1), isOpaque(lx, y - 1, lz + 1), isOpaque(lx + 1, y - 1, lz + 1));
            const ao2 = calcAO(isOpaque(lx + 1, y, lz + 1), isOpaque(lx, y + 1, lz + 1), isOpaque(lx + 1, y + 1, lz + 1));
            const ao3 = calcAO(isOpaque(lx - 1, y, lz + 1), isOpaque(lx, y + 1, lz + 1), isOpaque(lx - 1, y + 1, lz + 1));
            target.addQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uvSide, [ao0, ao1, ao2, ao3], [l, l, l, l], [0.95, 0.95, 0.95], ao0 + ao2 < ao1 + ao3);
          }
          // -Z
          if (showFace(lx, y, lz - 1)) {
            const l = getLight(lx, y, lz - 1);
            const ao0 = calcAO(isOpaque(lx + 1, y, lz - 1), isOpaque(lx, y - 1, lz - 1), isOpaque(lx + 1, y - 1, lz - 1));
            const ao1 = calcAO(isOpaque(lx - 1, y, lz - 1), isOpaque(lx, y - 1, lz - 1), isOpaque(lx - 1, y - 1, lz - 1));
            const ao2 = calcAO(isOpaque(lx - 1, y, lz - 1), isOpaque(lx, y + 1, lz - 1), isOpaque(lx - 1, y + 1, lz - 1));
            const ao3 = calcAO(isOpaque(lx + 1, y, lz - 1), isOpaque(lx, y + 1, lz - 1), isOpaque(lx + 1, y + 1, lz - 1));
            target.addQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uvSide, [ao0, ao1, ao2, ao3], [l, l, l, l], [0.85, 0.85, 0.85], ao0 + ao2 < ao1 + ao3);
          }
        }
      }
    }

    results.push({
      cy,
      solid: solid.build(),
      cutout: cutout.build(),
      liquid: liquid.build(),
    });
  }

  return results;
}
