import { lazy, type ComponentType } from "react";

/** A lazily loaded part of the app whose code could not be fetched. */
export class ChunkLoadError extends Error {
  constructor(readonly cause: unknown) {
    super("A part of the app could not be loaded.");
    this.name = "ChunkLoadError";
  }
}

/**
 * Runs `load`, rethrowing a rejection as a ChunkLoadError so an error boundary
 * can tell a failed download from a bug in the part itself.
 */
export function tagLoadFailure<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    throw new ChunkLoadError(error);
  });
}

/** React.lazy for the component `module[key]`, with failures tagged. */
// Like React.lazy, the component type may take any props.
export function lazyPanel<
  M extends Record<K, ComponentType<any>>,
  K extends string = "default",
>(load: () => Promise<M>, key: K = "default" as K) {
  return lazy(() =>
    tagLoadFailure(load).then((module) => ({ default: module[key] })),
  );
}
