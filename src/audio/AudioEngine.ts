export type SfxId =
  | 'dig'
  | 'break_block'
  | 'place_block'
  | 'sword_swing'
  | 'bow_shoot'
  | 'gun_shot'
  | 'magic_cast'
  | 'hit'
  | 'player_hurt'
  | 'slime'
  | 'boss_roar'
  | 'explosion'
  | 'coin'
  | 'pickup'
  | 'craft'
  | 'potion'
  | 'splash'
  | 'footstep'
  | 'ui_click';

const THEME_SCALES: Record<string, { tempo: number; notes: number[]; wave: OscillatorType; bass: number }> = {
  forest_day: { tempo: 0.34, notes: [523.25, 587.33, 659.25, 783.99, 880, 783.99, 659.25, 587.33], wave: 'triangle', bass: 130.81 },
  forest_night: { tempo: 0.48, notes: [392, 440, 493.88, 587.33, 659.25, 493.88, 440, 392], wave: 'sine', bass: 98 },
  underground: { tempo: 0.42, notes: [293.66, 349.23, 440, 523.25, 392, 349.23, 329.63, 261.63], wave: 'sine', bass: 73.42 },
  desert: { tempo: 0.36, notes: [329.63, 349.23, 415.3, 440, 493.88, 523.25, 415.3, 329.63], wave: 'triangle', bass: 82.41 },
  snow: { tempo: 0.44, notes: [523.25, 659.25, 783.99, 987.77, 783.99, 659.25, 587.33, 523.25], wave: 'sine', bass: 130.81 },
  jungle: { tempo: 0.28, notes: [392, 466.16, 523.25, 587.33, 698.46, 587.33, 523.25, 466.16], wave: 'triangle', bass: 98 },
  corruption: { tempo: 0.38, notes: [261.63, 277.18, 329.63, 392, 311.13, 277.18, 246.94, 220], wave: 'sawtooth', bass: 65.41 },
  crimson: { tempo: 0.4, notes: [246.94, 261.63, 311.13, 369.99, 293.66, 246.94, 220, 196], wave: 'sawtooth', bass: 61.74 },
  hallow: { tempo: 0.26, notes: [587.33, 739.99, 880, 1174.66, 987.77, 880, 739.99, 659.25], wave: 'sine', bass: 146.83 },
  dungeon: { tempo: 0.42, notes: [220, 261.63, 329.63, 311.13, 261.63, 246.94, 220, 196], wave: 'square', bass: 55 },
  underworld: { tempo: 0.36, notes: [196, 207.65, 246.94, 293.66, 233.08, 196, 174.61, 164.81], wave: 'sawtooth', bass: 49 },
  boss: { tempo: 0.19, notes: [329.63, 392, 440, 493.88, 587.33, 493.88, 440, 659.25], wave: 'sawtooth', bass: 82.41 },
  lunar: { tempo: 0.22, notes: [440, 523.25, 659.25, 783.99, 880, 1046.5, 783.99, 659.25], wave: 'triangle', bass: 110 },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  public masterVolume = 0.7;
  public musicVolume = 0.45;
  public sfxVolume = 0.75;
  private currentTheme = 'forest_day';
  private musicStep = 0;
  private musicTimer = 0;
  private lastSfxTime: Record<string, number> = {};

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  public setVolumes(master: number, music: number, sfx: number): void {
    this.masterVolume = master;
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.masterVolume, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.25, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.4, t, 0.03);
  }

  public setMusicTheme(theme: string): void {
    if (THEME_SCALES[theme]) {
      this.currentTheme = theme;
    } else if (theme.includes('underground')) {
      this.currentTheme = 'underground';
    } else if (theme.includes('corruption')) {
      this.currentTheme = 'corruption';
    } else if (theme.includes('crimson')) {
      this.currentTheme = 'crimson';
    } else if (theme.includes('hallow')) {
      this.currentTheme = 'hallow';
    } else {
      this.currentTheme = 'forest_day';
    }
  }

  public updateMusic(dt: number): void {
    if (!this.ctx || !this.musicGain || this.ctx.state !== 'running') return;
    if (this.masterVolume <= 0.01 || this.musicVolume <= 0.01) return;

    const scale = THEME_SCALES[this.currentTheme] ?? THEME_SCALES.forest_day;
    this.musicTimer += dt;
    if (this.musicTimer < scale.tempo) return;
    this.musicTimer = 0;

    const now = this.ctx.currentTime;
    const note = scale.notes[this.musicStep % scale.notes.length];
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = scale.wave;
    osc.frequency.setValueAtTime(note, now);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + scale.tempo * 0.9);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + scale.tempo);

    // Bass pulse every 2nd step
    if (this.musicStep % 2 === 0) {
      const bass = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      bass.type = 'triangle';
      const factor = this.musicStep % 8 >= 4 ? 1.25 : 1.0;
      bass.frequency.setValueAtTime(scale.bass * factor, now);
      bg.gain.setValueAtTime(0.001, now);
      bg.gain.linearRampToValueAtTime(0.24, now + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.001, now + scale.tempo * 1.8);
      bass.connect(bg);
      bg.connect(this.musicGain);
      bass.start(now);
      bass.stop(now + scale.tempo * 1.9);
    }

    this.musicStep++;
  }

  public playSfx(id: SfxId, pitchJitter = 0.08): void {
    if (!this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - (this.lastSfxTime[id] ?? 0) < 40) return;
    this.lastSfxTime[id] = nowMs;

    const t = this.ctx.currentTime;
    const jitter = 1 + (Math.random() - 0.5) * pitchJitter * 2;

    const tone = (type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.5) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0 * jitter, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * jitter), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + dur);
    };

    switch (id) {
      case 'dig': tone('square', 220, 110, 0.07, 0.28); break;
      case 'break_block': tone('triangle', 190, 75, 0.11, 0.42); break;
      case 'place_block': tone('sine', 240, 320, 0.06, 0.35); break;
      case 'sword_swing': tone('triangle', 480, 180, 0.12, 0.35); break;
      case 'bow_shoot': tone('triangle', 320, 140, 0.11, 0.35); break;
      case 'gun_shot': tone('sawtooth', 360, 70, 0.12, 0.45); break;
      case 'magic_cast': tone('sine', 640, 1120, 0.16, 0.35); break;
      case 'hit': tone('sawtooth', 180, 90, 0.09, 0.4); break;
      case 'player_hurt': tone('sawtooth', 260, 110, 0.18, 0.55); break;
      case 'slime': tone('sine', 190, 360, 0.12, 0.35); break;
      case 'boss_roar': tone('sawtooth', 130, 52, 0.65, 0.7); break;
      case 'explosion': tone('sawtooth', 140, 32, 0.45, 0.7); break;
      case 'coin':
        tone('sine', 987.77, 1318.5, 0.12, 0.38);
        break;
      case 'pickup': tone('sine', 520, 780, 0.08, 0.25); break;
      case 'craft': tone('triangle', 440, 880, 0.16, 0.45); break;
      case 'potion': tone('sine', 340, 680, 0.2, 0.4); break;
      case 'splash': tone('sine', 260, 120, 0.15, 0.35); break;
      case 'footstep': tone('triangle', 130, 85, 0.04, 0.12); break;
      case 'ui_click': tone('sine', 620, 740, 0.05, 0.22); break;
    }
  }
}
