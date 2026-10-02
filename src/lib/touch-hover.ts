// lib/touch-hover.ts - `use:touchHover`, so every chart that reacts to the
// mouse also works with a finger. Charts listen for mouse events (mousemove
// across the chart, or mouseenter/mouseleave on bars, dots and cells), which
// a touchscreen only sends on a tap. While a finger drags sideways across
// the chart, this replays them: a mousemove on the chart, and enter/leave
// on whatever is under the finger, the way a mouse would. A vertical swipe
// still scrolls the page (touch-action: pan-y), and lifting the finger
// leaves the readout where it was; the next tap anywhere moves it on.
// Mouse and pen hover are untouched: the browser already sends those.

// The point itself first, then rings a few pixels out.
const PROBE: [number, number][] = [
  [0, 0],
  [-4, 0], [4, 0], [0, -4], [0, 4],
  [-8, 0], [8, 0], [0, -8], [0, 8]
];

function chain(el: Element | null, root: Element): Element[] {
  const out: Element[] = [];
  for (let e = el; e && e !== root && root.contains(e); e = e.parentElement) out.push(e);
  return out; // deepest first
}

function send(el: Element, type: string, e: PointerEvent, bubbles: boolean) {
  el.dispatchEvent(new MouseEvent(type, { bubbles, cancelable: true, clientX: e.clientX, clientY: e.clientY, view: window }));
}

export function touchHover(node: HTMLElement | SVGElement) {
  node.style.touchAction = 'pan-y';
  node.style.userSelect = 'none';
  node.style.setProperty('-webkit-user-select', 'none');
  let hovered: Element[] = [];

  const track = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.type === 'pointermove' && e.buttons === 0) return;
    // The browser snaps a touch to a nearby target; do the same, so a
    // finger just beside a small cell still picks it.
    let under: Element[] = [];
    for (const [dx, dy] of PROBE) {
      const c = chain(document.elementFromPoint(e.clientX + dx, e.clientY + dy), node);
      if (c.length > under.length) under = c;
    }
    // Over a gap between items (the point only hits containers the current
    // item sits in), keep the item: a finger is far coarser than a mouse,
    // and small cells with gaps would otherwise flicker off.
    const inGap = under.length < hovered.length && under.every((el, i) => el === hovered[hovered.length - under.length + i]);
    if (inGap) {
      send(hovered[0]!, 'mousemove', e, true);
      return;
    }
    for (const el of hovered) if (!under.includes(el)) send(el, 'mouseleave', e, false);
    for (const el of [...under].reverse()) if (!hovered.includes(el)) send(el, 'mouseenter', e, false);
    hovered = under;
    send(under[0] ?? node, 'mousemove', e, true);
  };

  node.addEventListener('pointerdown', track as EventListener);
  node.addEventListener('pointermove', track as EventListener);
  return {
    destroy() {
      node.removeEventListener('pointerdown', track as EventListener);
      node.removeEventListener('pointermove', track as EventListener);
    }
  };
}
