import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/** How far the handle is pulled down, in pixels, before letting go closes it. */
const CLOSE_DISTANCE = 80;
/**
 * The tab bar rests at the end of the page and pins to the bottom of the
 * screen once the page has scrolled this far. Pinned at the top it would
 * cover the last row of swatches that the first screen is built to show.
 */
const REVEAL_SCROLL = 80;

/**
 * Holds a panel on phones: it slides up above the tab bar, and closes with
 * its button, the Escape key, a tap on the dimmed page, or a swipe down on
 * the handle. Focus moves into the panel on open and back to `returnFocus`
 * on close.
 */
export default function BottomSheet({
  open,
  title,
  onClose,
  returnFocus,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  returnFocus: () => HTMLElement | null;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const drag = useRef<{ id: number; from: number; by: number } | null>(null);

  useEffect(() => {
    if (open)
      sheet.current?.querySelector<HTMLElement>("[role=tabpanel]")?.focus();
    else if (wasOpen.current) returnFocus()?.focus();
    wasOpen.current = open;
  }, [open]);

  // The stylesheet reads this to pin the tab bar. It stays pinned while the
  // sheet is open or the bar has focus, so neither jumps away mid-use.
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const bar = document.querySelector(".workbench-nav");
      const pinned =
        open ||
        scrollY > REVEAL_SCROLL ||
        !!bar?.contains(document.activeElement);
      root.dataset.tabBar = pinned ? "on" : "off";
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("focusin", update);
    addEventListener("focusout", update);
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("focusin", update);
      removeEventListener("focusout", update);
      delete root.dataset.tabBar;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const press = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, [open, onClose]);

  const move = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current.by = Math.max(0, e.clientY - drag.current.from);
    sheet.current!.style.transform = `translateY(${drag.current.by}px)`;
  };
  const release = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const { by } = drag.current;
    drag.current = null;
    sheet.current!.classList.remove("is-dragging");
    sheet.current!.style.transform = "";
    if (by > CLOSE_DISTANCE) onClose();
  };

  return (
    <>
      <div className="sheet-scrim" data-open={open} onClick={onClose} />
      <div ref={sheet} className="sheet" data-open={open}>
        <div className="sheet-head">
          <div
            className="sheet-handle"
            aria-hidden="true"
            onPointerDown={(e) => {
              drag.current = { id: e.pointerId, from: e.clientY, by: 0 };
              e.currentTarget.setPointerCapture(e.pointerId);
              sheet.current!.classList.add("is-dragging");
            }}
            onPointerMove={move}
            onPointerUp={release}
            onPointerCancel={release}
          >
            <i />
          </div>
          <span className="sheet-title">{title}</span>
          <button
            className="icon-button sheet-close"
            aria-label="Close panel"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
