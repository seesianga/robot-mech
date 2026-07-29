export class Input {
  private keys = new Set<string>();
  private pressedThisFrame = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  wantPointerLock = true;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // never swallow typing in login/menu form fields
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedThisFrame.add(e.code);
      if (['Space', 'Tab', 'KeyW', 'KeyS'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // mouse buttons as pseudo-codes so the bindings registry can map them
    const mouseCode = (b: number): string => (b === 0 ? 'MouseLeft' : b === 2 ? 'MouseRight' : 'MouseMiddle');
    window.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
      this.keys.add(mouseCode(e.button));
      this.pressedThisFrame.add(mouseCode(e.button));
    });
    window.addEventListener('mouseup', (e) => this.keys.delete(mouseCode(e.button)));
    window.addEventListener('contextmenu', (e) => {
      // RMB is the optics-zoom hold — never the browser menu over the game canvas
      if ((e.target as HTMLElement | null)?.tagName === 'CANVAS') e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || !this.wantPointerLock) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
  }

  requestPointerLock(): void {
    if (this.wantPointerLock && document.pointerLockElement !== this.el) {
      // stale gestures / headless shells reject the request — never fatal
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => { /* retried on the next click */ });
    }
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** Call once per frame after all systems have read input. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
