/**
 * Horizontal swipe for the top card. Vertical movement is left to the
 * browser (touch-action: pan-y), and a short still press counts as a tap.
 */
export type Direction = 'left' | 'right';

interface Handlers {
  onCommit(dir: Direction): void;
  onTap(): void;
  onDragState?(dragging: boolean): void;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function flyOut(card: HTMLElement, dir: Direction, done: () => void) {
  if (reducedMotion()) {
    done();
    return;
  }
  const sign = dir === 'right' ? 1 : -1;
  card.style.transition = 'transform 260ms cubic-bezier(.2,.7,.3,1), opacity 260ms';
  card.style.transform = `translateX(${sign * 130}%) rotate(${sign * 14}deg)`;
  card.style.opacity = '0';
  card.classList.add(dir === 'right' ? 'is-saving' : 'is-passing');
  setTimeout(done, 240);
}

export function attachSwipe(card: HTMLElement, h: Handlers) {
  let id: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let dx = 0;
  let horizontal: boolean | null = null;

  const setStamp = (v: number) => {
    card.style.setProperty('--save', String(Math.max(0, Math.min(1, v / 90))));
    card.style.setProperty('--pass', String(Math.max(0, Math.min(1, -v / 90))));
  };

  const reset = () => {
    card.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
    card.style.transform = '';
    setStamp(0);
  };

  card.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || id !== null) return;
    id = ev.pointerId;
    x0 = ev.clientX;
    y0 = ev.clientY;
    t0 = performance.now();
    dx = 0;
    horizontal = null;
    card.style.transition = 'none';
  });

  card.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== id) return;
    const mx = ev.clientX - x0;
    const my = ev.clientY - y0;
    if (horizontal === null && Math.hypot(mx, my) > 8) {
      horizontal = Math.abs(mx) > Math.abs(my) * 1.2;
      if (horizontal) {
        try {
          card.setPointerCapture(ev.pointerId);
        } catch {
          /* pointer already released */
        }
        h.onDragState?.(true);
      }
    }
    if (!horizontal) return;
    dx = mx;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    setStamp(dx);
  });

  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    id = null;
    const dt = performance.now() - t0;
    const moved = Math.hypot(ev.clientX - x0, ev.clientY - y0);
    if (horizontal) {
      h.onDragState?.(false);
      if (ev.type === 'pointercancel') {
        reset();
        return;
      }
      const velocity = Math.abs(dx) / Math.max(dt, 1);
      if (Math.abs(dx) > card.offsetWidth * 0.3 || (velocity > 0.6 && Math.abs(dx) > 40)) {
        h.onCommit(dx > 0 ? 'right' : 'left');
        return;
      }
      reset();
      return;
    }
    reset();
    if (ev.type === 'pointerup' && moved < 8 && dt < 600) h.onTap();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}
