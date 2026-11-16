# Terraria 3D

A true 3D browser voxel sandbox recreation of Terraria built from scratch with **Three.js (WebGL2)**, **TypeScript**, inline **Web Workers**, procedural **CanvasTexture** sprites/textures, and procedural **Web Audio** music & SFX.

## Features
- **True 3D Voxel Engine**: `16x16x16` subchunks (`Y=0..255`), Web Worker background generation/meshing, per-vertex AO, sky & colored RGB block light propagation, dynamic held light, frustum culling, and `Low`/`Medium`/`High`/`Custom` presets.
- **23 Biomes & Structures**: Seeded `Small`/`Medium`/`Large` worlds with Forest, Desert, Snow, Jungle, Ocean, Glowing Mushroom, Corruption/Crimson, Hardmode Hallow V-stripe, Floating Islands, Dungeon, Jungle Temple, Underworld, Cabins, Pyramids, Bee Hives, and Obsidian Towers.
- **525 Items & 265 Recipes**: Tools, Melee (Swords, Spears, Boomerangs, Flails, Yoyos, Whips), Ranged (Bows, Guns, Launchers, Ammo), Magic (Staves, Tomes, Beams, Mana), Summoner (Minions & Whips), Armor sets with real set bonuses, Accessories/Wings, Potions, Hooks, Mounts, Crates, and Treasure Bags.
- **65 Enemies & All 18 Progression Bosses**: Pre-Hardmode through Moon Lord, including multi-phase AI, Wall of Flesh Hardmode transformation, and 11 World Events/Invasions.
- **16 Town NPCs & 3D Housing**: Bounded 3D room flood-fill housing validator, happiness price multipliers, Guide tips, Nurse healing, Goblin Tinkerer reforging, and Angler quests.
- **Desktop + Mobile Controls & Offline Persistence**: IndexedDB + LocalStorage character/world saves, Journey Mode powers, Fog-of-War Map, Bestiary, and standalone offline `portable/index.html`.

## Scripts
```bash
npm install
npm run dev            # Start Vite dev server on 0.0.0.0:5173
npm run typecheck      # Strict TypeScript check (tsc --noEmit)
npm test               # Run Vitest integration test suite
npm run build          # Production build -> dist/
npm run build:portable # Standalone single-file HTML -> portable/index.html
```

See `CHECKLIST.md` for an itemized implementation and test verification breakdown.
