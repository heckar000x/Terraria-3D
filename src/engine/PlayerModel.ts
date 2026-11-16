import * as THREE from 'three';
import { getItemDef } from '@/data/items';
import { CharacterAppearance, CharacterSave, ItemStack } from '@/types/game';

export type PlayerAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'swim' | 'glide';
export type ActionAnimType = 'none' | 'swing' | 'thrust' | 'aim' | 'mine';

export class PlayerModel {
  public readonly root = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private headGroup = new THREE.Group();
  private torsoMesh!: THREE.Mesh;
  private leftArmPivot = new THREE.Group();
  private rightArmPivot = new THREE.Group();
  private leftLegPivot = new THREE.Group();
  private rightLegPivot = new THREE.Group();
  private hairGroup = new THREE.Group();
  private armorHeadGroup = new THREE.Group();
  private armorChestMesh!: THREE.Mesh;
  private armorLegLeft!: THREE.Mesh;
  private armorLegRight!: THREE.Mesh;
  private leftWingPivot = new THREE.Group();
  private rightWingPivot = new THREE.Group();
  private shieldMesh!: THREE.Mesh;
  private heldItemGroup = new THREE.Group();

  private skinMat!: THREE.MeshLambertMaterial;
  private shirtMat!: THREE.MeshLambertMaterial;
  private pantsMat!: THREE.MeshLambertMaterial;
  private shoeMat!: THREE.MeshLambertMaterial;
  private hairMat!: THREE.MeshLambertMaterial;

  private actionType: ActionAnimType = 'none';
  private actionTimer = 0;
  private actionDuration = 0.3;
  private walkPhase = 0;
  private hurtFlash = 0;
  private currentAppearanceKey = '';
  private currentEquipKey = '';

  constructor(appearance: CharacterAppearance) {
    this.buildRig(appearance);
  }

  private buildRig(app: CharacterAppearance): void {
    this.skinMat = new THREE.MeshLambertMaterial({ color: app.skinColor });
    this.shirtMat = new THREE.MeshLambertMaterial({ color: app.shirtColor });
    this.pantsMat = new THREE.MeshLambertMaterial({ color: app.pantsColor });
    this.shoeMat = new THREE.MeshLambertMaterial({ color: app.shoeColor });
    this.hairMat = new THREE.MeshLambertMaterial({ color: app.hairColor });

    this.root.add(this.bodyPivot);

    // Legs (each 0.22 x 0.62 x 0.24)
    const legGeo = new THREE.BoxGeometry(0.22, 0.52, 0.24);
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.14, 0.28);

    this.leftLegPivot.position.set(-0.13, 0.64, 0);
    const lLeg = new THREE.Mesh(legGeo, this.pantsMat);
    lLeg.position.y = -0.26;
    lLeg.castShadow = true;
    const lShoe = new THREE.Mesh(shoeGeo, this.shoeMat);
    lShoe.position.set(0, -0.57, 0.02);
    this.armorLegLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.54, 0.27), new THREE.MeshLambertMaterial({ color: '#888' }));
    this.armorLegLeft.position.y = -0.26;
    this.armorLegLeft.visible = false;
    this.leftLegPivot.add(lLeg, lShoe, this.armorLegLeft);

    this.rightLegPivot.position.set(0.13, 0.64, 0);
    const rLeg = new THREE.Mesh(legGeo, this.pantsMat);
    rLeg.position.y = -0.26;
    rLeg.castShadow = true;
    const rShoe = new THREE.Mesh(shoeGeo, this.shoeMat);
    rShoe.position.set(0, -0.57, 0.02);
    this.armorLegRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.54, 0.27), new THREE.MeshLambertMaterial({ color: '#888' }));
    this.armorLegRight.position.y = -0.26;
    this.armorLegRight.visible = false;
    this.rightLegPivot.add(rLeg, rShoe, this.armorLegRight);

    // Torso (0.48 x 0.62 x 0.28)
    this.torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), this.shirtMat);
    this.torsoMesh.position.set(0, 0.95, 0);
    this.torsoMesh.castShadow = true;

    this.armorChestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.64, 0.33), new THREE.MeshLambertMaterial({ color: '#888' }));
    this.armorChestMesh.position.set(0, 0.95, 0);
    this.armorChestMesh.visible = false;

    // Wings attached to back of torso
    const wingGeo = new THREE.BoxGeometry(0.65, 0.52, 0.06);
    const wingMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.leftWingPivot.position.set(-0.12, 1.12, -0.18);
    const lw = new THREE.Mesh(wingGeo, wingMat);
    lw.position.set(-0.34, 0.05, 0);
    this.leftWingPivot.add(lw);
    this.leftWingPivot.visible = false;

    this.rightWingPivot.position.set(0.12, 1.12, -0.18);
    const rw = new THREE.Mesh(wingGeo, wingMat);
    rw.position.set(0.34, 0.05, 0);
    this.rightWingPivot.add(rw);
    this.rightWingPivot.visible = false;

    // Arms (0.2 x 0.58 x 0.22)
    const sleeveGeo = new THREE.BoxGeometry(0.21, 0.26, 0.23);
    const handGeo = new THREE.BoxGeometry(0.19, 0.34, 0.21);

    this.leftArmPivot.position.set(-0.35, 1.22, 0);
    const lSleeve = new THREE.Mesh(sleeveGeo, new THREE.MeshLambertMaterial({ color: app.undershirtColor }));
    lSleeve.position.y = -0.13;
    const lHand = new THREE.Mesh(handGeo, this.skinMat);
    lHand.position.y = -0.42;
    this.shieldMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.34), new THREE.MeshLambertMaterial({ color: '#2979ff' }));
    this.shieldMesh.position.set(-0.14, -0.35, 0.06);
    this.shieldMesh.visible = false;
    this.leftArmPivot.add(lSleeve, lHand, this.shieldMesh);

    this.rightArmPivot.position.set(0.35, 1.22, 0);
    const rSleeve = new THREE.Mesh(sleeveGeo, new THREE.MeshLambertMaterial({ color: app.undershirtColor }));
    rSleeve.position.y = -0.13;
    const rHand = new THREE.Mesh(handGeo, this.skinMat);
    rHand.position.y = -0.42;
    this.heldItemGroup.position.set(0, -0.52, 0.14);
    this.rightArmPivot.add(rSleeve, rHand, this.heldItemGroup);

    // Head (0.44 x 0.44 x 0.44)
    this.headGroup.position.set(0, 1.26, 0);
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), this.skinMat);
    headMesh.position.y = 0.22;
    headMesh.castShadow = true;

    // Terraria iconic eyes (+Z forward)
    const eyeWhite = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const eyePupil = new THREE.MeshBasicMaterial({ color: app.eyeColor });
    const lEyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.02), eyeWhite);
    lEyeW.position.set(-0.1, 0.23, 0.225);
    const rEyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.02), eyeWhite);
    rEyeW.position.set(0.1, 0.23, 0.225);
    const lEyeP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.025), eyePupil);
    lEyeP.position.set(-0.1, 0.23, 0.228);
    const rEyeP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.025), eyePupil);
    rEyeP.position.set(0.1, 0.23, 0.228);

    this.headGroup.add(headMesh, lEyeW, rEyeW, lEyeP, rEyeP, this.hairGroup, this.armorHeadGroup);
    this.rebuildHair(app.hairStyle);

    this.bodyPivot.add(
      this.leftLegPivot,
      this.rightLegPivot,
      this.torsoMesh,
      this.armorChestMesh,
      this.leftWingPivot,
      this.rightWingPivot,
      this.leftArmPivot,
      this.rightArmPivot,
      this.headGroup
    );
  }

  private rebuildHair(style: number): void {
    this.hairGroup.clear();
    const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), this.hairMat);
    topCap.position.set(0, 0.43, 0);
    const backCap = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.14), this.hairMat);
    backCap.position.set(0, 0.27, -0.2);
    this.hairGroup.add(topCap, backCap);

    if (style % 4 === 1) {
      // Spiky anime hair
      for (let i = -1; i <= 1; i++) {
        const spike = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.14), this.hairMat);
        spike.position.set(i * 0.14, 0.54, 0.04);
        spike.rotation.z = -i * 0.25;
        this.hairGroup.add(spike);
      }
    } else if (style % 4 === 2) {
      // Long flowing hair
      const longBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.12), this.hairMat);
      longBack.position.set(0, 0.05, -0.21);
      this.hairGroup.add(longBack);
    } else if (style % 4 === 3) {
      // Mohawk / crest
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.46), this.hairMat);
      crest.position.set(0, 0.56, 0);
      this.hairGroup.add(crest);
    }
  }

  public syncEquipment(char: CharacterSave, heldStack: ItemStack | null): void {
    const appKey = JSON.stringify(char.appearance);
    if (appKey !== this.currentAppearanceKey) {
      this.currentAppearanceKey = appKey;
      this.skinMat.color.set(char.appearance.skinColor);
      this.shirtMat.color.set(char.appearance.shirtColor);
      this.pantsMat.color.set(char.appearance.pantsColor);
      this.shoeMat.color.set(char.appearance.shoeColor);
      this.hairMat.color.set(char.appearance.hairColor);
      this.rebuildHair(char.appearance.hairStyle);
    }

    const headItem = char.vanityArmor[0] ?? char.armor[0];
    const bodyItem = char.vanityArmor[1] ?? char.armor[1];
    const legsItem = char.vanityArmor[2] ?? char.armor[2];
    const wingAcc = char.accessories.find((a) => a && getItemDef(a.itemId)?.bonuses?.wingFlightTicks);
    const shieldAcc = char.accessories.find((a) => a && getItemDef(a.itemId)?.iconShape === 'shield');

    const eqKey = `${headItem?.itemId ?? ''}|${bodyItem?.itemId ?? ''}|${legsItem?.itemId ?? ''}|${wingAcc?.itemId ?? ''}|${shieldAcc?.itemId ?? ''}|${heldStack?.itemId ?? ''}`;
    if (eqKey === this.currentEquipKey) return;
    this.currentEquipKey = eqKey;

    // Head armor
    this.armorHeadGroup.clear();
    if (headItem) {
      const def = getItemDef(headItem.itemId);
      if (def) {
        const helm = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.48, 0.5),
          new THREE.MeshLambertMaterial({ color: def.iconColor })
        );
        helm.position.y = 0.24;
        const visor = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.1, 0.04),
          new THREE.MeshLambertMaterial({ color: def.iconAccent ?? '#111111' })
        );
        visor.position.set(0, 0.23, 0.25);
        this.armorHeadGroup.add(helm, visor);
      }
      this.hairGroup.visible = false;
    } else {
      this.hairGroup.visible = true;
    }

    // Chest armor
    if (bodyItem) {
      const def = getItemDef(bodyItem.itemId);
      if (def) {
        (this.armorChestMesh.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
        this.armorChestMesh.visible = true;
      }
    } else {
      this.armorChestMesh.visible = false;
    }

    // Legs armor
    if (legsItem) {
      const def = getItemDef(legsItem.itemId);
      if (def) {
        (this.armorLegLeft.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
        (this.armorLegRight.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
        this.armorLegLeft.visible = true;
        this.armorLegRight.visible = true;
      }
    } else {
      this.armorLegLeft.visible = false;
      this.armorLegRight.visible = false;
    }

    // Wings
    if (wingAcc) {
      const def = getItemDef(wingAcc.itemId);
      if (def) {
        const wingMeshL = this.leftWingPivot.children[0] as THREE.Mesh;
        const wingMeshR = this.rightWingPivot.children[0] as THREE.Mesh;
        (wingMeshL.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
        (wingMeshR.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
      }
      this.leftWingPivot.visible = true;
      this.rightWingPivot.visible = true;
    } else {
      this.leftWingPivot.visible = false;
      this.rightWingPivot.visible = false;
    }

    // Shield
    if (shieldAcc) {
      const def = getItemDef(shieldAcc.itemId);
      if (def) {
        (this.shieldMesh.material as THREE.MeshLambertMaterial).color.set(def.iconColor);
      }
      this.shieldMesh.visible = true;
    } else {
      this.shieldMesh.visible = false;
    }

    // Held Weapon / Tool / Block
    this.heldItemGroup.clear();
    if (heldStack) {
      const def = getItemDef(heldStack.itemId);
      if (def) {
        this.buildHeldMesh(def.iconShape, def.iconColor, def.iconAccent ?? '#ffffff');
      }
    }
  }

  private buildHeldMesh(shape: string, color: string, accent: string): void {
    const mat = new THREE.MeshLambertMaterial({ color });
    const handleMat = new THREE.MeshLambertMaterial({ color: '#6d4c41' });
    const accMat = new THREE.MeshLambertMaterial({ color: accent });

    if (shape === 'sword' || shape === 'spear') {
      const len = shape === 'spear' ? 1.45 : 0.95;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.14), mat);
      blade.position.set(0, len * 0.45, 0.15);
      blade.rotation.x = Math.PI * 0.25;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), accMat);
      guard.position.set(0, 0.08, 0.05);
      this.heldItemGroup.add(blade, guard);
    } else if (shape === 'pickaxe' || shape === 'axe' || shape === 'hammer') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), handleMat);
      shaft.position.set(0, 0.25, 0.12);
      shaft.rotation.x = Math.PI * 0.25;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.44), mat);
      head.position.set(0, 0.52, 0.34);
      head.rotation.x = Math.PI * 0.25;
      this.heldItemGroup.add(shaft, head);
    } else if (shape === 'bow') {
      const bowArc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.18), mat);
      bowArc.position.set(0, 0.1, 0.22);
      this.heldItemGroup.add(bowArc);
    } else if (shape === 'gun') {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.58), mat);
      barrel.position.set(0, 0.05, 0.24);
      this.heldItemGroup.add(barrel);
    } else if (shape === 'staff') {
      const staff = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), handleMat);
      staff.position.set(0, 0.35, 0.15);
      staff.rotation.x = Math.PI * 0.2;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), mat);
      gem.position.set(0, 0.85, 0.32);
      this.heldItemGroup.add(staff, gem);
    } else if (shape === 'torch') {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), handleMat);
      stick.position.set(0, 0.15, 0.12);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), new THREE.MeshBasicMaterial({ color }));
      flame.position.set(0, 0.4, 0.12);
      this.heldItemGroup.add(stick, flame);
    } else {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), mat);
      cube.position.set(0, 0.08, 0.16);
      this.heldItemGroup.add(cube);
    }
  }

  public triggerAction(type: ActionAnimType, duration = 0.28): void {
    this.actionType = type;
    this.actionDuration = Math.max(0.08, duration);
    this.actionTimer = this.actionDuration;
  }

  public triggerHurt(): void {
    this.hurtFlash = 0.22;
  }

  public update(dt: number, state: PlayerAnimState, horizontalSpeed: number, aimPitch: number): void {
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      const tint = this.hurtFlash > 0 ? '#ff6666' : null;
      this.torsoMesh.material = this.shirtMat;
      this.shirtMat.emissive.set(tint ?? '#000000');
      this.skinMat.emissive.set(tint ?? '#000000');
    }

    // Locomotion kinematics
    if (state === 'walk' || state === 'run' || state === 'swim') {
      this.walkPhase += dt * (state === 'run' ? 14 : 9) * Math.max(0.5, horizontalSpeed / 6);
      const swing = Math.sin(this.walkPhase) * 0.72;
      this.leftLegPivot.rotation.x = swing;
      this.rightLegPivot.rotation.x = -swing;
      this.leftArmPivot.rotation.x = -swing * 0.8;
      this.bodyPivot.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.05;
    } else if (state === 'jump' || state === 'fall' || state === 'glide') {
      this.leftLegPivot.rotation.x = state === 'glide' ? 0.2 : -0.35;
      this.rightLegPivot.rotation.x = state === 'glide' ? -0.2 : 0.35;
      this.leftArmPivot.rotation.x = state === 'glide' ? -1.1 : -0.5;
      this.bodyPivot.position.y = 0;
    } else {
      const breath = Math.sin(performance.now() * 0.003) * 0.04;
      this.leftLegPivot.rotation.x *= 0.82;
      this.rightLegPivot.rotation.x *= 0.82;
      this.leftArmPivot.rotation.x = breath;
      this.bodyPivot.position.y = 0;
    }

    // Wings flap when airborne
    if (this.leftWingPivot.visible) {
      const flap = state === 'glide' || state === 'jump'
        ? Math.sin(performance.now() * 0.022) * 0.65
        : 0.15;
      this.leftWingPivot.rotation.y = -0.3 - flap;
      this.rightWingPivot.rotation.y = 0.3 + flap;
    }

    // Head look pitch
    this.headGroup.rotation.x = THREE.MathUtils.clamp(aimPitch * 0.5, -0.5, 0.5);

    // Action arm overrides (Sword Swing, Pickaxe Mine, Bow/Gun Aim)
    if (this.actionTimer > 0) {
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      const p = 1 - this.actionTimer / this.actionDuration; // 0..1
      if (this.actionType === 'swing' || this.actionType === 'mine') {
        // Classic Terraria overhead arc!
        this.rightArmPivot.rotation.x = -2.4 + p * 3.1;
        this.rightArmPivot.rotation.z = -0.25;
      } else if (this.actionType === 'thrust') {
        this.rightArmPivot.rotation.x = -1.4 + Math.sin(p * Math.PI) * 0.4;
        this.rightArmPivot.rotation.z = 0;
      } else if (this.actionType === 'aim') {
        this.rightArmPivot.rotation.x = -Math.PI * 0.5 + aimPitch;
        this.rightArmPivot.rotation.z = 0;
      }
    } else {
      this.rightArmPivot.rotation.z = 0;
      if (state === 'walk' || state === 'run') {
        this.rightArmPivot.rotation.x = Math.sin(this.walkPhase) * 0.65;
      } else if (state === 'glide') {
        this.rightArmPivot.rotation.x = -1.1;
      } else {
        this.rightArmPivot.rotation.x = -Math.sin(performance.now() * 0.003) * 0.04;
      }
    }
  }
}
