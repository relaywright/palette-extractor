import { Component, type ReactNode } from "react";
import { retryFailedLoads } from "../lib/retryableLazy";
import "./panel-boundary.css";

const CHECK_MS = 4000;

const entryOf = (root: ParentNode) =>
  root.querySelector('script[type="module"][src]')?.getAttribute("src") ?? null;
const absolute = (src: string) => new URL(src, `${location.origin}/`).href;

/**
 * The address of the page's entry script if the host now serves a different
 * build than the one running, otherwise null (also when the check itself
 * fails, as it does offline).
 */
async function newerEntry(): Promise<string | null> {
  const running = entryOf(document);
  if (!running) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_MS);
  try {
    const response = await fetch("/", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    const served = entryOf(html);
    return served && absolute(served) !== absolute(running)
      ? absolute(served)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Each build may trigger one reload, so a chunk that stays unreachable can
// never start a loop. Without storage there is no guard, so no reload.
function claimReload(entry: string) {
  const key = `reloaded-for:${entry}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

type Props = {
  children: ReactNode;
  /** A change of value clears a failure, so another panel gets its own try. */
  resetKey?: string;
  /** Shows the notice as a small floating card, for parts with no panel space. */
  floating?: boolean;
};
type State = {
  phase: "ok" | "checking" | "updating" | "failed" | "dismissed";
};

/**
 * Keeps a part of the page that failed to load from taking the app down. A
 * failed import is usually a dropped connection, so the notice offers a retry;
 * only when the host serves a newer build (a tab left open across a deploy)
 * does it reload.
 */
export class PanelBoundary extends Component<Props, State> {
  state: State = { phase: "ok" };
  private alive = true;
  private attempt = 0;

  static getDerivedStateFromError(): State {
    return { phase: "checking" };
  }

  componentDidCatch() {
    const attempt = this.attempt;
    void newerEntry().then((entry) => {
      if (!this.alive || attempt !== this.attempt) return;
      if (entry && claimReload(entry)) {
        this.setState({ phase: "updating" });
        location.reload();
      } else this.setState({ phase: "failed" });
    });
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.phase !== "ok")
      this.retry();
  }

  componentWillUnmount() {
    this.alive = false;
  }

  private retry = () => {
    this.attempt++;
    retryFailedLoads();
    this.setState({ phase: "ok" });
  };

  render() {
    const { phase } = this.state;
    if (phase === "ok") return this.props.children;
    if (phase === "checking" || phase === "dismissed") return null;
    const cls = this.props.floating
      ? "panel-boundary floating"
      : "panel-boundary";
    if (phase === "updating")
      return (
        <p className={cls} role="status">
          Updating to the latest version
        </p>
      );
    return (
      <div className={cls} role="status">
        <p>This part could not load. Check your connection, then try again.</p>
        <div className="panel-boundary-actions">
          <button
            type="button"
            className="button secondary"
            onClick={this.retry}
          >
            Try again
          </button>
          {this.props.floating && (
            <button
              type="button"
              className="button quiet"
              onClick={() => this.setState({ phase: "dismissed" })}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    );
  }
}
