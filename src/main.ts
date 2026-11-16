import './styles/main.css';
import { AudioEngine } from '@/audio/AudioEngine';
import { GameEngine } from '@/engine/GameEngine';
import { SaveManager } from '@/systems/SaveManager';
import { CharacterSave, GameSettings, WorldSave } from '@/types/game';
import { HudOverlay } from '@/ui/HudOverlay';
import { InventoryPanel } from '@/ui/InventoryPanel';
import { MobileControls } from '@/ui/MobileControls';
import { ModalPanels } from '@/ui/ModalPanels';
import { TitleScreen } from '@/ui/TitleScreen';
import { isTouchVisible } from '@/ui/UiHelpers';

const appRoot = document.getElementById('app') as HTMLDivElement;
const saveManager = new SaveManager();
const audio = new AudioEngine();
const initialSettings = saveManager.loadSettings();
audio.setVolumes(initialSettings.masterVolume, initialSettings.musicVolume, initialSettings.sfxVolume);

let titleScreen: TitleScreen | null = null;
let activeEngine: GameEngine | null = null;

function showTitle(): void {
  if (activeEngine) {
    activeEngine.dispose();
    activeEngine = null;
  }
  appRoot.innerHTML = '';
  titleScreen = new TitleScreen(saveManager, audio, {
    onLaunchGame: (char, world, settings) => launchGame(char, world, settings),
  });
  appRoot.appendChild(titleScreen.root);
}

function launchGame(char: CharacterSave, world: WorldSave, settings: GameSettings): void {
  if (titleScreen) {
    titleScreen.dispose();
    titleScreen = null;
  }
  appRoot.innerHTML = '';

  const stage = document.createElement('div');
  stage.id = 'game-stage';
  appRoot.appendChild(stage);

  const engine = new GameEngine(stage, char, world, settings, saveManager, audio);
  activeEngine = engine;

  const invPanel = new InventoryPanel(engine);
  const modals = new ModalPanels(engine);
  const mobileHud = new MobileControls(engine);

  const hud = new HudOverlay(char, {
    onSelectHotbar: (i) => {
      engine.selectedHotbar = i;
    },
    onOpenInventory: () => toggleInventory(),
    onToggleMap: () => toggleModal('map'),
    onToggleBestiary: () => toggleModal('bestiary'),
    onToggleJourney: () => toggleModal('journey'),
    onToggleCamera: () => engine.cameraCtrl.toggleFirstPerson(),
    onTogglePause: () => togglePauseOrClose(),
    onTalkNpc: () => {
      const npc = engine.entities.npcs.find((n) => n.position.distanceTo(engine.player.position) < 4.5);
      if (npc) {
        if (document.pointerLockElement) document.exitPointerLock?.();
        modals.open('npc', npc.def);
      }
    },
    onRespawnNow: () => engine.respawnPlayer(),
  });

  function toggleInventory(): void {
    if (modals.isOpen()) modals.close();
    if (invPanel.isOpen()) invPanel.close();
    else {
      if (document.pointerLockElement) document.exitPointerLock?.();
      invPanel.open();
    }
  }

  function toggleModal(kind: 'map' | 'bestiary' | 'journey' | 'pause'): void {
    if (kind === 'journey' && char.difficulty !== 'journey') return;
    if (invPanel.isOpen()) invPanel.close();
    if (modals.isOpen()) modals.close();
    else {
      if (document.pointerLockElement) document.exitPointerLock?.();
      modals.open(kind);
    }
  }

  function togglePauseOrClose(): void {
    if (invPanel.isOpen()) invPanel.close();
    else if (modals.isOpen()) modals.close();
    else {
      if (document.pointerLockElement) document.exitPointerLock?.();
      modals.open('pause');
    }
  }

  engine.onOpenInventory = toggleInventory;
  engine.onToggleMap = () => toggleModal('map');
  engine.onToggleBestiary = () => toggleModal('bestiary');
  engine.onToggleJourney = () => toggleModal('journey');
  engine.onTogglePause = togglePauseOrClose;

  modals.onExitToTitle = () => showTitle();

  let prevOpenChestRef: any = null;
  let prevNpcRef: any = null;

  engine.onHudUpdate = (snapshot) => {
    hud.update(snapshot);
    mobileHud.setVisible(isTouchVisible(engine.settings));

    // Automatically open Chest panel when player right-clicks a chest in 3D world
    if (engine.openChest && engine.openChest !== prevOpenChestRef) {
      prevOpenChestRef = engine.openChest;
      if (document.pointerLockElement) document.exitPointerLock?.();
      invPanel.open('craft');
    } else if (!engine.openChest) {
      prevOpenChestRef = null;
    }

    // Automatically open NPC Dialog when player right-clicks near an NPC
    if (engine.activeNpcDialog && engine.activeNpcDialog !== prevNpcRef) {
      prevNpcRef = engine.activeNpcDialog;
      if (document.pointerLockElement) document.exitPointerLock?.();
      modals.open('npc', engine.activeNpcDialog);
    } else if (!engine.activeNpcDialog) {
      prevNpcRef = null;
    }
  };

  appRoot.append(hud.root, mobileHud.root, invPanel.root, modals.root);
}

window.addEventListener('beforeunload', () => {
  if (activeEngine) {
    void activeEngine.saveProgress();
  }
});

showTitle();
