import { GameEngine } from '@/engine/GameEngine';
import { isTouchVisible } from './UiHelpers';

export class MobileControls {
  public readonly root: HTMLDivElement;
  private engine: GameEngine;
  private stickEl: HTMLDivElement;
  private knobEl: HTMLDivElement;
  private stickTouchId: number | null = null;
  private lookTouchId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private lastPinchDist: number | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    // Full-Viewport Background Look & 2-Finger Pinch-Zoom Pad (under HUD buttons)
    const lookPad = document.createElement('div');
    lookPad.className = 'touch-look-pad';

    // Virtual Left Joystick
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'touch-knob';
    this.stickEl.appendChild(this.knobEl);

    // Ergonomic Right-Thumb Action Cluster (Zero Overlap with Top-Right Vitals!)
    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    const btns: { label: string; cls?: string; onDown: () => void; onUp?: () => void }[] = [
      { label: 'HOOK', onDown: () => this.engine.triggerGrapple() },
      { label: 'DASH', onDown: () => this.engine.triggerDash() },
      { label: 'HEAL', onDown: () => this.engine.triggerQuickHeal() },
      { label: 'USE', onDown: () => this.engine.triggerSecondaryAction() },
      { label: 'ATK', cls: 'touch-btn-primary', onDown: () => (this.engine.touchPrimaryHeld = true), onUp: () => (this.engine.touchPrimaryHeld = false) },
      { label: 'JUMP', cls: 'touch-btn-jump', onDown: () => this.engine.queueTouchJump(true), onUp: () => this.engine.queueTouchJump(false) },
    ];
    for (const b of btns) {
      const el = document.createElement('button');
      el.className = `touch-btn ${b.cls ?? ''}`.trim();
      el.textContent = b.label;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.engine.audio.unlock();
        b.onDown();
      });
      if (b.onUp) {
        el.addEventListener('touchend', (e) => {
          e.preventDefault();
          b.onUp!();
        });
        el.addEventListener('touchcancel', () => b.onUp!());
      }
      actions.appendChild(el);
    }

    // Portrait Orientation Helper Banner (shown via CSS only on portrait phones)
    const rotateBanner = document.createElement('div');
    rotateBanner.className = 'rotate-prompt';
    rotateBanner.innerHTML = `
      <div style="font-size:32px;">📱↻</div>
      <div style="font-size:18px;font-weight:800;color:#ffd740;">Landscape Recommended</div>
      <div style="font-size:13px;color:#cbd7fa;max-width:290px;line-height:1.4;">
        Rotate your phone horizontally for the widest Terraria 3D view and ergonomic controls.
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
        <button class="t-btn t-btn-gold" id="mob-landscape-fs">Go Landscape Fullscreen</button>
        <button class="t-btn" id="mob-continue-portrait">Continue Anyway</button>
      </div>
    `;
    rotateBanner.querySelector('#mob-landscape-fs')?.addEventListener('click', () => {
      this.engine.audio.unlock();
      try {
        void document.documentElement.requestFullscreen?.()?.then?.(() => {
          const ori = (screen as unknown as { orientation?: { lock?: (m: string) => Promise<void> } }).orientation;
          ori?.lock?.('landscape').catch(() => {});
        })?.catch?.(() => {});
      } catch {
        // fallback dismiss
      }
      rotateBanner.classList.add('dismissed');
    });
    rotateBanner.querySelector('#mob-continue-portrait')?.addEventListener('click', () => {
      rotateBanner.classList.add('dismissed');
    });

    this.root.append(lookPad, this.stickEl, actions, rotateBanner);
    this.bindStick();
    this.bindLook(lookPad);
    this.setVisible(isTouchVisible(engine.settings));
  }

  public setVisible(show: boolean): void {
    this.root.style.display = show ? 'block' : 'none';
  }

  private bindStick(): void {
    const updateStick = (t: Touch) => {
      const rect = this.stickEl.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = rect.width * 0.4;
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      this.engine.touchMove.x = dx / maxR;
      this.engine.touchMove.y = -dy / maxR;
    };

    this.stickEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.stickTouchId === null && e.changedTouches.length > 0) {
        this.stickTouchId = e.changedTouches[0].identifier;
        updateStick(e.changedTouches[0]);
      }
    });
    this.stickEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickTouchId) updateStick(t);
      }
    });
    const resetStick = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickTouchId) {
          this.stickTouchId = null;
          this.knobEl.style.transform = 'translate(0px, 0px)';
          this.engine.touchMove.x = 0;
          this.engine.touchMove.y = 0;
        }
      }
    };
    this.stickEl.addEventListener('touchend', resetStick);
    this.stickEl.addEventListener('touchcancel', resetStick);
  }

  private bindLook(pad: HTMLDivElement): void {
    const getPinchDist = (touches: TouchList): number | null => {
      if (touches.length < 2) return null;
      return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    };

    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.engine.audio.unlock();
      if (e.targetTouches.length >= 2) {
        this.lastPinchDist = getPinchDist(e.targetTouches);
        return;
      }
      if (this.lookTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lastLook = { x: t.clientX, y: t.clientY };
      }
    });
    pad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.targetTouches.length >= 2) {
        const dist = getPinchDist(e.targetTouches);
        if (dist !== null && this.lastPinchDist !== null) {
          const delta = (this.lastPinchDist - dist) * 0.03;
          if (Math.abs(delta) > 0.05) {
            this.engine.cameraCtrl.zoom(delta);
          }
        }
        this.lastPinchDist = dist;
        return;
      }
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) {
          const dx = t.clientX - this.lastLook.x;
          const dy = t.clientY - this.lastLook.y;
          this.lastLook = { x: t.clientX, y: t.clientY };
          this.engine.cameraCtrl.rotate(dx * 1.45, dy * 1.45, this.engine.settings.cameraSensitivity, this.engine.settings.invertY);
        }
      }
    });
    const endLook = (e: TouchEvent) => {
      if (e.targetTouches.length < 2) this.lastPinchDist = null;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    pad.addEventListener('touchend', endLook);
    pad.addEventListener('touchcancel', endLook);
  }
}
