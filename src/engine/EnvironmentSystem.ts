import * as THREE from 'three';
import { BIOMES } from '@/data/biomes';
import { EVENTS } from '@/data/events';
import { BiomeId, EventId, WorldMeta } from '@/types/game';
import { WorldManager } from '@/world/WorldManager';

export class EnvironmentSystem {
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  private sunDisc: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private starPoints: THREE.Points;
  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  private lightningFlash = 0;

  private currentSkyColor = new THREE.Color('#80c8ff');
  private currentFogColor = new THREE.Color('#a6d8f8');
  private targetSkyColor = new THREE.Color('#80c8ff');
  private targetFogColor = new THREE.Color('#a6d8f8');

  constructor(scene: THREE.Scene, enableShadows: boolean) {
    this.hemiLight = new THREE.HemisphereLight('#d6eeff', '#4a3d33', 0.55);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff8e6', 1.15);
    this.sunLight.castShadow = enableShadows;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 160;
    this.sunLight.shadow.bias = -0.0008;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Sun & Moon 3D sky discs
    this.sunDisc = new THREE.Mesh(
      new THREE.BoxGeometry(14, 14, 2),
      new THREE.MeshBasicMaterial({ color: '#ffe57f', fog: false })
    );
    scene.add(this.sunDisc);

    this.moonDisc = new THREE.Mesh(
      new THREE.BoxGeometry(11, 11, 2),
      new THREE.MeshBasicMaterial({ color: '#e3f2fd', fog: false })
    );
    scene.add(this.moonDisc);

    // Starfield
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92 + 0.05); // upper hemisphere
      const r = 180;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#ffffff', size: 1.5, transparent: true, opacity: 0, fog: false })
    );
    scene.add(this.starPoints);

    // Rain / Snow weather streaks
    const rainCount = 900;
    this.rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 44;
      this.rainPositions[i * 3 + 1] = (Math.random() - 0.5) * 28;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: '#99d5ff', size: 0.25, transparent: true, opacity: 0.65 })
    );
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);

    scene.background = this.currentSkyColor;
    scene.fog = new THREE.FogExp2(this.currentFogColor.getHex(), 0.005);
  }

  public isDaytime(timeOfDay: number): boolean {
    return timeOfDay >= 270 && timeOfDay < 1170; // 4:30 AM to 7:30 PM
  }

  public formatClock(timeOfDay: number): string {
    const mins = ((Math.floor(timeOfDay) % 1440) + 1440) % 1440;
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const suffix = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  public update(
    dt: number,
    scene: THREE.Scene,
    world: WorldManager,
    meta: WorldMeta,
    playerPos: THREE.Vector3,
    biomeId: BiomeId,
    inWater: boolean,
    inLava: boolean,
    timeFrozen = false,
    timeRate = 1
  ): void {
    // Advance Day-Night clock (1 full Terraria 24h cycle = 16 real minutes at 1x)
    if (!timeFrozen) {
      const prevDay = this.isDaytime(meta.timeOfDay);
      meta.timeOfDay += dt * 1.5 * timeRate;
      if (meta.timeOfDay >= 1440) {
        meta.timeOfDay -= 1440;
        meta.dayCount++;
      }
      const nowDay = this.isDaytime(meta.timeOfDay);

      // Dawn/Dusk transitions handle Blood Moon / Solar Eclipse end
      if (!prevDay && nowDay) {
        if (meta.activeEvent === 'blood_moon' || meta.activeEvent === 'pumpkin_moon' || meta.activeEvent === 'frost_moon') {
          meta.activeEvent = null;
        }
      } else if (prevDay && !nowDay && meta.activeEvent === 'solar_eclipse') {
        meta.activeEvent = null;
      }

      // Weather cycle
      meta.weatherTimer -= dt;
      if (meta.weatherTimer <= 0) {
        meta.weatherTimer = 180 + Math.random() * 240;
        const r = Math.random();
        meta.weather = r < 0.65 ? 'clear' : r < 0.88 ? 'rain' : 'storm';
      }
    }

    // Sun & Moon orbital angle
    // 270 = sunrise (angle 0), 720 = noon (PI/2), 1170 = sunset (PI)
    const dayAngle = ((meta.timeOfDay - 270) / 900) * Math.PI;
    const isDay = this.isDaytime(meta.timeOfDay);

    const orbitRadius = 150;
    const sunX = Math.cos(dayAngle) * orbitRadius;
    const sunY = Math.sin(dayAngle) * orbitRadius;
    this.sunDisc.position.set(playerPos.x + sunX, playerPos.y + sunY, playerPos.z - 40);
    this.sunDisc.lookAt(playerPos);
    this.sunDisc.visible = sunY > -20 && meta.activeEvent !== 'solar_eclipse';

    const moonAngle = dayAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * orbitRadius;
    const moonY = Math.sin(moonAngle) * orbitRadius;
    this.moonDisc.position.set(playerPos.x + moonX, playerPos.y + moonY, playerPos.z - 40);
    this.moonDisc.lookAt(playerPos);
    this.moonDisc.visible = moonY > -20;

    // Moon tint during Blood Moon
    (this.moonDisc.material as THREE.MeshBasicMaterial).color.set(
      meta.activeEvent === 'blood_moon' ? '#ff2a38' : '#e3f2fd'
    );

    // Directional Sun Shadow Light follows player smoothly
    const lightDirY = isDay ? Math.max(0.25, Math.sin(dayAngle)) : 0.45;
    const lightDirX = isDay ? Math.cos(dayAngle) : -0.4;
    this.sunLight.position.set(playerPos.x + lightDirX * 55, playerPos.y + lightDirY * 65, playerPos.z + 25);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    // Sky Brightness (0..1)
    let dayFactor = 0;
    if (isDay) {
      dayFactor = Math.sin(Math.max(0, Math.min(Math.PI, dayAngle)));
      dayFactor = Math.pow(dayFactor, 0.45);
    }
    if (meta.activeEvent === 'solar_eclipse') {
      dayFactor *= 0.15;
    }

    const biome = BIOMES[biomeId] ?? BIOMES.forest;
    const daySky = new THREE.Color(biome.skyColorBottom);
    const nightSky = new THREE.Color('#090d1f');
    this.targetSkyColor.copy(nightSky).lerp(daySky, dayFactor);
    this.targetFogColor.copy(nightSky).lerp(new THREE.Color(biome.fogColor), dayFactor);

    // Event sky tinting
    if (meta.activeEvent) {
      const ev = EVENTS[meta.activeEvent as EventId];
      if (ev) {
        this.targetSkyColor.lerp(new THREE.Color(ev.skyTint), 0.55);
        this.targetFogColor.lerp(new THREE.Color(ev.skyTint), 0.55);
      }
    }

    // Underwater & Lava immersion tint
    let fogDensity = biome.fogDensity;
    if (inLava) {
      this.targetSkyColor.set('#7a1c04');
      this.targetFogColor.set('#962407');
      fogDensity = 0.085;
    } else if (inWater) {
      this.targetSkyColor.set('#0e3c6b');
      this.targetFogColor.set(biome.waterColor);
      fogDensity = 0.045;
    }

    // Lightning flash in storm
    if (meta.weather === 'storm' && Math.random() < dt * 0.08) {
      this.lightningFlash = 1.0;
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.5);
      this.targetSkyColor.lerp(new THREE.Color('#ffffff'), this.lightningFlash * 0.65);
    }

    this.currentSkyColor.lerp(this.targetSkyColor, Math.min(1, dt * 3));
    this.currentFogColor.lerp(this.targetFogColor, Math.min(1, dt * 3));
    scene.background = this.currentSkyColor;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(this.currentFogColor);
      scene.fog.density = fogDensity;
    }

    // Stars visibility at night or in Space
    this.starPoints.position.copy(playerPos);
    const starOpacity = biomeId === 'space' ? 0.95 : Math.max(0, 1 - dayFactor * 2.2) * 0.85;
    (this.starPoints.material as THREE.PointsMaterial).opacity = starOpacity;

    // Rain / Snow particle update
    const isSurface = !biome.isUnderground && biomeId !== 'space';
    const showWeather = isSurface && (meta.weather === 'rain' || meta.weather === 'storm');
    this.rainPoints.visible = showWeather;
    if (showWeather) {
      const isSnow = biomeId === 'snow';
      (this.rainPoints.material as THREE.PointsMaterial).color.set(isSnow ? '#ffffff' : '#80c8ff');
      const fallSpeed = isSnow ? 6.5 : 22.0;
      const windX = meta.weather === 'storm' ? -5.0 : -1.5;
      this.rainPoints.position.set(playerPos.x, playerPos.y + 4, playerPos.z);
      for (let i = 0; i < this.rainPositions.length; i += 3) {
        this.rainPositions[i] += windX * dt;
        this.rainPositions[i + 1] -= fallSpeed * dt;
        if (this.rainPositions[i + 1] < -14) {
          this.rainPositions[i] = (Math.random() - 0.5) * 44;
          this.rainPositions[i + 1] = 14;
          this.rainPositions[i + 2] = (Math.random() - 0.5) * 44;
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Update Lights & Voxel Shader Sky Tint!
    const minSky = meta.activeEvent === 'blood_moon' ? 0.24 : 0.14;
    const skyLevel = Math.max(minSky, dayFactor);
    const tint = new THREE.Color(skyLevel, skyLevel * (meta.activeEvent === 'blood_moon' ? 0.65 : 0.98), skyLevel * (meta.activeEvent === 'blood_moon' ? 0.65 : 1.0));
    if (biomeId === 'underworld') tint.setRGB(0.65, 0.28, 0.16);
    world.shaderUniforms.uSkyLightTint.value.copy(tint);
    world.shaderUniforms.uMinCaveLight.value = biome.isUnderground ? 0.055 : 0.08;

    this.sunLight.intensity = 0.25 + dayFactor * 1.05 + this.lightningFlash * 0.8;
    this.sunLight.color.set(meta.activeEvent === 'blood_moon' ? '#ff7070' : '#fff8e6');
    this.hemiLight.intensity = 0.28 + dayFactor * 0.45;
    this.hemiLight.color.copy(this.currentSkyColor);
  }
}
