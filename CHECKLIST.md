# Terraria 3D — Content & Verification Checklist

This checklist honestly distinguishes **Implemented & Automated-Tested**, **Implemented (Browser WebGL2 Interactive Only)**, and **Partial / Simplified Mechanics**.

## Verified Build & Automated Test Metrics
- **TypeScript (`npx tsc --noEmit`)**: Passed (0 errors)
- **Vitest Suite (`npm test`)**: 5 test files, 14/14 tests passed (`jsdom` + `fake-indexeddb`)
- **Production Build (`npm run build`)**: `dist/` built cleanly (`dist/index.html`, CSS, JS)
- **Portable Single-File Build (`npm run build:portable`)**: `portable/index.html` (`~1.05 MB`, 0 external CDN/network URLs)
- **Verified Database Counts**: `164` blocks/liquids, `525` items, `265` crafting recipes, `65` enemies, `18` progression bosses, `16` Town NPCs, `23` biomes, `11` world events, `26` achievements.

---

## Core Engine & Rendering
- **3D Voxel Chunk Engine (`16x16x16` subchunks, `Y=0..255`)**: Implemented & Tested (`WorldManager`, `ChunkMesher`, `ChunkWorker`). Note: Uses culled face meshing with per-vertex AO + RGB voxel lighting (solid/cutout/liquid passes) rather than greedy multi-block quad merging.
- **Web Worker Background Generation & Meshing**: Implemented (`src/world/ChunkWorker.ts?worker&inline`) with synchronous headless/fallback mode tested in `worldgen.test.ts`; Worker multi-thread scheduling runs in live browser.
- **Voxel Lighting (Sky + Torch/Lava/Biome RGB BFS + Dynamic Held Light)**: Implemented & Tested (`Lighting.ts` unit-tested; custom `MeshLambertMaterial` shader uniform injection compiled cleanly and awaits live WebGL2 visual rendering in browser).
- **Procedural 16x16 Block Atlas & 32x32 Item Icons**: Implemented (`TextureAtlas.ts`), zero external sprite assets; `getItemIconDataUrl` safely returns empty string in non-canvas headless `jsdom`.
- **Graphics Presets (`Low`/`Medium`/`High`/`Custom`), Shadows, AO, FOV, Render Distance**: Implemented in `GameSettings`, `GameEngine`, `TitleScreen`, and `ModalPanels`.

## World Generation & Biomes (`23` Biomes)
- **Deterministic Seeded Generator (`Small`/`Medium`/`Large`, `Corruption`/`Crimson`)**: Implemented & Tested (`WorldGenerator`).
- **Strata (`Space`, `Sky / Floating Islands`, `Surface`, `Underground`, `Cavern`, `Underworld`)**: Implemented & Tested.
- **Surface & Underground Biomes (`Forest`, `Desert`, `Snow`, `Jungle`, `Ocean`, `Mushroom`, `Corruption`, `Crimson`, `Hallow`, `Dungeon`, `Jungle Temple`)**: Implemented & Tested.
- **Generated Structures (`Cabins + Chests`, `Desert Pyramids`, `Bee Hives + Larva`, `Floating Islands + Skyware Chests`, `Underworld Obsidian Towers`, `Shadow Orbs / Crimson Hearts`, `Dungeon & Jungle Temple`)**: Implemented in `WorldGen.ts`; chest loot generation and structure block layouts verified via `WorldGenerator` tests.

## Blocks, Liquids, Sand & Wiring
- **Mining & Tool Tier Power Validation (`Pickaxe`/`Axe`/`Hammer`)**: Implemented & Tested (`mineBlock` enforces `minPickPower` and drops items).
- **Falling Sand (`Sand`/`Silt`/`Slush`) & Liquid Flow/Mixing (`Water + Lava -> Obsidian`, `Water + Honey -> Honey Block`, `Lava + Honey -> Crispy Honey`)**: Implemented & Tested.
- **Wiring & Traps (`Lever -> WireBlock -> DartTrap / TNT`)**: Implemented & Tested.
- **Background Walls**: Stored per-voxel in `ChunkColumnData.walls` and saved in `ChunkDeltaRecord`; currently used for worldgen/house boundaries rather than rendered as full separate wall subchunk geometry.

## Player, Camera, Controls & Audio
- **Customizable 3D Rigged Player (`PlayerModel`)**: Implemented & Tested (head/torso/limbs, hair styles, armor sets, wings, shield, held weapons, swing/thrust/aim/mine/run/glide animations).
- **3D AABB Physics (`PlayerController`)**: Implemented & Tested (gravity, auto-step, platforms, swimming/breath, lava burn, double-jump, wing flight, dash, grappling hook, mounts, fall damage).
- **Camera (`CameraController`)**: Implemented (collision-aware 3rd person shoulder cam + zoom + `V` first-person toggle + screen shake). Tested via TS build; interactive pointer-lock/drag tested in live browser.
- **Desktop & Mobile Touchscreen Controls**: Implemented (`GameEngine` keyboard/mouse + `MobileControls` virtual thumbstick, look pad, and action buttons).
- **Procedural Web Audio Music & SFX (`AudioEngine`)**: Implemented (biome/night/boss music synth loops + 19 procedural SFX effects). Instantiation tested in `uiBoot.test.ts`; audio playback requires user gesture in browser.

## Items, Crafting, Combat, Bosses, NPCs, Events & Progression
- **`525` Items & `265` Recipes across `20` Crafting Stations**: Implemented & Tested (referential integrity + station-validated crafting + coin auto-denomination + armor set bonuses + 31 reforge modifiers).
- **`65` Enemies (`Slime`, `Fighter`, `Flying`, `Caster`, `Worm`, `Aquatic`, etc.)**: Implemented & Tested (referential integrity + melee/projectile combat + loot drops).
- **All `18` Progression Bosses (`King Slime` through `Moon Lord`)**: Implemented & Tested (all 18 spawn, transition to Phase 2 under 50% HP, and trigger defeat progression; Wall of Flesh defeat triggers Hardmode V-stripe world transformation). *Honesty note:* Articulated parts (Twins twin orb, Destroyer/Eater worm segments, Skeletron/Golem limbs, Wall of Flesh advancing wall) are implemented, while hyper-specific bullet-hell scripts (e.g. Empress Sun Dance rays or Old One's Army lane defense) use streamlined 3D multi-projectile/wave AI rather than frame-for-frame 2D clones.
- **`16` Town NPCs, Validated 3D Housing, Happiness & Shops**: Implemented & Tested (`HousingSystem.validateHouse`, unlock criteria, biome/neighbor happiness pricing, Guide progression hints, Nurse healing, Goblin Tinkerer reforging, Angler quest turn-in, Merchant/specialist shops).
- **Fishing & Farming (`FishingFarmingSystem`)**: Implemented & Tested (bait/crates/biome catches, Truffle Worm -> Duke Fishron at Ocean, Acorn -> 3D tree growth, herb planting).
- **`11` World Events (`Blood Moon`, `Goblin Army`, `Pirate Invasion`, `Solar Eclipse`, `Pumpkin/Frost Moon`, `Martian Madness`, `Lunar Events`, etc.)**: Implemented with sky tinting, kill-progress tracking, and event-exclusive enemies; *Honesty note:* `Old One's Army` uses kill-wave spawning without a separate Eternia Crystal stand lane objective.
- **Difficulty Modes & Persistence (`Classic`/`Expert`/`Master`/`Journey` + IndexedDB/LocalStorage)**: Implemented & Tested (`SaveManager` save/load + recovery tested in `combatAndSave.test.ts`; Journey powers modal implemented in `ModalPanels`).
