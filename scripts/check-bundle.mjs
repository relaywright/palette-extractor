// Fails the build when the JavaScript a first visit downloads, or the lazily
// loaded Stage renderer, grows past its gzip budget. Sizes are measured the
// way they travel: each file gzipped on its own.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const DEFAULT_BUDGETS = { firstLoad: 75 * 1024, stage: 15 * 1024 };
const STAGE_SOURCE = "src/components/Stage.tsx";
const WORKER_FILE = /^quantize\.worker-[\w-]+\.js$/;

// A ">" inside a quoted value does not end the tag.
function tagsOf(html, name) {
  return [
    ...html.matchAll(
      new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi"),
    ),
  ].map((m) => m[0]);
}

// Walks the tag one attribute at a time, so text inside a quoted value is
// never read as an attribute of its own. HTML allows double, single or no
// quotes and spaces around "="; the first of duplicate attributes wins.
const ATTRIBUTE =
  /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
function attr(tag, name) {
  const body = tag.replace(/^<[^\s>\/]+/, "");
  for (const m of body.matchAll(ATTRIBUTE))
    if (m[1].toLowerCase() === name)
      return decodeReferences(m[2] ?? m[3] ?? m[4] ?? "");
  return undefined;
}

// A browser reads character references in attribute values before using
// them, so rel="moduleprelo&#97;d" is a preload. The named ones are those
// that can spell a path, a MIME type or a rel token. Only the legacy ones (amp,
// lt, gt, quot, nbsp) may omit the semicolon, and not when "=" follows.
const NAMED_REFERENCES = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  nbsp: "\u00a0",
  apos: "'",
  sol: "/",
  bsol: "\\",
  colon: ":",
  period: ".",
  comma: ",",
  semi: ";",
  equals: "=",
  num: "#",
  quest: "?",
  percnt: "%",
  plus: "+",
  lowbar: "_",
  Tab: "\t",
  NewLine: "\n",
};
const BARE_REFERENCES = new Set([
  "amp",
  "AMP",
  "lt",
  "LT",
  "gt",
  "GT",
  "quot",
  "QUOT",
  "nbsp",
]);
function decodeReferences(value) {
  return value.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*))(;?)/g,
    (match, decimal, hex, name, semicolon, offset) => {
      if (name !== undefined) {
        const known = Object.hasOwn(NAMED_REFERENCES, name);
        if (!known || (!semicolon && !BARE_REFERENCES.has(name))) return match;
        if (!semicolon && value[offset + match.length] === "=") return match;
        return NAMED_REFERENCES[name];
      }
      const code = decimal !== undefined ? Number(decimal) : parseInt(hex, 16);
      const valid =
        code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : "\ufffd";
    },
  );
}

// Script types a browser runs as classic JavaScript (the HTML standard's
// JavaScript MIME types). A script with no type is classic too.
const JAVASCRIPT_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "application/x-ecmascript",
  "application/x-javascript",
  "text/ecmascript",
  "text/javascript",
  "text/javascript1.0",
  "text/javascript1.1",
  "text/javascript1.2",
  "text/javascript1.3",
  "text/javascript1.4",
  "text/javascript1.5",
  "text/jscript",
  "text/livescript",
  "text/x-ecmascript",
  "text/x-javascript",
]);
// Browsers that run modules skip nomodule scripts, so they cost nothing.
function isClassicScript(tag) {
  if (attr(tag, "nomodule") !== undefined) return false;
  const type = (attr(tag, "type") ?? "").split(";")[0].trim().toLowerCase();
  return type === "" || JAVASCRIPT_TYPES.has(type);
}

/** One spelling per manifest file: "./assets/a.js" and "assets/a.js" are the same. */
const canonical = (path) =>
  posix.normalize(path.replace(/^(?:\.?\/)+/, "")).replace(/^(?:\.\/)+/, "");

// index.html is served from the site root. A reference is resolved with URL
// rules (dot segments stop at the root), and anything that is not a plain
// same-origin path, such as another origin, a query or a fragment, cannot be
// tied to a file in this build. An empty "?" or "#" still counts: `search`
// and `hash` read as "" for those, so the serialized URL is checked instead.
// Built file names never need percent-encoding, and browsers fetch a module
// once per address, so an encoded spelling would be a second download of a
// file the totals count once; only the plain spelling is accepted.
const SITE = "https://build.invalid/";
function fileOfReference(ref) {
  let url;
  try {
    url = new URL(ref, SITE);
  } catch {
    return null;
  }
  if (
    url.origin !== new URL(SITE).origin ||
    /[?#]/.test(url.href) ||
    url.pathname.includes("%")
  )
    return null;
  return url.pathname.replace(/^\//, "");
}

/**
 * `requireStage` (on by default) makes a missing or eagerly bundled Stage a
 * failure, so a rename or an accidental static import cannot slip past the
 * renderer budget.
 */
export function checkBundle(
  distDir,
  budgets = DEFAULT_BUDGETS,
  { requireStage = true, page = "index.html", workerFile = WORKER_FILE } = {},
) {
  const problems = [];
  const rows = [];
  const htmlPath = join(distDir, page);
  const manifestPath = join(distDir, ".vite", "manifest.json");
  if (!existsSync(htmlPath)) problems.push(`${page} is missing`);
  if (!existsSync(manifestPath))
    problems.push(".vite/manifest.json is missing (build.manifest must be on)");
  if (problems.length) return { ok: false, rows, problems };

  const html = readFileSync(htmlPath, "utf8");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const keyOfFile = new Map(
    Object.entries(manifest).map(([key, chunk]) => [
      canonical(chunk.file),
      key,
    ]),
  );
  // `stopAt` names files already counted elsewhere: the walk neither counts
  // them nor follows their imports, so a lazy chunk that imports the entry
  // does not pull in the entry's other lazy chunks.
  const closure = (keys, { lazy = false, stopAt = new Set() } = {}) => {
    const files = new Set();
    const seen = new Set();
    const walk = (key) => {
      if (seen.has(key) || !manifest[key]) return;
      seen.add(key);
      if (!keys.includes(key) && stopAt.has(canonical(manifest[key].file)))
        return;
      files.add(canonical(manifest[key].file));
      for (const next of manifest[key].imports ?? []) walk(next);
      if (lazy)
        for (const next of manifest[key].dynamicImports ?? []) walk(next);
    };
    keys.forEach(walk);
    return files;
  };

  // Browsers match type in any case and treat rel as a list of tokens.
  const modules = tagsOf(html, "script").filter(
    (tag) => attr(tag, "type")?.trim().toLowerCase() === "module",
  );
  const scripts = modules.map((tag) => attr(tag, "src")).filter(Boolean);
  if (!scripts.length) problems.push(`${page} has no module script`);
  if (scripts.length < modules.length)
    problems.push(
      `${page} has an inline module script; its imports cannot be measured`,
    );
  const preloads = tagsOf(html, "link")
    .filter((tag) =>
      (attr(tag, "rel") ?? "")
        .toLowerCase()
        .split(/[\t\n\f\r ]+/)
        .includes("modulepreload"),
    )
    .map((tag) => attr(tag, "href"))
    .filter(Boolean);
  const fileOrProblem = (ref, into) => {
    const file = fileOfReference(ref);
    if (file === null)
      problems.push(
        `${ref} is loaded by ${page} but cannot be mapped to a file in this build`,
      );
    else into.push(file);
  };
  const htmlFiles = [];
  for (const ref of [...scripts, ...preloads]) fileOrProblem(ref, htmlFiles);
  // A classic script cannot import anything, so it needs no manifest entry;
  // its own size is all there is to count.
  const classicFiles = [];
  for (const tag of tagsOf(html, "script").filter(isClassicScript)) {
    const src = attr(tag, "src");
    if (src) fileOrProblem(src, classicFiles);
  }

  // A module the manifest does not list could import anything unmeasured.
  for (const file of htmlFiles)
    if (!keyOfFile.has(file))
      problems.push(
        `${file} is loaded by ${page} but not in the manifest, so its imports cannot be measured`,
      );
  const firstLoad = new Set(htmlFiles);
  for (const file of closure(
    htmlFiles.map((f) => keyOfFile.get(f)).filter(Boolean),
  ))
    firstLoad.add(file);
  for (const file of classicFiles) firstLoad.add(file);

  const assetsDir = join(distDir, "assets");
  const workers = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((name) => workerFile.test(name))
    : [];
  if (workers.length !== 1)
    problems.push(
      `expected exactly one startup worker file, found ${workers.length}`,
    );
  for (const name of workers) firstLoad.add(`assets/${name}`);

  const measure = (files) => {
    let total = 0;
    for (const file of files) {
      const path = join(distDir, file);
      if (!existsSync(path)) {
        problems.push(`referenced file is missing: ${file}`);
        continue;
      }
      total += gzipSync(readFileSync(path)).length;
    }
    return total;
  };
  const budgetRow = (name, files, limit) => {
    const bytesGzip = measure(files);
    rows.push({
      name,
      files: [...files],
      bytesGzip,
      limit,
      status: bytesGzip > limit ? "fail" : "pass",
    });
  };

  budgetRow("first-load JS", firstLoad, budgets.firstLoad);

  const stageKey = Object.keys(manifest).find(
    (key) => key === STAGE_SOURCE || manifest[key].src === STAGE_SOURCE,
  );
  // The manifest is shared by every page, but only a page that can load the
  // Stage answers for its budget. Measuring it from another page would count
  // the whole app, which that page does not share, against the Stage.
  const stageFile = stageKey && canonical(manifest[stageKey].file);
  const stageReachable =
    stageKey &&
    (firstLoad.has(stageFile) ||
      closure(htmlFiles.map((f) => keyOfFile.get(f)).filter(Boolean), {
        lazy: true,
      }).has(stageFile));
  if (stageReachable) {
    if (
      firstLoad.has(canonical(manifest[stageKey].file)) ||
      !manifest[stageKey].isDynamicEntry
    )
      problems.push(
        "the Stage chunk is part of first-load JS; it must stay lazily loaded",
      );
    const stageFiles = [
      ...closure([stageKey], { lazy: true, stopAt: firstLoad }),
    ].filter((file) => !firstLoad.has(file));
    budgetRow("Stage chunk", stageFiles, budgets.stage);
  } else {
    if (requireStage)
      problems.push(
        stageKey
          ? `${page} never loads the Stage chunk (${STAGE_SOURCE})`
          : `no lazily loaded Stage chunk (${STAGE_SOURCE}) in the manifest`,
      );
    rows.push({
      name: "Stage chunk",
      files: [],
      bytesGzip: 0,
      limit: budgets.stage,
      status: "skipped",
    });
  }

  const ok =
    problems.length === 0 && rows.every((row) => row.status !== "fail");
  return { ok, rows, problems };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;

/**
 * The lines to print for one page's result. A failing row always prints its
 * numbers, and a failure with neither a failing row nor a problem still says
 * so, so the exit code is never the only sign.
 */
export function reportLines({ ok, rows, problems }, name, index) {
  const lines = [];
  for (const row of rows) {
    // Only the entry page has a Stage chunk to report as skipped.
    if (index > 0 && row.status === "skipped") continue;
    const note =
      row.status === "skipped"
        ? "no Stage chunk yet"
        : `${kb(row.bytesGzip)} of ${kb(row.limit)}`;
    const label = index > 0 ? `${name} ${row.name}` : row.name;
    lines.push(
      `${row.status.toUpperCase().padEnd(8)}${label.padEnd(index > 0 ? 28 : 16)}${note}`,
    );
  }
  for (const problem of problems) lines.push(`FAIL    ${name}: ${problem}`);
  if (!ok && !problems.length && !rows.some((row) => row.status === "fail"))
    lines.push(`FAIL    ${name}: failed without a reported reason`);
  return lines;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dist = resolve("dist");
  const runs = [
    checkBundle(dist),
    // The explainer page has no Stage and its own worker.
    checkBundle(dist, DEFAULT_BUDGETS, {
      page: "how.html",
      workerFile: /^analysis\.worker-[\w-]+\.js$/,
      requireStage: false,
    }),
  ];
  const names = ["index.html", "how.html"];
  runs.forEach((run, i) => {
    for (const line of reportLines(run, names[i], i)) console.log(line);
  });
  const ok = runs.every((run) => run.ok);
  process.exit(ok ? 0 : 1);
}
