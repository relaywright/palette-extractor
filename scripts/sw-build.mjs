// Turns public/sw.js into the worker a build ships. Every build writes a
// different worker (a revision hashed from the files it lists), so browsers
// install it on each deploy and it saves exactly the files that deploy uses.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

// The pages that work offline, and the file each one is built from.
const PAGE_FILES = { "/": "index.html", "/how.html": "how.html" };
const FILE_DIRS = ["assets", "samples", "fonts"];
const FILE_TYPES = /\.(?:js|css|woff2|webp|png|jpe?g|svg|avif|gif)$/;
const ROOT_FILES = /^(?:icon-\d+|apple-touch-icon)\.png$/;

// The lines of the template that a build fills in; each must appear once.
const SLOTS = {
  revision: 'const REVISION = "development";',
  pages: "const PAGES = [];",
  files: "const FILES = [];",
};

function walk(dir, prefix) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name), posix.join(prefix, entry.name))
      : [posix.join(prefix, entry.name)],
  );
}

/** Every build file a page can request, as root-relative paths. */
export function listFiles(outDir) {
  const inFolders = FILE_DIRS.flatMap((dir) =>
    walk(join(outDir, dir), `/${dir}`).filter((url) => FILE_TYPES.test(url)),
  );
  const atRoot = readdirSync(outDir).filter(
    (name) => ROOT_FILES.test(name) && statSync(join(outDir, name)).isFile(),
  );
  return [...inFolders, ...atRoot.map((name) => `/${name}`)].sort();
}

function hashOf(outDir, pages, files) {
  const hash = createHash("sha256");
  const sources = [
    ...pages.map((page) => [page, PAGE_FILES[page]]),
    ...files.map((url) => [url, url.slice(1)]),
  ];
  for (const [url, file] of sources)
    hash
      .update(`${url}\0`)
      .update(readFileSync(join(outDir, file)))
      .update("\0");
  return hash.digest("hex").slice(0, 12);
}

/** The worker's source for the build in `outDir`, built from the template. */
export function buildServiceWorker(outDir, template) {
  const pages = Object.keys(PAGE_FILES);
  const files = listFiles(outDir);
  const revision = hashOf(outDir, pages, files);
  const values = {
    revision: `const REVISION = ${JSON.stringify(revision)};`,
    pages: `const PAGES = ${JSON.stringify(pages)};`,
    files: `const FILES = ${JSON.stringify(files, null, 2)};`,
  };
  let source = template;
  for (const [slot, line] of Object.entries(SLOTS)) {
    if (source.split(line).length !== 2)
      throw new Error(`The service worker template needs one "${line}" line.`);
    source = source.replace(line, () => values[slot]);
  }
  return { source, revision, pages, files };
}

/** Writes `sw.js` into a finished build, replacing the unfilled copy. */
export function writeServiceWorker(outDir, templatePath) {
  const built = buildServiceWorker(outDir, readFileSync(templatePath, "utf8"));
  writeFileSync(join(outDir, "sw.js"), built.source);
  return built;
}

export function serviceWorkerPlugin() {
  let config;
  return {
    name: "service-worker",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle() {
      const outDir = join(config.root, config.build.outDir);
      writeServiceWorker(outDir, join(config.publicDir, "sw.js"));
    },
  };
}
