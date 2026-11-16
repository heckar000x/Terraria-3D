import { EvilType, WorldSize } from '@/types/game';
import { meshColumnSubchunks, NeighborColumnsData } from './ChunkMesher';
import { computeColumnLighting } from './Lighting';
import { TileUV } from './TextureAtlas';
import { GeneratedColumnData, WorldGenerator } from './WorldGen';

export interface WorkerInitMsg {
  type: 'init';
  seed: number;
  size: WorldSize;
  evilType: EvilType;
  isHardmode: boolean;
  uvEntries: [string, TileUV][];
}

export interface WorkerGenMsg {
  type: 'generate';
  requestId: number;
  cx: number;
  cz: number;
  deltas?: Record<number, number>;
}

export interface WorkerMeshMsg {
  type: 'mesh';
  requestId: number;
  cx: number;
  cz: number;
  blocks: Uint16Array;
  enableAO: boolean;
  subchunkFilter?: number;
}

type IncomingMsg = WorkerInitMsg | WorkerGenMsg | WorkerMeshMsg;

let generator: WorldGenerator | null = null;
const uvMap = new Map<string, TileUV>();

const lookupUV = (name: string): TileUV =>
  uvMap.get(name) ?? uvMap.get('stone') ?? { u0: 0, v0: 0, u1: 1, v1: 1 };

self.onmessage = (ev: MessageEvent<IncomingMsg>) => {
  const msg = ev.data;
  if (msg.type === 'init') {
    generator = new WorldGenerator(msg.seed, msg.size, msg.evilType, msg.isHardmode);
    uvMap.clear();
    for (const [k, v] of msg.uvEntries) {
      uvMap.set(k, v);
    }
    return;
  }

  if (msg.type === 'generate') {
    if (!generator) return;
    const col: GeneratedColumnData = generator.generateChunkColumn(msg.cx, msg.cz);
    if (msg.deltas) {
      for (const [idxStr, bid] of Object.entries(msg.deltas)) {
        col.blocks[Number(idxStr)] = bid;
      }
    }
    const lighting = computeColumnLighting(col.blocks);
    const meshes = meshColumnSubchunks(msg.cx, msg.cz, col.blocks, lighting, lookupUV, {}, true);

    const transfer: Transferable[] = [col.blocks.buffer, col.walls.buffer];
    for (const sub of meshes) {
      for (const part of [sub.solid, sub.cutout, sub.liquid]) {
        if (part) {
          transfer.push(
            part.positions.buffer,
            part.normals.buffer,
            part.uvs.buffer,
            part.colors.buffer,
            part.voxelLight.buffer,
            part.indices.buffer
          );
        }
      }
    }

    (self as unknown as Worker).postMessage(
      {
        type: 'generated',
        requestId: msg.requestId,
        cx: msg.cx,
        cz: msg.cz,
        blocks: col.blocks,
        walls: col.walls,
        chests: col.chests,
        meshes,
      },
      transfer
    );
    return;
  }

  if (msg.type === 'mesh') {
    const lighting = computeColumnLighting(msg.blocks);
    const meshes = meshColumnSubchunks(
      msg.cx,
      msg.cz,
      msg.blocks,
      lighting,
      lookupUV,
      {} as NeighborColumnsData,
      msg.enableAO,
      msg.subchunkFilter
    );
    const transfer: Transferable[] = [];
    for (const sub of meshes) {
      for (const part of [sub.solid, sub.cutout, sub.liquid]) {
        if (part) {
          transfer.push(
            part.positions.buffer,
            part.normals.buffer,
            part.uvs.buffer,
            part.colors.buffer,
            part.voxelLight.buffer,
            part.indices.buffer
          );
        }
      }
    }
    (self as unknown as Worker).postMessage(
      {
        type: 'meshed',
        requestId: msg.requestId,
        cx: msg.cx,
        cz: msg.cz,
        meshes,
      },
      transfer
    );
  }
};
