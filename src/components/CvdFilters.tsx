import { lazy, Suspense, useSyncExternalStore } from "react";
import type { CvdType } from "../lib/cvd";

export type CvdMode = "none" | CvdType;

// The simulation outlives the Contrast tab: it also colors the photo, the
// swatches and the mockup on other tabs. State lives here, outside React, so
// this small always-mounted component can hold the filters and the indicator
// while the heavier parts load only once a simulation is on.
let mode: CvdMode = "none";
const listeners = new Set<() => void>();

export function setCvd(next: CvdMode) {
  mode = next;
  listeners.forEach((listener) => listener());
}

export function useCvd(): CvdMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => mode,
  );
}

const CvdFilterDefs = lazy(() => import("./CvdFilterDefs"));

export function CvdFilters() {
  const active = useCvd();
  if (active === "none") return null;
  return (
    <Suspense fallback={null}>
      <CvdFilterDefs mode={active} onOff={() => setCvd("none")} />
    </Suspense>
  );
}
