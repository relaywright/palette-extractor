import { useEffect, useRef } from "react";
import "./shortcuts.css";

/** Add a row here and it shows up in the sheet. */
export const SHORTCUTS: { keys: string[]; action: string; joiner?: string }[] =
  [
    { keys: ["1", "9"], joiner: "to", action: "Select swatch 1 to 9" },
    { keys: ["0"], action: "Select swatch 10" },
    { keys: ["C"], action: "Copy the selected color" },
    { keys: ["Shift", "C"], action: "Copy the whole palette" },
    { keys: ["S"], action: "Copy the share link" },
    { keys: ["?"], action: "Show this list" },
  ];

export function ShortcutSheet({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = document.activeElement;
    el.showModal();
    // The browser puts focus back when a dialog closes; unmounting one that
    // is still open skips that, so do it here too.
    return () => {
      el.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="shortcut-sheet"
      aria-labelledby="shortcut-title"
      onClose={(e) => {
        // A close queued by an effect re-run arrives after the dialog reopened.
        if (!e.currentTarget.open) close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div className="shortcut-body">
        <h2 id="shortcut-title">Keyboard shortcuts</h2>
        <p>Shortcuts pause while you type in a field.</p>
        <dl>
          {SHORTCUTS.map(({ keys, action, joiner = "+" }) => (
            <div key={action}>
              <dt>
                {keys.map((key, i) => (
                  <span key={key}>
                    {i > 0 && ` ${joiner} `}
                    <kbd>{key}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <button className="button secondary" onClick={() => close.current()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
