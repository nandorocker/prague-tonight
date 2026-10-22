/**
 * Drag the top card: right saves, left passes, up super-likes. The card owns
 * every touch (touch-action: none), so the page itself never moves. A short
 * still press counts as a tap.
 */
export type Direction = 'left' | 'right' | 'up';

interface Handlers {
  onCommit(dir: Direction): void;
  onTap(): void;
  onDragState?(dragging: boolean): void;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const STAMP_CLASS: Record<Direction, string> = { right: 'is-saving', left: 'is-passing', up: 'is-super' };

/**
 * Send the card off screen. From a button press the stamp pops first so the
 * word is readable; from a drag it's already showing.
 */
export function flyOut(card: HTMLElement, dir: Direction, done: () => void, fromButton = false) {
  card.classList.add(STAMP_CLASS[dir]);
  if (reducedMotion()) {
    setTimeout(done, fromButton ? 350 : 0);
    return;
  }
  const go = () => {
    card.style.transition = 'transform 280ms cubic-bezier(.3,.6,.4,1), opacity 280ms';
    card.style.transform =
      dir === 'up'
        ? 'translateY(-120%) scale(0.96)'
        : `translateX(${dir === 'right' ? 130 : -130}%) rotate(${dir === 'right' ? 14 : -14}deg)`;
    card.style.opacity = '0';
    setTimeout(done, 260);
  };
  if (fromButton) {
    card.classList.add('stamp-pop');
    setTimeout(go, 420);
  } else go();
}

export function attachSwipe(card: HTMLElement, h: Handlers) {
  let id: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let dx = 0;
  let dy = 0;
  let dragging = false;

  const setStamp = (x: number, y: number) => {
    const up = -y > Math.abs(x) ? Math.max(0, Math.min(1, -y / 110)) : 0;
    card.style.setProperty('--save', String(up ? 0 : Math.max(0, Math.min(1, x / 90))));
    card.style.setProperty('--pass', String(up ? 0 : Math.max(0, Math.min(1, -x / 90))));
    card.style.setProperty('--super', String(up));
  };

  const reset = () => {
    card.style.transition = 'transform 240ms cubic-bezier(.2,.8,.2,1)';
    card.style.transform = '';
    setStamp(0, 0);
  };

  card.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || id !== null) return;
    id = ev.pointerId;
    x0 = ev.clientX;
    y0 = ev.clientY;
    t0 = performance.now();
    dx = dy = 0;
    dragging = false;
    card.style.transition = 'none';
    try {
      card.setPointerCapture(ev.pointerId);
    } catch {
      /* pointer already released */
    }
  });

  card.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== id) return;
    dx = ev.clientX - x0;
    dy = ev.clientY - y0;
    if (!dragging && Math.hypot(dx, dy) > 8) {
      dragging = true;
      h.onDragState?.(true);
    }
    if (!dragging) return;
    // Downward drags only give a little: there's nothing to commit there.
    const y = dy > 0 ? dy * 0.25 : dy;
    card.style.transform = `translate(${dx}px, ${y}px) rotate(${dx / 22}deg)`;
    setStamp(dx, dy);
  });

  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    id = null;
    const dt = performance.now() - t0;
    if (dragging) {
      h.onDragState?.(false);
      if (ev.type === 'pointercancel') {
        reset();
        return;
      }
      const vx = Math.abs(dx) / Math.max(dt, 1);
      const vy = -dy / Math.max(dt, 1);
      const upward = -dy > Math.abs(dx);
      if (upward && (-dy > card.offsetHeight * 0.22 || (vy > 0.6 && -dy > 50))) {
        h.onCommit('up');
        return;
      }
      if (!upward && (Math.abs(dx) > card.offsetWidth * 0.3 || (vx > 0.6 && Math.abs(dx) > 40))) {
        h.onCommit(dx > 0 ? 'right' : 'left');
        return;
      }
      reset();
      return;
    }
    reset();
    if (ev.type === 'pointerup' && dt < 600) h.onTap();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}
