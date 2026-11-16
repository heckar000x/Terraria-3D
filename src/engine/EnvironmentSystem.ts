import * as THREE from 'three';
import { BIOMES } from '@/data/biomes';
import { EVENTS } from '@/data/events';
import { BiomeId, EventId, WorldMeta } from '@/types/game';
import { WorldManager } from '@/world/WorldManager';

interface CloudDef {
  ox: number;
  oy: number;
  oz: number;
  sx: number;
  sy: number;
  sz: number;
}

export class EnvironmentSystem {
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  private skyDome: THREE.Mesh;
  private skyUniforms: {
    uSkyTop: { value: THREE.Color };
    uSkyHorizon: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunGlow: { value: THREE.Color };
    uSunStrength: { value: number };
  };
  private sunDisc: THREE.Mesh;
  private sunHalo: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private starPoints: THREE.Points;
  private cloudMesh: THREE.InstancedMesh;
  private cloudMat: THREE.MeshLambertMaterial;
  private cloudDefs: CloudDef[] = [];
  private cloudDummy = new THREE.Object3D();
  private cloudDrift = 0;

  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  private lightningFlash = 0;
  private renderDistanceChunks = 4;

  private currentSkyTop = new THREE.Color('#2d7ce6');
  private currentSkyHorizon = new THREE.Color('#9ad8ff');
  private targetSkyTop = new THREE.Color('#2d7ce6');
  private targetSkyHorizon = new THREE.Color('#9ad8ff');
  private targetSunGlow = new THREE.Color('#ffda7a');
  private sunDirScratch = new THREE.Vector3(0.4, 0.8, 0.2);

  constructor(scene: THREE.Scene, enableShadows: boolean, highQualityShadows = false) {
    this.hemiLight = new THREE.HemisphereLight('#d6eeff', '#4a3d33', 0.65);
    scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff8e6', 1.2);
    this.sunLight.castShadow = enableShadows;
    const shadowRes = highQualityShadows ? 2048 : 1024;
    this.sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    const d = 42;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 140;
    this.sunLight.shadow.bias = -0.0012;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Procedural Gradient Sky Dome with Sunset/Sunrise Horizon Glow & Sun Halo
    this.skyUniforms = {
      uSkyTop: { value: new THREE.Color('#2d7ce6') },
      uSkyHorizon: { value: new THREE.Color('#9ad8ff') },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
      uSunGlow: { value: new THREE.Color('#ffd87a') },
      uSunStrength: { value: 1.0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSkyTop;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlow;
        uniform float uSunStrength;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 0.95 + 0.08, 0.0, 1.0);
          vec3 col = mix(uSkyHorizon, uSkyTop, pow(h, 0.62));
          float sunAlign = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
          float halo = pow(sunAlign, 8.0) * 0.42 * uSunStrength;
          float horizonSun = pow(sunAlign, 3.0) * (1.0 - smoothstep(0.0, 0.45, abs(vDir.y))) * 0.35 * uSunStrength;
          col += uSunGlow * (halo + horizonSun);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(235, 24, 16), skyMat);
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);

    // Sun Core + Outer Corona Halo + Moon Disc
    this.sunDisc = new THREE.Mesh(
      new THREE.BoxGeometry(12, 12, 2),
      new THREE.MeshBasicMaterial({ color: '#fff4ad', fog: false })
    );
    scene.add(this.sunDisc);

    this.sunHalo = new THREE.Mesh(
      new THREE.BoxGeometry(20, 20, 1.5),
      new THREE.MeshBasicMaterial({ color: '#ffca57', transparent: true, opacity: 0.28, fog: false, depthWrite: false })
    );
    scene.add(this.sunHalo);

    this.moonDisc = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 10.5, 2),
      new THREE.MeshBasicMaterial({ color: '#e3f2fd', fog: false })
    );
    scene.add(this.moonDisc);

    // Starfield
    const starCount = 650;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92 + 0.05);
      const r = 190;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#ffffff', size: 1.7, transparent: true, opacity: 0, fog: false })
    );
    scene.add(this.starPoints);

    // 3D Voxel Cloud Layer (42 multi-puff clouds)
    const cloudCount = 42;
    this.cloudMat = new THREE.MeshLambertMaterial({
      color: '#ffffff',
      emissive: '#dbeafe',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.88,
    });
    this.cloudMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.cloudMat, cloudCount);
    this.cloudMesh.frustumCulled = false;
    for (let i = 0; i < cloudCount; i++) {
      const isMain = i % 3 === 0;
      const baseIndex = Math.floor(i / 3);
      const angle = (baseIndex / 14) * Math.PI * 2 + (baseIndex * 0.41);
      const rad = 32 + (baseIndex % 4) * 26;
      const cx = Math.cos(angle) * rad;
      const cz = Math.sin(angle) * rad;
      const puffShiftX = isMain ? 0 : (i % 3 === 1 ? 6.5 : -6.0);
      const puffShiftZ = isMain ? 0 : (i % 3 === 1 ? 2.5 : -2.2);
      this.cloudDefs.push({
        ox: cx + puffShiftX,
        oy: 198 + (baseIndex % 3) * 3.5 + (isMain ? 1.2 : 0),
        oz: cz + puffShiftZ,
        sx: isMain ? 14 : 9,
        sy: isMain ? 3.2 : 2.1,
        sz: isMain ? 10 : 7,
      });
    }
    scene.add(this.cloudMesh);

    // Rain / Snow Weather Particles
    const rainCount = 720;
    this.rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 44;
      this.rainPositions[i * 3 + 1] = (Math.random() - 0.5) * 26;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainPoints = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({ color: '#99d5ff', size: 0.26, transparent: true, opacity: 0.65 })
    );
    this.rainPoints.visible = false;
    scene.add(this.rainPoints);

    scene.background = this.currentSkyHorizon;
    scene.fog = new THREE.Fog(this.currentSkyHorizon.getHex(), 36, 72);
  }

  public setShadowQuality(highQuality: boolean): void {
    const res = highQuality ? 2048 : 1024;
    if (this.sunLight.shadow.mapSize.x !== res) {
      this.sunLight.shadow.mapSize.set(res, res);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  public setRenderDistance(chunks: number): void {
    this.renderDistanceChunks = Math.max(2, chunks);
  }

  public isDaytime(timeOfDay: number): boolean {
    return timeOfDay >= 270 && timeOfDay < 1170;
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
    if (!timeFrozen) {
      const prevDay = this.isDaytime(meta.timeOfDay);
      meta.timeOfDay += dt * 1.5 * timeRate;
      if (meta.timeOfDay >= 1440) {
        meta.timeOfDay -= 1440;
        meta.dayCount++;
      }
      const nowDay = this.isDaytime(meta.timeOfDay);
      if (!prevDay && nowDay) {
        if (meta.activeEvent === 'blood_moon' || meta.activeEvent === 'pumpkin_moon' || meta.activeEvent === 'frost_moon') {
          meta.activeEvent = null;
        }
      } else if (prevDay && !nowDay && meta.activeEvent === 'solar_eclipse') {
        meta.activeEvent = null;
      }

      meta.weatherTimer -= dt;
      if (meta.weatherTimer <= 0) {
        meta.weatherTimer = 180 + Math.random() * 240;
        const r = Math.random();
        meta.weather = r < 0.65 ? 'clear' : r < 0.88 ? 'rain' : 'storm';
      }
    }

    const dayAngle = ((meta.timeOfDay - 270) / 900) * Math.PI;
    const isDay = this.isDaytime(meta.timeOfDay);

    const orbitRadius = 165;
    const sunX = Math.cos(dayAngle) * orbitRadius;
    const sunY = Math.sin(dayAngle) * orbitRadius;
    this.sunDisc.position.set(playerPos.x + sunX, playerPos.y + sunY, playerPos.z - 42);
    this.sunDisc.lookAt(playerPos);
    this.sunDisc.visible = sunY > -24 && meta.activeEvent !== 'solar_eclipse';
    this.sunHalo.position.copy(this.sunDisc.position);
    this.sunHalo.lookAt(playerPos);
    this.sunHalo.visible = this.sunDisc.visible;

    const moonAngle = dayAngle + Math.PI;
    const moonX = Math.cos(moonAngle) * orbitRadius;
    const moonY = Math.sin(moonAngle) * orbitRadius;
    this.moonDisc.position.set(playerPos.x + moonX, playerPos.y + moonY, playerPos.z - 42);
    this.moonDisc.lookAt(playerPos);
    this.moonDisc.visible = moonY > -24;
    (this.moonDisc.material as THREE.MeshBasicMaterial).color.set(
      meta.activeEvent === 'blood_moon' ? '#ff2a38' : '#e3f2fd'
    );

    this.sunDirScratch.set(sunX, sunY, -42).normalize();

    const lightDirY = isDay ? Math.max(0.28, Math.sin(dayAngle)) : 0.45;
    const lightDirX = isDay ? Math.cos(dayAngle) : -0.4;
    this.sunLight.position.set(playerPos.x + lightDirX * 48, playerPos.y + lightDirY * 56, playerPos.z + 22);
    this.sunLight.target.position.copy(playerPos);
    this.sunLight.target.updateMatrixWorld();

    let dayFactor = 0;
    if (isDay) {
      dayFactor = Math.sin(Math.max(0, Math.min(Math.PI, dayAngle)));
      dayFactor = Math.pow(dayFactor, 0.42);
    }
    if (meta.activeEvent === 'solar_eclipse') {
      dayFactor *= 0.15;
    }

    // Golden-hour sunrise / sunset warmth when sun is low on horizon
    const sunElevation = isDay ? Math.sin(Math.max(0, Math.min(Math.PI, dayAngle))) : 0;
    const twilightFactor = isDay ? Math.max(0, 1 - sunElevation * 2.6) * (sunElevation > 0.01 ? 1 : 0) : 0;

    const biome = BIOMES[biomeId] ?? BIOMES.forest;
    const dayTop = new THREE.Color(biome.skyColorTop);
    const dayHorizon = new THREE.Color(biome.skyColorBottom);
    const nightTop = new THREE.Color('#060a1a');
    const nightHorizon = new THREE.Color('#131e3d');

    this.targetSkyTop.copy(nightTop).lerp(dayTop, dayFactor);
    this.targetSkyHorizon.copy(nightHorizon).lerp(dayHorizon, dayFactor);

    if (twilightFactor > 0.01) {
      this.targetSkyHorizon.lerp(new THREE.Color('#ff8f59'), twilightFactor * 0.65);
      this.targetSkyTop.lerp(new THREE.Color('#5a3d7a'), twilightFactor * 0.35);
      this.targetSunGlow.set('#ff7b3b');
    } else {
      this.targetSunGlow.set('#ffe28a');
    }

    if (meta.activeEvent) {
      const ev = EVENTS[meta.activeEvent as EventId];
      if (ev) {
        this.targetSkyTop.lerp(new THREE.Color(ev.skyTint), 0.55);
        this.targetSkyHorizon.lerp(new THREE.Color(ev.skyTint), 0.65);
      }
    }

    // Fog tuning based on render distance (hides chunk borders seamlessly!)
    const maxDistBlocks = this.renderDistanceChunks * 16;
    let fogNear = maxDistBlocks * 0.48;
    let fogFar = maxDistBlocks * 0.96;

    if (inLava) {
      this.targetSkyTop.set('#6b1704');
      this.targetSkyHorizon.set('#9e2908');
      fogNear = 2.5;
      fogFar = 16;
    } else if (inWater) {
      this.targetSkyTop.set('#0a2e54');
      this.targetSkyHorizon.set(biome.waterColor);
      fogNear = 4;
      fogFar = 26;
    } else if (meta.weather === 'storm') {
      this.targetSkyTop.lerp(new THREE.Color('#273347'), 0.45);
      this.targetSkyHorizon.lerp(new THREE.Color('#475973'), 0.45);
      fogNear *= 0.72;
      fogFar *= 0.82;
    }

    if (meta.weather === 'storm' && Math.random() < dt * 0.08) {
      this.lightningFlash = 1.0;
    }
    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - dt * 4.5);
      this.targetSkyTop.lerp(new THREE.Color('#ffffff'), this.lightningFlash * 0.6);
      this.targetSkyHorizon.lerp(new THREE.Color('#ffffff'), this.lightningFlash * 0.65);
    }

    const lerpRate = Math.min(1, dt * 3.2);
    this.currentSkyTop.lerp(this.targetSkyTop, lerpRate);
    this.currentSkyHorizon.lerp(this.targetSkyHorizon, lerpRate);

    this.skyDome.position.copy(playerPos);
    this.skyUniforms.uSkyTop.value.copy(this.currentSkyTop);
    this.skyUniforms.uSkyHorizon.value.copy(this.currentSkyHorizon);
    this.skyUniforms.uSunDir.value.copy(this.sunDirScratch);
    this.skyUniforms.uSunGlow.value.copy(this.targetSunGlow);
    this.skyUniforms.uSunStrength.value = isDay ? (0.35 + twilightFactor * 0.65) : 0.08;

    scene.background = this.currentSkyHorizon;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(this.currentSkyHorizon);
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
    }

    // Update Drifting Voxel Clouds
    this.cloudDrift = (this.cloudDrift + dt * 1.4) % 240;
    this.cloudMesh.visible = !biome.isUnderground && biomeId !== 'underworld';
    if (this.cloudMesh.visible) {
      this.cloudMat.color.copy(this.currentSkyHorizon).lerp(new THREE.Color('#ffffff'), 0.68);
      this.cloudMat.emissive.copy(this.targetSkyHorizon).multiplyScalar(0.35 + dayFactor * 0.35);
      const wrapSpan = 240;
      for (let i = 0; i < this.cloudDefs.length; i++) {
        const c = this.cloudDefs[i];
        const rx = (((c.ox + this.cloudDrift + wrapSpan * 0.5) % wrapSpan) + wrapSpan) % wrapSpan - wrapSpan * 0.5;
        this.cloudDummy.position.set(playerPos.x + rx, c.oy, playerPos.z + c.oz);
        this.cloudDummy.scale.set(c.sx, c.sy, c.sz);
        this.cloudDummy.updateMatrix();
        this.cloudMesh.setMatrixAt(i, this.cloudDummy.matrix);
      }
      this.cloudMesh.instanceMatrix.needsUpdate = true;
    }

    // Stars visibility at night or in Space
    this.starPoints.position.copy(playerPos);
    const starOpacity = biomeId === 'space' ? 0.95 : Math.max(0, 1 - dayFactor * 2.1) * 0.88;
    (this.starPoints.material as THREE.PointsMaterial).opacity = starOpacity;

    // Rain / Snow Particles
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
        if (this.rainPositions[i + 1] < -13) {
          this.rainPositions[i] = (Math.random() - 0.5) * 44;
          this.rainPositions[i + 1] = 13;
          this.rainPositions[i + 2] = (Math.random() - 0.5) * 44;
        }
      }
      this.rainPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Update Lights & Voxel Shader Sky Tint
    const minSky = meta.activeEvent === 'blood_moon' ? 0.24 : 0.15;
    const skyLevel = Math.max(minSky, dayFactor);
    const tintR = skyLevel * (meta.activeEvent === 'blood_moon' ? 1.0 : 1.0 + twilightFactor * 0.16);
    const tintG = skyLevel * (meta.activeEvent === 'blood_moon' ? 0.65 : 0.98 - twilightFactor * 0.08);
    const tintB = skyLevel * (meta.activeEvent === 'blood_moon' ? 0.65 : 1.0 - twilightFactor * 0.18);
    world.shaderUniforms.uSkyLightTint.value.setRGB(tintR, tintG, tintB);
    if (biomeId === 'underworld') world.shaderUniforms.uSkyLightTint.value.setRGB(0.65, 0.28, 0.16);
    world.shaderUniforms.uMinCaveLight.value = biome.isUnderground ? 0.06 : 0.095;

    this.sunLight.intensity = 0.28 + dayFactor * 1.12 + this.lightningFlash * 0.8;
    this.sunLight.color.set(
      meta.activeEvent === 'blood_moon'
        ? '#ff7070'
        : twilightFactor > 0.25
        ? '#ffb37b'
        : '#fff8e6'
    );
    this.hemiLight.intensity = 0.34 + dayFactor * 0.48;
    this.hemiLight.color.copy(this.currentSkyHorizon);
  }
}
