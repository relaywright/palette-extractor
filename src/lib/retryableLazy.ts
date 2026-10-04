import {
  createElement,
  lazy,
  type Attributes,
  type ComponentProps,
  type ComponentType,
} from "react";

const resets = new Set<() => void>();
const SCRIPT_URL = /https?:\/\/[^\s"']+?\.js/;

/**
 * Lazily loads the component `module[key]`. React.lazy and the browser both
 * remember a failed import for good, so a panel that failed once (a dropped
 * connection, say) would never load again without a page reload. After
 * retryFailedLoads(), a component that failed loads again the next time it
 * renders: from the same script under a fresh query, which the browser has no
 * failure remembered for. The script's address comes from the browser's
 * error; where that does not name one, the plain import is simply tried again.
 */
// Like React.lazy, the component type may take any props.
export function retryableLazy<
  M extends Record<K, ComponentType<any>>,
  K extends string = "default",
>(load: () => Promise<M>, key: K = "default" as K) {
  let failed = false;
  let attempt = 0;
  let script: string | null = null;
  const importModule = (): Promise<M> =>
    attempt > 0 && script
      ? import(/* @vite-ignore */ `${script}?retry=${attempt}`)
      : load();
  const make = () =>
    lazy(() =>
      importModule()
        .then((module) => ({ default: module[key] }))
        .catch((error: unknown) => {
          failed = true;
          script ??= SCRIPT_URL.exec(String(error))?.[0] ?? null;
          throw error;
        }),
    );
  let inner = make();
  resets.add(() => {
    if (!failed) return;
    failed = false;
    attempt++;
    inner = make();
  });
  return ((props: ComponentProps<M[K]>) =>
    createElement(
      inner as unknown as ComponentType<ComponentProps<M[K]>>,
      props as Attributes & ComponentProps<M[K]>,
    )) as ComponentType<ComponentProps<M[K]>>;
}

export function retryFailedLoads() {
  resets.forEach((reset) => reset());
  // A stylesheet that never arrived has no sheet, and its link is never asked
  // again, so give those a fresh request.
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      if (!link.sheet) link.replaceWith(link.cloneNode());
    });
}
