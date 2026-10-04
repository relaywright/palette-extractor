import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildRetireWorker,
  buildServiceWorker,
  listFiles,
  writeServiceWorker,
} from "./sw-build.mjs";

const template = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);

function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), "sw-build-"));
  for (const [name, content] of Object.entries({
    "index.html": "<!doctype html>",
    "how.html": "<!doctype html>",
    ...files,
  })) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const site = {
  "assets/main-a.js": "a",
  "assets/Panel-a.js": "b",
  "assets/main-a.css": "c",
  "samples/one.webp": "d",
  "fonts/face.woff2": "e",
  "icon-192.png": "f",
};

describe("listFiles", () => {
  it("lists what the pages request and leaves out the rest", () => {
    const dir = makeDist({
      ...site,
      "sw.js": "x",
      _headers: "x",
      "robots.txt": "x",
      "og-image.jpg": "x",
      "fonts/face-OFL.txt": "x",
      ".vite/manifest.json": "{}",
    });
    expect(listFiles(dir)).toEqual([
      "/assets/Panel-a.js",
      "/assets/main-a.css",
      "/assets/main-a.js",
      "/fonts/face.woff2",
      "/icon-192.png",
      "/samples/one.webp",
    ]);
  });
});

describe("buildServiceWorker", () => {
  it("fills in the revision, the pages and the files", () => {
    const { source, revision, files } = buildServiceWorker(
      makeDist(site),
      template,
    );
    expect(source).toContain(`const REVISION = "${revision}";`);
    expect(source).toContain('const PAGES = ["/","/how.html"];');
    for (const file of files) expect(source).toContain(`"${file}"`);
    expect(source).not.toContain('"development"');
  });

  it("gives the same revision to the same build", () => {
    expect(buildServiceWorker(makeDist(site), template).revision).toBe(
      buildServiceWorker(makeDist(site), template).revision,
    );
  });

  it("gives a new revision when any listed file or page changes", () => {
    const base = buildServiceWorker(makeDist(site), template).revision;
    const changed = [
      { ...site, "assets/Panel-a.js": "changed" },
      { ...site, "assets/Panel-b.js": "b", "assets/Panel-a.js": undefined },
      { ...site, "how.html": "<!doctype html><p>new</p>" },
      { ...site, "samples/one.webp": "swapped" },
    ].map(
      (files) =>
        buildServiceWorker(
          makeDist(
            Object.fromEntries(
              Object.entries(files).filter(([, value]) => value !== undefined),
            ),
          ),
          template,
        ).revision,
    );
    for (const revision of changed) expect(revision).not.toBe(base);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it("gives a new revision when only the worker itself changes", () => {
    // Same pages and files: a worker with new code must not share a cache
    // name with the one it replaces.
    const dir = makeDist(site);
    const base = buildServiceWorker(dir, template).revision;
    const edited = buildServiceWorker(dir, `${template}\n// changed`).revision;
    expect(edited).not.toBe(base);
  });

  it("refuses a template that lacks a line to fill in", () => {
    expect(() =>
      buildServiceWorker(
        makeDist(site),
        template.replace('const REVISION = "development";', ""),
      ),
    ).toThrow(/REVISION/);
  });
});

describe("the SW_OFF worker", () => {
  const retire = buildRetireWorker();

  it("unregisters itself, clears the app's caches and answers no request", () => {
    expect(retire).toContain("registration.unregister()");
    expect(retire).toContain("palette-shell-");
    expect(retire).toContain("palette-shared-image");
    expect(retire).toContain("skipWaiting");
    expect(retire).toContain("navigate(");
    expect(retire).not.toMatch(/addEventListener\(\s*["']fetch["']/);
  });

  it("takes the place of sw.js in a finished build", () => {
    const dir = makeDist({ ...site, "sw.js": "unfilled" });
    expect(writeServiceWorker(dir, "unused", { off: true })).toBeNull();
    expect(readFileSync(join(dir, "sw.js"), "utf8")).toBe(retire);
  });

  it("leaves the normal worker without a retire path", () => {
    const { source } = buildServiceWorker(makeDist(site), template);
    expect(source).not.toContain("registration.unregister");
  });
});
