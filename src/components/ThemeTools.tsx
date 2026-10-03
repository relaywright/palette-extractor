import { useState } from "react";
import { type RGB, rgbToHex } from "../lib/color";
import { ROLE_NAMES, type RoleName, type resolveRoles } from "../lib/theme";
import { type ThemeFormat, exportTheme } from "../lib/themeExport";
import { Icon } from "./Icon";

const ROLE_LABELS: Record<RoleName, string> = {
  surface: "Surface",
  text: "Type",
  accent: "Accent",
};

const THEME_FORMATS: [ThemeFormat, string][] = [
  ["css", "CSS"],
  ["tailwind", "Tailwind"],
  ["json", "JSON"],
];

type Roles = NonNullable<ReturnType<typeof resolveRoles>>;

/** Role picker, reset and export for the In context tab. */
export function ThemeTools({
  palette,
  roles,
  onAssign,
  onReset,
  copied,
  onCopy,
}: {
  palette: RGB[];
  roles: Roles;
  onAssign: (role: RoleName, index: number) => void;
  onReset: () => void;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const [active, setActive] = useState<RoleName | null>(null);
  const [format, setFormat] = useState<ThemeFormat>("css");
  const [dropTarget, setDropTarget] = useState<RoleName | null>(null);
  const code = exportTheme(roles, format);
  // The text itself keys the confirmation, so it goes away when the output
  // changes.
  const copyKey = `theme ${code}`;
  return (
    <>
      <div className="role-picker" role="group" aria-label="Theme roles">
        {ROLE_NAMES.map((role) => (
          <button
            key={role}
            className={`role-button ${dropTarget === role ? "is-drop" : ""}`}
            aria-pressed={active === role}
            onClick={() => setActive(active === role ? null : role)}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(role);
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              const index = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isInteger(index) && palette[index])
                onAssign(role, index);
            }}
          >
            <i style={{ background: rgbToHex(roles[role]) }} />
            <span>{ROLE_LABELS[role]}</span>
            <code>{rgbToHex(roles[role])}</code>
          </button>
        ))}
      </div>
      {active && (
        <div
          className="role-chips"
          role="group"
          aria-label={`Choose a color for ${ROLE_LABELS[active]}`}
        >
          {palette.map((c, i) => (
            <button
              key={i}
              draggable
              aria-label={rgbToHex(c)}
              aria-pressed={roles.indices[active] === i}
              style={{ background: rgbToHex(c) }}
              onClick={() => onAssign(active, i)}
              onDragStart={(e) =>
                e.dataTransfer.setData("text/plain", String(i))
              }
              onDragEnd={() => setDropTarget(null)}
            />
          ))}
        </div>
      )}
      {roles.changed && (
        <button
          className="text-button"
          onClick={() => {
            onReset();
            setActive(null);
          }}
        >
          <Icon name="refresh" size={14} /> Reset roles
        </button>
      )}
      <div className="theme-export">
        <div
          className="theme-format"
          role="group"
          aria-label="Theme export format"
        >
          {THEME_FORMATS.map(([f, label]) => (
            <button
              key={f}
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="button secondary"
          onClick={() => onCopy(code, copyKey)}
        >
          <Icon name={copied === copyKey ? "check" : "copy"} size={16} />
          {copied === copyKey ? "Copied" : "Export this theme"}
        </button>
      </div>
    </>
  );
}
