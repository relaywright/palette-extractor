// Turns public/sw.js into the worker a build ships. Every build writes a
// different worker (a revision hashed from the files it lists and from its
// own code), so browsers install it on each deploy and it saves exactly the
// files that deploy uses.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";

// The worker that retires the offline worker instead of replacing it.
const RETIRE_TEMPLATE = new URL("./sw-retire.js", import.meta.url);

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

function hashOf(outDir, pages, files, template) {
  // The worker's own code counts: an update to it alone still needs a cache
  // of its own, not the one the running worker uses.
  const hash = createHash("sha256").update(template).update("\0");
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
  const revision = hashOf(outDir, pages, files, template);
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

/** The worker a SW_OFF build ships: it removes the offline worker. */
export function buildRetireWorker() {
  return readFileSync(RETIRE_TEMPLATE, "utf8");
}

/**
 * Writes `sw.js` into a finished build, replacing the unfilled copy. With
 * `off`, it writes the worker that retires the offline worker instead.
 */
export function writeServiceWorker(outDir, templatePath, { off = false } = {}) {
  if (off) {
    writeFileSync(join(outDir, "sw.js"), buildRetireWorker());
    return null;
  }
  const built = buildServiceWorker(outDir, readFileSync(templatePath, "utf8"));
  writeFileSync(join(outDir, "sw.js"), built.source);
  return built;
}

// SW_OFF=1 is the owner's off switch: a bad worker is removed from every
// browser by deploying a build made with it set.
export function serviceWorkerPlugin({ off = process.env.SW_OFF === "1" } = {}) {
  let config;
  return {
    name: "service-worker",
    apply: "build",
    // The page reads this to retire a worker instead of registering one.
    config() {
      return {
        define: {
          "import.meta.env.VITE_SW_OFF": JSON.stringify(off ? "1" : ""),
        },
      };
    },
    configResolved(resolved) {
      config = resolved;
    },
    writeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      writeServiceWorker(outDir, join(config.publicDir, "sw.js"), { off });
    },
  };
}
