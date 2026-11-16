import * as THREE from 'three';
import { getBlockDef, isLiquidBlock, isSolidBlock } from '@/data/blocks';
import { generateChestItems } from '@/data/lootTables';
import {
  BiomeId,
  BlockId,
  CHUNK_SIZE,
  ChestContents,
  ChunkDeltaRecord,
  ItemStack,
  VERTICAL_CHUNKS,
  WORLD_HEIGHT,
  WorldMeta,
} from '@/types/game';
import { MeshBuffers, meshColumnSubchunks, SubchunkMeshResult } from './ChunkMesher';
import { ColumnLighting, computeColumnLighting } from './Lighting';
import { mulberry32 } from './Noise';
import { TextureAtlas } from './TextureAtlas';
import { GeneratedChestSpawn, idxInColumn, WorldGenerator } from './WorldGen';
import ChunkWorker from './ChunkWorker.ts?worker&inline';

export interface ColumnEntry {
  cx: number;
  cz: number;
  blocks: Uint16Array;
  walls: Uint8Array;
  lighting?: ColumnLighting;
  group?: THREE.Group;
  subMeshes: { solid?: THREE.Mesh; cutout?: THREE.Mesh; liquid?: THREE.Mesh }[];
  dirtySubchunks: Set<number>;
  lastTouched: number;
}

export interface RaycastHit {
  hit: boolean;
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
  blockId: BlockId;
  distance: number;
}

export interface VoxelShaderUniforms {
  uSkyLightTint: { value: THREE.Color };
  uMinCaveLight: { value: number };
  uHeldLightPos: { value: THREE.Vector3 };
  uHeldLightColor: { value: THREE.Color };
  uHeldLightRadius: { value: number };
  uTime: { value: number };
  uCameraPos: { value: THREE.Vector3 };
}

export class WorldManager {
  public meta: WorldMeta;
  public generator: WorldGenerator;
  public columns = new Map<string, ColumnEntry>();
  public chunkDeltas: Record<string, ChunkDeltaRecord>;
  public chests: Record<string, ChestContents>;
  public exploredChunks = new Set<string>();

  private scene: THREE.Scene | null = null;
  private atlas: TextureAtlas | null = null;
  private solidMat: THREE.MeshLambertMaterial | null = null;
  private cutoutMat: THREE.MeshLambertMaterial | null = null;
  private liquidMat: THREE.MeshLambertMaterial | null = null;
  public shaderUniforms: VoxelShaderUniforms = {
    uSkyLightTint: { value: new THREE.Color(1, 1, 1) },
    uMinCaveLight: { value: 0.06 },
    uHeldLightPos: { value: new THREE.Vector3(0, 140, 0) },
    uHeldLightColor: { value: new THREE.Color(1, 0.85, 0.55) },
    uHeldLightRadius: { value: 12 },
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3(0, 145, 0) },
  };

  private workers: Worker[] = [];
  private pendingGen = new Set<string>();
  private pendingMeshApplies: { col: ColumnEntry; meshes: SubchunkMeshResult[] }[] = [];
  private lastShadowChunkKey = '';
  private shadowCenterCx = 0;
  private shadowCenterCz = 0;
  private nextWorker = 0;
  private reqId = 1;
  private activeLiquidQueue: [number, number, number][] = [];
  private liquidTickAccum = 0;
  private timerAccum = 0;
  public activeTimers: [number, number, number][] = [];
  public enableAO = true;
  public enableShadows = true;

  public onExplosion?: (x: number, y: number, z: number, radius: number, damage: number) => void;
  public onDartTrapFire?: (x: number, y: number, z: number) => void;
  public onSpecialBlockTriggered?: (kind: 'shadow_orb' | 'crimson_heart' | 'altar_smashed' | 'life_crystal' | 'plantera_bulb' | 'larva', x: number, y: number, z: number) => void;

  constructor(
    meta: WorldMeta,
    chunkDeltas: Record<string, ChunkDeltaRecord> = {},
    chests: Record<string, ChestContents> = {},
    exploredChunks: string[] = []
  ) {
    this.meta = meta;
    this.chunkDeltas = chunkDeltas;
    this.chests = chests;
    for (const k of exploredChunks) this.exploredChunks.add(k);
    this.generator = new WorldGenerator(meta.seed, meta.size, meta.evilType, meta.isHardmode);
  }

  public initRenderer(scene: THREE.Scene, enableAO = true, enableShadows = true): void {
    this.scene = scene;
    this.enableAO = enableAO;
    this.enableShadows = enableShadows;
    this.atlas = new TextureAtlas();

    const createVoxelMaterial = (
      mode: 'solid' | 'cutout' | 'liquid',
      opts: THREE.MeshLambertMaterialParameters
    ) => {
      const mat = new THREE.MeshLambertMaterial(opts);
      mat.customProgramCacheKey = () => `terraria_voxel_${mode}`;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSkyLightTint = this.shaderUniforms.uSkyLightTint;
        shader.uniforms.uMinCaveLight = this.shaderUniforms.uMinCaveLight;
        shader.uniforms.uHeldLightPos = this.shaderUniforms.uHeldLightPos;
        shader.uniforms.uHeldLightColor = this.shaderUniforms.uHeldLightColor;
        shader.uniforms.uHeldLightRadius = this.shaderUniforms.uHeldLightRadius;
        shader.uniforms.uTime = this.shaderUniforms.uTime;
        shader.uniforms.uCameraPos = this.shaderUniforms.uCameraPos;

        let vertExtras = '';
        if (mode === 'cutout') {
          vertExtras = `
            float swayMask = smoothstep(0.15, 0.9, fract(position.y + 0.01));
            float windWave = sin(uTime * 2.1 + position.x * 0.75 + position.z * 0.65);
            transformed.x += windWave * 0.035 * swayMask;
            transformed.z += cos(uTime * 1.7 + position.z * 0.8) * 0.025 * swayMask;
          `;
        } else if (mode === 'liquid') {
          vertExtras = `
            float isTopVert = step(0.45, fract(position.y + 0.001));
            float wave = sin(position.x * 1.45 + uTime * 2.5) * 0.048 + cos(position.z * 1.35 + uTime * 2.0) * 0.038;
            transformed.y += wave * isTopVert;
          `;
        }

        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform float uTime;\nattribute vec4 aVoxelLight;\nvarying vec4 vVoxelLight;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;'
          )
          .replace(
            '#include <color_vertex>',
            '#include <color_vertex>\nvVoxelLight = aVoxelLight;\nvWorldNormal = normalize(mat3(modelMatrix) * normal);'
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\n${vertExtras}\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
          );

        const liquidSpec =
          mode === 'liquid'
            ? `
            vec3 viewDirW = normalize(uCameraPos - vWorldPos);
            float fresnel = pow(1.0 - max(0.0, dot(viewDirW, normalize(vWorldNormal))), 3.0);
            float ripple = sin(vWorldPos.x * 3.1 + uTime * 3.2) * cos(vWorldPos.z * 2.9 - uTime * 2.6);
            outgoingLight += vec3(0.32, 0.56, 0.72) * (fresnel * 0.55 + max(0.0, ripple) * 0.14) * max(0.25, vVoxelLight.x);
            `
            : '';

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nuniform vec3 uSkyLightTint;\nuniform float uMinCaveLight;\nuniform vec3 uHeldLightPos;\nuniform vec3 uHeldLightColor;\nuniform float uHeldLightRadius;\nuniform float uTime;\nuniform vec3 uCameraPos;\nvarying vec4 vVoxelLight;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;'
          )
          .replace(
            'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
            `
            vec3 voxelSky = vVoxelLight.x * uSkyLightTint;
            vec3 voxelBlock = vVoxelLight.yzw * 1.18;
            float heldDist = distance(vWorldPos, uHeldLightPos);
            float heldAtten = clamp(1.0 - heldDist / max(1.0, uHeldLightRadius), 0.0, 1.0);
            vec3 heldGlow = uHeldLightColor * (heldAtten * heldAtten * 0.95);
            vec3 skyFill = vec3(0.76, 0.84, 0.98) * max(voxelSky, vec3(uMinCaveLight));
            vec3 voxelLight = max(max(skyFill, voxelBlock), heldGlow);
            vec3 outgoingLight = reflectedLight.directDiffuse * (vVoxelLight.x * 1.12) + reflectedLight.indirectDiffuse * voxelLight + diffuseColor.rgb * (voxelBlock * 0.48 + heldGlow * 0.55) + totalEmissiveRadiance;
            ${liquidSpec}
            `
          );
      };
      return mat;
    };

    this.solidMat = createVoxelMaterial('solid', {
      map: this.atlas.texture,
      vertexColors: true,
      side: THREE.FrontSide,
    });

    this.cutoutMat = createVoxelMaterial('cutout', {
      map: this.atlas.texture,
      vertexColors: true,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
    });

    this.liquidMat = createVoxelMaterial('liquid', {
      map: this.atlas.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.initWorkers();
  }

  private initWorkers(): void {
    if (typeof Worker === 'undefined' || !this.atlas) return;
    try {
      const uvEntries = Array.from(this.atlas.uvMap.entries());
      for (let i = 0; i < 2; i++) {
        const w = new ChunkWorker();
        w.postMessage({
          type: 'init',
          seed: this.meta.seed,
          size: this.meta.size,
          evilType: this.meta.evilType,
          isHardmode: this.meta.isHardmode,
          uvEntries,
        });
        w.onmessage = (ev: MessageEvent) => this.handleWorkerMessage(ev.data);
        this.workers.push(w);
      }
    } catch {
      this.workers = [];
    }
  }

  private handleWorkerMessage(msg: any): void {
    const key = `${msg.cx},${msg.cz}`;
    if (msg.type === 'generated') {
      this.pendingGen.delete(key);
      if (this.columns.has(key)) return;
      const col = this.registerColumnData(msg.cx, msg.cz, msg.blocks, msg.walls, msg.chests);
      this.pendingMeshApplies.push({ col, meshes: msg.meshes });
    } else if (msg.type === 'meshed') {
      const col = this.columns.get(key);
      if (col) {
        this.pendingMeshApplies.push({ col, meshes: msg.meshes });
      }
    }
  }

  private getNeighborColumnsData(cx: number, cz: number) {
    const px = this.columns.get(this.colKey(cx + 1, cz));
    const nx = this.columns.get(this.colKey(cx - 1, cz));
    const pz = this.columns.get(this.colKey(cx, cz + 1));
    const nz = this.columns.get(this.colKey(cx, cz - 1));
    return {
      px: px && px.lighting ? { blocks: px.blocks, lighting: px.lighting } : undefined,
      nx: nx && nx.lighting ? { blocks: nx.blocks, lighting: nx.lighting } : undefined,
      pz: pz && pz.lighting ? { blocks: pz.blocks, lighting: pz.lighting } : undefined,
      nz: nz && nz.lighting ? { blocks: nz.blocks, lighting: nz.lighting } : undefined,
    };
  }

  public colKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public getColumnSync(cx: number, cz: number): ColumnEntry {
    const key = this.colKey(cx, cz);
    const existing = this.columns.get(key);
    if (existing) {
      existing.lastTouched = performance.now();
      return existing;
    }
    const gen = this.generator.generateChunkColumn(cx, cz);
    const delta = this.chunkDeltas[key];
    if (delta) {
      for (const [idxStr, bid] of Object.entries(delta.blocks)) {
        gen.blocks[Number(idxStr)] = bid;
      }
    }
    const col = this.registerColumnData(cx, cz, gen.blocks, gen.walls, gen.chests);
    if (this.scene && this.atlas) {
      col.lighting = computeColumnLighting(col.blocks);
      const meshes = meshColumnSubchunks(cx, cz, col.blocks, col.lighting, (n) => this.atlas!.getUV(n), this.getNeighborColumnsData(cx, cz), this.enableAO);
      this.applyMeshesToColumn(col, meshes);
    }
    return col;
  }

  public requestColumnAsync(cx: number, cz: number): void {
    const key = this.colKey(cx, cz);
    if (this.columns.has(key) || this.pendingGen.has(key)) return;
    if (this.workers.length === 0) {
      this.getColumnSync(cx, cz);
      return;
    }
    this.pendingGen.add(key);
    const w = this.workers[this.nextWorker++ % this.workers.length];
    const delta = this.chunkDeltas[key]?.blocks;
    w.postMessage({
      type: 'generate',
      requestId: this.reqId++,
      cx,
      cz,
      deltas: delta,
    });
  }

  private registerColumnData(
    cx: number,
    cz: number,
    blocks: Uint16Array,
    walls: Uint8Array,
    chestSpawns: GeneratedChestSpawn[]
  ): ColumnEntry {
    const key = this.colKey(cx, cz);
    this.exploredChunks.add(key);
    for (const c of chestSpawns) {
      const ck = `${c.x},${c.y},${c.z}`;
      if (!this.chests[ck]) {
        const bAt = blocks[idxInColumn(c.x - cx * CHUNK_SIZE, c.y, c.z - cz * CHUNK_SIZE)];
        if (getBlockDef(bAt).isContainer) {
          const rng = mulberry32(this.meta.seed ^ (c.x * 73856093) ^ (c.y * 19349663) ^ (c.z * 83492791));
          this.chests[ck] = { x: c.x, y: c.y, z: c.z, items: generateChestItems(c.lootKind, rng) };
        }
      }
    }

    const col: ColumnEntry = {
      cx,
      cz,
      blocks,
      walls,
      subMeshes: Array.from({ length: VERTICAL_CHUNKS }, () => ({})),
      dirtySubchunks: new Set(),
      lastTouched: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    this.columns.set(key, col);
    return col;
  }

  private createBufferGeometry(buf: MeshBuffers): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(buf.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(buf.colors, 3));
    geo.setAttribute('aVoxelLight', new THREE.BufferAttribute(buf.voxelLight, 4));
    geo.setIndex(new THREE.BufferAttribute(buf.indices, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  private applyMeshesToColumn(col: ColumnEntry, results: SubchunkMeshResult[]): void {
    if (!this.scene || !this.solidMat || !this.cutoutMat || !this.liquidMat) return;
    if (!col.group) {
      col.group = new THREE.Group();
      this.scene.add(col.group);
    }

    const inShadowRange =
      Math.abs(col.cx - this.shadowCenterCx) <= 3 && Math.abs(col.cz - this.shadowCenterCz) <= 3;

    for (const sub of results) {
      const slot = col.subMeshes[sub.cy];
      const updateLayer = (
        key: 'solid' | 'cutout' | 'liquid',
        buf: MeshBuffers | null,
        mat: THREE.MeshLambertMaterial,
        allowCastShadow: boolean
      ) => {
        if (slot[key]) {
          col.group!.remove(slot[key]!);
          slot[key]!.geometry.dispose();
          slot[key] = undefined;
        }
        if (buf) {
          const geo = this.createBufferGeometry(buf);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = allowCastShadow && this.enableShadows && inShadowRange && sub.cy >= 5;
          mesh.receiveShadow = this.enableShadows && sub.cy >= 5;
          col.group!.add(mesh);
          slot[key] = mesh;
        }
      };

      updateLayer('solid', sub.solid, this.solidMat, true);
      updateLayer('cutout', sub.cutout, this.cutoutMat, false);
      updateLayer('liquid', sub.liquid, this.liquidMat, false);
    }
  }

  public refreshShadowCasters(pcx: number, pcz: number): void {
    this.shadowCenterCx = pcx;
    this.shadowCenterCz = pcz;
    for (const col of this.columns.values()) {
      const inRange = Math.abs(col.cx - pcx) <= 3 && Math.abs(col.cz - pcz) <= 3;
      for (let cy = 0; cy < col.subMeshes.length; cy++) {
        const slot = col.subMeshes[cy];
        if (slot.solid) {
          slot.solid.castShadow = this.enableShadows && inRange && cy >= 5;
          slot.solid.receiveShadow = this.enableShadows && cy >= 5;
        }
        if (slot.cutout) {
          slot.cutout.receiveShadow = this.enableShadows && cy >= 5;
        }
      }
    }
  }

  public updateStreaming(playerX: number, playerZ: number, renderDist: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    this.shadowCenterCx = pcx;
    this.shadowCenterCz = pcz;

    const shadowKey = `${pcx},${pcz},${this.enableShadows}`;
    if (shadowKey !== this.lastShadowChunkKey) {
      this.lastShadowChunkKey = shadowKey;
      this.refreshShadowCasters(pcx, pcz);
    }

    // Apply at most 2 completed worker chunk meshes per frame to keep frame times ultra-smooth!
    let applied = 0;
    while (this.pendingMeshApplies.length > 0 && applied < 2) {
      const job = this.pendingMeshApplies.shift()!;
      if (this.columns.has(this.colKey(job.col.cx, job.col.cz))) {
        this.applyMeshesToColumn(job.col, job.meshes);
        applied++;
      }
    }

    // Load spiral outward from player
    const targets: [number, number, number][] = [];
    for (let dz = -renderDist; dz <= renderDist; dz++) {
      for (let dx = -renderDist; dx <= renderDist; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 <= renderDist * renderDist + 1) {
          targets.push([pcx + dx, pcz + dz, d2]);
        }
      }
    }
    targets.sort((a, b) => a[2] - b[2]);

    let queued = 0;
    for (const [cx, cz, d2] of targets) {
      const key = this.colKey(cx, cz);
      if (!this.columns.has(key) && !this.pendingGen.has(key)) {
        if (d2 <= 2) {
          this.getColumnSync(cx, cz); // Immediate near player
        } else if (queued < 3) {
          this.requestColumnAsync(cx, cz);
          queued++;
        }
      }
    }

    // Rebuild dirty subchunks synchronously for zero lag on block edits
    for (const col of this.columns.values()) {
      if (col.dirtySubchunks.size > 0 && this.scene && this.atlas) {
        col.lighting = computeColumnLighting(col.blocks);
        const nb = this.getNeighborColumnsData(col.cx, col.cz);
        for (const cy of col.dirtySubchunks) {
          const meshes = meshColumnSubchunks(col.cx, col.cz, col.blocks, col.lighting, (n) => this.atlas!.getUV(n), nb, this.enableAO, cy);
          this.applyMeshesToColumn(col, meshes);
        }
        col.dirtySubchunks.clear();
      }
    }

    // Unload distant columns to keep RAM bounded
    const maxDist2 = (renderDist + 3) * (renderDist + 3);
    for (const [key, col] of this.columns.entries()) {
      const d2 = (col.cx - pcx) * (col.cx - pcx) + (col.cz - pcz) * (col.cz - pcz);
      if (d2 > maxDist2) {
        this.unloadColumn(key, col);
      }
    }
  }

  private unloadColumn(key: string, col: ColumnEntry): void {
    if (col.group && this.scene) {
      this.scene.remove(col.group);
      for (const slot of col.subMeshes) {
        slot.solid?.geometry.dispose();
        slot.cutout?.geometry.dispose();
        slot.liquid?.geometry.dispose();
      }
    }
    this.columns.delete(key);
  }

  public getBlock(wx: number, wy: number, wz: number): BlockId {
    const y = Math.floor(wy);
    if (y < 0 || y >= WORLD_HEIGHT) return BlockId.Air;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = this.colKey(cx, cz);
    const col = this.columns.get(key) ?? this.getColumnSync(cx, cz);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return col.blocks[idxInColumn(lx, y, lz)];
  }

  public setBlock(wx: number, wy: number, wz: number, blockId: BlockId, recordDelta = true): void {
    const y = Math.floor(wy);
    if (y <= 0 || y >= WORLD_HEIGHT) return;
    const x = Math.floor(wx);
    const z = Math.floor(wz);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = this.colKey(cx, cz);
    const col = this.getColumnSync(cx, cz);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const idx = idxInColumn(lx, y, lz);

    if (col.blocks[idx] === blockId) return;
    col.blocks[idx] = blockId;

    if (recordDelta) {
      if (!this.chunkDeltas[key]) {
        this.chunkDeltas[key] = { key, blocks: {} };
      }
      this.chunkDeltas[key].blocks[idx] = blockId;
    }

    const cy = Math.floor(y / CHUNK_SIZE);
    col.dirtySubchunks.add(cy);
    if (y % CHUNK_SIZE === 0 && cy > 0) col.dirtySubchunks.add(cy - 1);
    if (y % CHUNK_SIZE === CHUNK_SIZE - 1 && cy < VERTICAL_CHUNKS - 1) col.dirtySubchunks.add(cy + 1);

    // Mark neighbor column dirty if on edge
    if (lx === 0) this.columns.get(this.colKey(cx - 1, cz))?.dirtySubchunks.add(cy);
    if (lx === CHUNK_SIZE - 1) this.columns.get(this.colKey(cx + 1, cz))?.dirtySubchunks.add(cy);
    if (lz === 0) this.columns.get(this.colKey(cx, cz - 1))?.dirtySubchunks.add(cy);
    if (lz === CHUNK_SIZE - 1) this.columns.get(this.colKey(cx, cz + 1))?.dirtySubchunks.add(cy);

    // Queue liquid & falling block reactions around change
    this.queueNeighborPhysics(x, y, z);
    if (blockId === BlockId.Timer1s) {
      this.activeTimers.push([x, y, z]);
    }
  }

  private queueNeighborPhysics(x: number, y: number, z: number): void {
    const offsets = [
      [0, 0, 0], [0, 1, 0], [0, -1, 0],
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    ];
    for (const [dx, dy, dz] of offsets) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const b = this.getBlock(nx, ny, nz);
      if (isLiquidBlock(b) || getBlockDef(b).gravity) {
        this.activeLiquidQueue.push([nx, ny, nz]);
      }
    }
  }

  public tickSimulation(dt: number): void {
    // 1. Liquid flow + Mixing (Water + Lava -> Obsidian, Water + Honey -> Honey Block, Lava + Honey -> Crispy Honey) + Falling Sand
    this.liquidTickAccum += dt;
    if (this.liquidTickAccum >= 0.14 && this.activeLiquidQueue.length > 0) {
      this.liquidTickAccum = 0;
      const batch = this.activeLiquidQueue.splice(0, 48);
      for (const [x, y, z] of batch) {
        const b = this.getBlock(x, y, z);
        const def = getBlockDef(b);
        if (def.gravity && y > 1 && this.getBlock(x, y - 1, z) === BlockId.Air) {
          this.setBlock(x, y, z, BlockId.Air);
          this.setBlock(x, y - 1, z, b);
          continue;
        }
        if (isLiquidBlock(b)) {
          // Check liquid mixing with neighbors
          const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]];
          let mixed = false;
          for (const [dx, dy, dz] of dirs) {
            const nb = this.getBlock(x + dx, y + dy, z + dz);
            if ((b === BlockId.Water && nb === BlockId.Lava) || (b === BlockId.Lava && nb === BlockId.Water)) {
              this.setBlock(x, y, z, BlockId.Obsidian);
              mixed = true;
              break;
            }
            if ((b === BlockId.Water && nb === BlockId.Honey) || (b === BlockId.Honey && nb === BlockId.Water)) {
              this.setBlock(x, y, z, BlockId.HoneyBlock);
              mixed = true;
              break;
            }
            if ((b === BlockId.Lava && nb === BlockId.Honey) || (b === BlockId.Honey && nb === BlockId.Lava)) {
              this.setBlock(x, y, z, BlockId.CrispyHoney);
              mixed = true;
              break;
            }
          }
          if (mixed) continue;

          // Flow downward
          if (y > 1 && this.getBlock(x, y - 1, z) === BlockId.Air) {
            this.setBlock(x, y - 1, z, b);
          } else {
            // Lateral limited spread (1 block down-side step if air below)
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              if (this.getBlock(x + dx, y, z + dz) === BlockId.Air && this.getBlock(x + dx, y - 1, z + dz) === BlockId.Air) {
                this.setBlock(x + dx, y, z + dz, b);
              }
            }
          }
        }
      }
    }

    // 2. 1-Second Mechanism Timers
    this.timerAccum += dt;
    if (this.timerAccum >= 1.0 && this.activeTimers.length > 0) {
      this.timerAccum = 0;
      this.activeTimers = this.activeTimers.filter(([tx, ty, tz]) => {
        if (this.getBlock(tx, ty, tz) !== BlockId.Timer1s) return false;
        this.triggerMechanism(tx, ty, tz);
        return true;
      });
    }
  }

  public triggerMechanism(wx: number, wy: number, wz: number): void {
    // Flood-fill along adjacent WireBlocks up to 48 nodes to activate Traps, Doors, TNT!
    const visited = new Set<string>();
    const queue: [number, number, number][] = [[wx, wy, wz]];
    let steps = 0;

    while (queue.length > 0 && steps < 48) {
      const [x, y, z] = queue.shift()!;
      const k = `${x},${y},${z}`;
      if (visited.has(k)) continue;
      visited.add(k);
      steps++;

      const b = this.getBlock(x, y, z);
      if (b === BlockId.DartTrap) {
        this.onDartTrapFire?.(x, y, z);
      } else if (b === BlockId.TNT) {
        this.detonateTNT(x, y, z);
      } else if (b === BlockId.WoodDoorClosed) {
        this.setBlock(x, y, z, BlockId.WoodDoorOpen);
      } else if (b === BlockId.WoodDoorOpen) {
        this.setBlock(x, y, z, BlockId.WoodDoorClosed);
      }

      for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const nb = this.getBlock(nx, ny, nz);
        if (
          nb === BlockId.WireBlock ||
          nb === BlockId.DartTrap ||
          nb === BlockId.TNT ||
          nb === BlockId.WoodDoorClosed ||
          nb === BlockId.WoodDoorOpen
        ) {
          queue.push([nx, ny, nz]);
        }
      }
    }
  }

  public detonateTNT(cx: number, cy: number, cz: number, radius = 4): void {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy + dz * dz <= radius * radius) {
            const b = this.getBlock(cx + dx, cy + dy, cz + dz);
            const def = getBlockDef(b);
            if (b !== BlockId.Air && def.minPickPower < 100 && !def.isContainer) {
              this.setBlock(cx + dx, cy + dy, cz + dz, BlockId.Air);
            }
          }
        }
      }
    }
    this.onExplosion?.(cx + 0.5, cy + 0.5, cz + 0.5, radius + 1, 120);
  }

  public mineBlock(
    wx: number,
    wy: number,
    wz: number,
    pickPower: number,
    axePower: number,
    hammerPower: number
  ): { broken: boolean; drops: { itemId: string; count: number }[]; reason?: string } {
    const b = this.getBlock(wx, wy, wz);
    if (b === BlockId.Air || isLiquidBlock(b)) return { broken: false, drops: [] };
    const def = getBlockDef(b);

    if (def.isContainer) {
      const ck = `${wx},${wy},${wz}`;
      const chest = this.chests[ck];
      if (chest && chest.items.some((s) => s !== null)) {
        return { broken: false, drops: [], reason: 'Empty chest first!' };
      }
    }

    if (def.toolType === 'pickaxe' && pickPower < def.minPickPower) {
      return { broken: false, drops: [], reason: `Requires ${def.minPickPower}% Pickaxe Power` };
    }
    if (def.toolType === 'hammer' && hammerPower < 25) {
      return { broken: false, drops: [], reason: 'Requires a Hammer' };
    }
    if ((b === BlockId.DemonAltar || b === BlockId.CrimsonAltar) && (!this.meta.isHardmode || hammerPower < 80)) {
      return { broken: false, drops: [], reason: 'Requires Hardmode & Pwnhammer (80%+ Hammer)' };
    }
    // Note: Wood can be punched 1 block at a time with bare hands when starting empty-handed!
    // Using an Axe triggers the full tree cascade chop below.

    const drops: { itemId: string; count: number }[] = [];

    // Tree cascade chop when breaking base trunk with an axe!
    if (
      axePower > 0 &&
      (b === BlockId.Wood ||
        b === BlockId.BorealWood ||
        b === BlockId.PalmWood ||
        b === BlockId.RichMahogany ||
        b === BlockId.Ebonwood ||
        b === BlockId.Shadewood ||
        b === BlockId.Pearlwood)
    ) {
      let yUp = wy;
      while (yUp < WORLD_HEIGHT - 2 && this.getBlock(wx, yUp, wz) === b) {
        this.setBlock(wx, yUp, wz, BlockId.Air);
        if (def.dropItemId) drops.push({ itemId: def.dropItemId, count: 1 });
        yUp++;
      }
      // Clear adjacent canopy leaves
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const lb = this.getBlock(wx + dx, yUp - 1 + dy, wz + dz);
            if (
              lb === BlockId.Leaf ||
              lb === BlockId.BorealLeaf ||
              lb === BlockId.JungleLeaf ||
              lb === BlockId.PalmLeaf ||
              lb === BlockId.HallowedLeaf
            ) {
              this.setBlock(wx + dx, yUp - 1 + dy, wz + dz, BlockId.Air);
              if (Math.random() < 0.25) drops.push({ itemId: 'acorn', count: 1 });
            }
          }
        }
      }
      return { broken: true, drops };
    }

    this.setBlock(wx, wy, wz, BlockId.Air);

    if (b === BlockId.ShadowOrb) {
      this.meta.orbsSmashed++;
      this.onSpecialBlockTriggered?.('shadow_orb', wx, wy, wz);
      drops.push({ itemId: this.meta.orbsSmashed === 1 ? 'musket' : 'demonite_ore', count: this.meta.orbsSmashed === 1 ? 1 : 10 });
      drops.push({ itemId: 'musket_ball', count: 50 });
      return { broken: true, drops };
    }
    if (b === BlockId.CrimsonHeart) {
      this.meta.orbsSmashed++;
      this.onSpecialBlockTriggered?.('crimson_heart', wx, wy, wz);
      drops.push({ itemId: this.meta.orbsSmashed === 1 ? 'the_undertaker' : 'crimtane_ore', count: this.meta.orbsSmashed === 1 ? 1 : 10 });
      drops.push({ itemId: 'musket_ball', count: 50 });
      return { broken: true, drops };
    }
    if (b === BlockId.DemonAltar || b === BlockId.CrimsonAltar) {
      this.meta.altarsSmashed++;
      this.onSpecialBlockTriggered?.('altar_smashed', wx, wy, wz);
      return { broken: true, drops: [{ itemId: 'soul_of_night', count: 2 }] };
    }
    if (b === BlockId.LifeCrystalBlock) {
      this.onSpecialBlockTriggered?.('life_crystal', wx, wy, wz);
    }
    if (b === BlockId.PlanteraBulb) {
      this.onSpecialBlockTriggered?.('plantera_bulb', wx, wy, wz);
    }
    if (b === BlockId.Larva) {
      this.onSpecialBlockTriggered?.('larva', wx, wy, wz);
    }
    if (b === BlockId.Pot) {
      const potLoot = [
        { itemId: 'torch', count: 4 + Math.floor(Math.random() * 6) },
        { itemId: 'lesser_healing_potion', count: 1 + Math.floor(Math.random() * 2) },
        { itemId: 'wooden_arrow', count: 10 + Math.floor(Math.random() * 12) },
        { itemId: 'silver_coin', count: 1 + Math.floor(Math.random() * 4) },
      ];
      drops.push(potLoot[Math.floor(Math.random() * potLoot.length)]);
      return { broken: true, drops };
    }

    if (def.dropItemId) {
      drops.push({ itemId: def.dropItemId, count: def.dropCount ?? 1 });
    }
    return { broken: true, drops };
  }

  public triggerHardmodeTransformation(): void {
    if (this.meta.isHardmode) return;
    this.meta.isHardmode = true;
    this.generator = new WorldGenerator(this.meta.seed, this.meta.size, this.meta.evilType, true);

    // Re-notify workers with Hardmode flag
    if (this.atlas) {
      const uvEntries = Array.from(this.atlas.uvMap.entries());
      for (const w of this.workers) {
        w.postMessage({
          type: 'init',
          seed: this.meta.seed,
          size: this.meta.size,
          evilType: this.meta.evilType,
          isHardmode: true,
          uvEntries,
        });
      }
    }

    // Apply Hardmode Hallow / Evil V-conversion & Hardmode ores onto currently loaded columns!
    for (const col of this.columns.values()) {
      const baseX = col.cx * CHUNK_SIZE;
      const baseZ = col.cz * CHUNK_SIZE;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = baseX + lx;
          const wz = baseZ + lz;
          for (let y = 28; y < 170; y++) {
            const b = col.blocks[idxInColumn(lx, y, lz)];
            if (b === BlockId.Air) continue;
            const newBiome = this.generator.getBiomeAt(wx, y, wz);
            if (newBiome === 'hallow' || newBiome === 'underground_hallow') {
              if (b === BlockId.Grass) col.blocks[idxInColumn(lx, y, lz)] = BlockId.HallowedGrass;
              else if (b === BlockId.Stone) col.blocks[idxInColumn(lx, y, lz)] = BlockId.Pearlstone;
            } else if (newBiome === 'underground_corruption' || newBiome === 'corruption') {
              if (b === BlockId.Grass) col.blocks[idxInColumn(lx, y, lz)] = BlockId.CorruptGrass;
              else if (b === BlockId.Stone) col.blocks[idxInColumn(lx, y, lz)] = BlockId.Ebonstone;
            } else if (newBiome === 'underground_crimson' || newBiome === 'crimson') {
              if (b === BlockId.Grass) col.blocks[idxInColumn(lx, y, lz)] = BlockId.CrimsonGrass;
              else if (b === BlockId.Stone) col.blocks[idxInColumn(lx, y, lz)] = BlockId.Crimstone;
            }
          }
        }
      }
      for (let cy = 1; cy < 12; cy++) col.dirtySubchunks.add(cy);
    }
  }

  public getOrCreateChest(x: number, y: number, z: number): ChestContents {
    const ck = `${x},${y},${z}`;
    if (!this.chests[ck]) {
      this.chests[ck] = { x, y, z, items: Array(20).fill(null) };
    }
    return this.chests[ck];
  }

  public getBiomeAt(x: number, y: number, z: number): BiomeId {
    return this.generator.getBiomeAt(Math.floor(x), Math.floor(y), Math.floor(z));
  }

  public getNearbyCraftingStations(px: number, py: number, pz: number, radius = 5): Set<string> {
    const stations = new Set<string>(['hand']);
    const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const b = this.getBlock(ix + dx, iy + dy, iz + dz);
          if (b === BlockId.Air) continue;
          const def = getBlockDef(b);
          if (def.isStation) stations.add(def.isStation);
          if (b === BlockId.Water) stations.add('water');
          if (b === BlockId.Lava) stations.add('lava');
          if (b === BlockId.Honey) stations.add('honey');
          if (b === BlockId.Hellforge) stations.add('furnace'); // Hellforge acts as Furnace too!
          if (b === BlockId.MythrilAnvil) stations.add('iron_anvil'); // Mythril Anvil acts as Iron Anvil too!
          if (b === BlockId.AlchemyTable) stations.add('bottle');
        }
      }
    }
    return stations;
  }

  public raycastBlock(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 7.0, includeLiquids = false): RaycastHit {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : 1e9;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : 1e9;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : 1e9;

    let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) * tDeltaX) : 1e9;
    let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) * tDeltaY) : 1e9;
    let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) * tDeltaZ) : 1e9;

    let dist = 0;
    let nx = 0, ny = 0, nz = 0;

    for (let step = 0; step < 120 && dist <= maxDist; step++) {
      const b = this.getBlock(x, y, z);
      if (b !== BlockId.Air && (includeLiquids || !isLiquidBlock(b))) {
        return { hit: true, bx: x, by: y, bz: z, nx, ny, nz, blockId: b, distance: dist };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        dist = tMaxX;
        tMaxX += tDeltaX;
        x += stepX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        dist = tMaxY;
        tMaxY += tDeltaY;
        y += stepY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
        z += stepZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }

    return { hit: false, bx: 0, by: 0, bz: 0, nx: 0, ny: 0, nz: 0, blockId: BlockId.Air, distance: maxDist };
  }

  public findSafeSpawnY(wx: number, wz: number): number {
    for (let y = WORLD_HEIGHT - 10; y >= 100; y--) {
      const b = this.getBlock(wx, y, wz);
      if (isSolidBlock(b) && !isSolidBlock(this.getBlock(wx, y + 1, wz)) && !isSolidBlock(this.getBlock(wx, y + 2, wz))) {
        return y + 1.2;
      }
    }
    return 145;
  }

  public dispose(): void {
    for (const w of this.workers) {
      w.terminate();
    }
    this.workers = [];
    for (const [key, col] of this.columns.entries()) {
      this.unloadColumn(key, col);
    }
    this.atlas?.texture.dispose();
    this.solidMat?.dispose();
    this.cutoutMat?.dispose();
    this.liquidMat?.dispose();
  }
}
