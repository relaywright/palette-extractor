import { Suspense, useState } from "react";
import { type RGB, rgbToHex, labelColorFor } from "../lib/color";
import {
  type RolePicks,
  type RoleName,
  choiceFromPicks,
  picksFromChoice,
  resolveRoles,
} from "../lib/theme";
import { Icon } from "./Icon";
import { PanelBoundary } from "./PanelBoundary";
import { retryableLazy } from "../lib/retryableLazy";
import { formatRatio } from "../lib/contrast";
import "./theme-preview.css";

const ThemeTools = retryableLazy(() => import("./ThemeTools"), "ThemeTools");

const levelOf = (ratio: number) =>
  ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "Below AA for body text";

export function ThemePreview({
  palette,
  swatchIds,
  extraction,
  image,
  copied,
  onCopy,
}: {
  palette: RGB[];
  /** The swatch at each palette position, which picks follow. */
  swatchIds: string[];
  /** Names the extraction: a new one starts the picks over. */
  extraction: string;
  image: string | null;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  // Picks belong to swatches, so they survive a sort and a recolor, and
  // start over when the photo or the extracted colors change.
  const scope = extraction;
  const [picks, setPicks] = useState<{ scope: string; picks: RolePicks }>({
    scope,
    picks: {},
  });
  if (picks.scope !== scope) setPicks({ scope, picks: {} });
  const roles = resolveRoles(
    palette,
    picks.scope === scope ? choiceFromPicks(swatchIds, picks.picks) : {},
  );
  if (!roles) return null;
  const choose = (choice: Partial<Record<RoleName, number>>) =>
    setPicks({ scope, picks: picksFromChoice(swatchIds, choice) });
  const assign = (role: RoleName, index: number) =>
    choose({ ...roles.indices, [role]: index });
  if (roles.bestRatio < 4.5)
    return (
      <section className="context-panel" aria-label="Palette in context">
        <div className="panel-intro">
          <h2>
            Beautiful colors.
            <br />
            They need a partner.
          </h2>
          <p>
            The strongest text pairing here is only{" "}
            {formatRatio(roles.bestRatio)}
            :1. Try more colors or a different image to reach 4.5:1 for readable
            body text.
          </p>
        </div>
        <div
          className="low-contrast-art"
          aria-label="Your palette as an abstract composition"
          role="img"
        >
          {palette.map((c, i) => (
            <i key={i} style={{ background: rgbToHex(c) }} />
          ))}
        </div>
      </section>
    );
  const { surface: bg, text: fg } = roles;
  return (
    <section className="context-panel" aria-label="Palette in context">
      <div className="panel-intro theme-intro">
        <h2>See the possibilities.</h2>
        <p>
          A small identity, made entirely from your palette. Change the image
          and watch it take on a new character.
        </p>
        <button
          className="button secondary"
          onClick={() =>
            choose({
              ...roles.indices,
              surface: roles.indices.text,
              text: roles.indices.surface,
            })
          }
        >
          <Icon name="swap" /> Reverse light &amp; dark
        </button>
        <div className="theme-tools">
          <p className="contrast-note">
            <Icon name="contrast" size={14} /> {formatRatio(roles.textRatio)}
            :1 text contrast · {levelOf(roles.textRatio)}
          </p>
          <p className="accent-note">
            Accent on surface {formatRatio(roles.accentRatio)}:1
          </p>
          <PanelBoundary>
            <Suspense fallback={null}>
              <ThemeTools
                key={scope}
                palette={palette}
                roles={roles}
                onAssign={assign}
                onReset={() => setPicks({ scope, picks: {} })}
                copied={copied}
                onCopy={onCopy}
              />
            </Suspense>
          </PanelBoundary>
        </div>
      </div>
      <div
        className="brand-preview"
        style={{ background: rgbToHex(bg), color: rgbToHex(fg) }}
      >
        <div className="brand-nav">
          <strong>
            <span className="brand-symbol">✳</span> fieldnotes
          </strong>
          <span>Objects &amp; observations</span>
          <span>01 / 06</span>
        </div>
        <div className="brand-body">
          <div>
            <span className="brand-kicker">A STUDY IN EVERYDAY COLOR</span>
            <h3>
              A different
              <br />
              point of hue.
            </h3>
            <p>
              Find a little inspiration
              <br />
              in the things you almost missed.
            </p>
            <span
              className="brand-cta"
              style={{
                background: rgbToHex(roles.accent),
                color: labelColorFor(roles.accent),
              }}
            >
              Explore the collection <Icon name="arrow" size={16} />
            </span>
          </div>
          <div className="brand-art">
            {image ? (
              <img
                src={image}
                alt="Your source image applied to an editorial design"
              />
            ) : (
              <div className="abstract-art">
                {palette.map((c, i) => (
                  <i key={i} style={{ background: rgbToHex(c) }} />
                ))}
              </div>
            )}
            <span
              className="brand-sticker"
              style={{
                background: rgbToHex(roles.accent),
                color: labelColorFor(roles.accent),
              }}
            >
              Made of
              <br />
              small
              <br />
              moments.
            </span>
          </div>
        </div>
        <div className="brand-bottom">
          <span>COLLECTED, NOT CREATED.</span>
          <div>
            {palette.map((c, i) => (
              <i key={i} style={{ background: rgbToHex(c) }} />
            ))}
          </div>
          <span>PALETTE STUDY Nº 001</span>
        </div>
      </div>
    </section>
  );
}
