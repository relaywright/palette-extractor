import type { Plugin } from "vite";

export function listFiles(outDir: string): string[];
export function buildServiceWorker(
  outDir: string,
  template: string,
): { source: string; revision: string; pages: string[]; files: string[] };
export function writeServiceWorker(
  outDir: string,
  templatePath: string,
): { source: string; revision: string; pages: string[]; files: string[] };
export function serviceWorkerPlugin(): Plugin;
