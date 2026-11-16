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

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.root = document.createElement('div');
    this.root.className = 'mobile-hud';

    // Virtual Left Joystick
    this.stickEl = document.createElement('div');
    this.stickEl.className = 'touch-stick';
    this.knobEl = document.createElement('div');
    this.knobEl.className = 'touch-knob';
    this.stickEl.appendChild(this.knobEl);

    // Look Touch Pad
    const lookPad = document.createElement('div');
    lookPad.className = 'touch-look-pad';

    // Action Buttons
    const actions = document.createElement('div');
    actions.className = 'touch-actions';
    const btns: { label: string; onDown: () => void; onUp?: () => void }[] = [
      { label: 'ATK', onDown: () => (this.engine.touchPrimaryHeld = true), onUp: () => (this.engine.touchPrimaryHeld = false) },
      { label: 'USE', onDown: () => this.engine.triggerSecondaryAction() },
      { label: 'JUMP', onDown: () => this.engine.queueTouchJump(true), onUp: () => this.engine.queueTouchJump(false) },
      { label: 'DASH', onDown: () => ((this.engine as any).dashQueued = true) },
      { label: 'HOOK', onDown: () => this.engine.triggerGrapple() },
      { label: 'HEAL', onDown: () => this.engine.triggerQuickHeal() },
    ];
    for (const b of btns) {
      const el = document.createElement('button');
      el.className = 'touch-btn';
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

    this.root.append(this.stickEl, lookPad, actions);
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
    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.lookTouchId === null && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lastLook = { x: t.clientX, y: t.clientY };
      }
    });
    pad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) {
          const dx = t.clientX - this.lastLook.x;
          const dy = t.clientY - this.lastLook.y;
          this.lastLook = { x: t.clientX, y: t.clientY };
          this.engine.cameraCtrl.rotate(dx * 1.4, dy * 1.4, this.engine.settings.cameraSensitivity, this.engine.settings.invertY);
        }
      }
    });
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };
    pad.addEventListener('touchend', endLook);
    pad.addEventListener('touchcancel', endLook);
  }
}
