import { Component, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { RGB } from "../lib/color";
import { ChunkLoadError } from "../lib/lazyPanel";
import { encodePaletteHash } from "../lib/share";
import "./panel-boundary.css";

const CHECK_MS = 4000;

const entryOf = (root: ParentNode) =>
  root.querySelector('script[type="module"][src]')?.getAttribute("src") ?? null;
const absolute = (src: string) => new URL(src, `${location.origin}/`).href;

/**
 * Whether the host now serves a different build than the one running (a tab
 * left open across a deploy). False when the check itself fails, as it does
 * offline.
 */
async function newerBuildServed(): Promise<boolean> {
  const running = entryOf(document);
  if (!running) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_MS);
  try {
    const response = await fetch("/", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const html = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    const served = entryOf(html);
    return !!served && absolute(served) !== absolute(running);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// The palette on screen, which a reload carries through the address.
let shownPalette: RGB[] = [];

/** Tells "Reload page" which palette to keep. Renders nothing. */
export function ReloadPalette({ colors }: { colors: RGB[] }) {
  useEffect(() => {
    shownPalette = colors;
  }, [colors]);
  return null;
}

function reloadPage() {
  // replaceState never fires hashchange, so the page does not start loading
  // the palette it already shows.
  if (shownPalette.length)
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}${encodePaletteHash(shownPalette)}`,
    );
  location.reload();
}

// Floating notices share one fixed corner and stack there, so two failures
// never sit on top of each other.
function noticeStack() {
  let stack = document.querySelector<HTMLElement>(".panel-notices");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "panel-notices";
    document.body.append(stack);
  }
  return stack;
}

type Props = {
  children: ReactNode;
  /** A change of value clears a failure, so the owner's next state gets its own try. */
  resetKey?: string;
  /** Shows the notice as a small floating card, for parts with no panel space. */
  floating?: boolean;
  /** Called when a floating notice is dismissed, to undo the state that asked for the part. */
  onDismiss?: () => void;
};
type State = {
  failure: "load" | "render" | null;
  error: unknown;
  newer: boolean;
  dismissed: boolean;
};

const CLEAR: State = {
  failure: null,
  error: undefined,
  newer: false,
  dismissed: false,
};

/**
 * Keeps a part of the page that failed from taking the app down. A failed
 * download (ChunkLoadError) and a bug in the part get different wording; both
 * offer a reload that keeps the palette, and neither reloads on its own.
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = CLEAR;
  private alive = false;
  private attempt = 0;
  private noticed: unknown;
  private opener: Element | null = null;

  static getDerivedStateFromError(error: unknown): State {
    return {
      ...CLEAR,
      failure: error instanceof ChunkLoadError ? "load" : "render",
      error,
    };
  }

  componentDidMount() {
    // Strict Mode unmounts and remounts once in development.
    this.alive = true;
  }

  componentDidCatch(error: unknown) {
    if (!(error instanceof ChunkLoadError)) {
      console.error(error);
      return;
    }
    const attempt = this.attempt;
    void newerBuildServed().then((newer) => {
      if (this.alive && newer && attempt === this.attempt)
        this.setState({ newer: true });
    });
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.failure) {
      this.attempt++;
      this.setState(CLEAR);
    }
  }

  componentWillUnmount() {
    this.alive = false;
  }

  // The notice takes focus once per failure: a part that fails again right
  // after a reset must not pull focus off the control that caused the reset.
  private focusNotice = (notice: HTMLDivElement | null) => {
    if (!notice || this.noticed === this.state.error) return;
    this.noticed = this.state.error;
    this.opener = document.activeElement;
    notice.focus();
  };

  private dismiss = () => {
    const opener = this.opener;
    this.setState({ dismissed: true });
    this.props.onDismiss?.();
    requestAnimationFrame(() => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    });
  };

  render() {
    const { failure, newer, dismissed } = this.state;
    if (!failure) return this.props.children;
    if (dismissed) return null;
    const { floating } = this.props;
    const notice = (
      <div
        ref={this.focusNotice}
        className={floating ? "panel-boundary floating" : "panel-boundary"}
        role="alert"
        tabIndex={-1}
      >
        <p>
          {failure === "render"
            ? "Something went wrong in this part of the app."
            : newer
              ? "A newer version of the app is available."
              : "This part of the app could not load."}
        </p>
        <div className="panel-boundary-actions">
          <button
            type="button"
            className="button secondary"
            onClick={reloadPage}
          >
            Reload page
          </button>
          {floating && (
            <button
              type="button"
              className="button quiet"
              onClick={this.dismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
    return floating ? createPortal(notice, noticeStack()) : notice;
  }
}
