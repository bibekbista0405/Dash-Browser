import { useEffect, useRef, useState } from 'react';
import type { LayoutDivider } from '../../shared/ipc-channels';

/** Draggable strips between the page and the side panel / DevTools, and between split panes. Double-click resets. */
export function LayoutDividers() {
  const [list, setList] = useState<LayoutDivider[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const current = useRef<LayoutDivider[]>([]);
  const raf = useRef(0);

  useEffect(() => window.dash.layout.onDividers((d) => { current.current = d; setList(d); }), []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const move = (id: LayoutDivider['id'], e: React.PointerEvent) => {
    const d = current.current.find((x) => x.id === id);
    if (!d) return;
    const pos = d.axis === 'x' ? e.clientX : e.clientY;
    const thickness = d.axis === 'x' ? d.width : d.height;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      void window.dash.layout.setDivider(id, (pos - thickness / 2 - d.areaStart) / d.areaSize);
    });
  };

  return (
    <>
      {list.map((d) => (
        <div
          key={d.id}
          role="separator"
          aria-orientation={d.axis === 'x' ? 'vertical' : 'horizontal'}
          aria-label="Resize (double-click to reset)"
          className={`fixed z-30 flex items-center justify-center ${d.axis === 'x' ? 'cursor-col-resize' : 'cursor-row-resize'} ${dragging === d.id ? 'bg-accent/20' : 'hover:bg-accent/15'}`}
          style={{ left: d.x, top: d.y, width: d.width, height: d.height, touchAction: 'none' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(d.id);
          }}
          onPointerMove={(e) => dragging === d.id && move(d.id, e)}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
          onDoubleClick={() => void window.dash.layout.setDivider(d.id, d.resetTo)}
        >
          <div className={d.axis === 'x' ? 'w-px h-full bg-border' : 'h-px w-full bg-border'} />
        </div>
      ))}
    </>
  );
}
