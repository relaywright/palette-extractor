import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorSpace } from "@relaywright/median-cut";
import type { RGB } from "../lib/color";
import { runInWorker, type ExtractionDetail } from "../lib/extract";

export type CameraStatus = "starting" | "live" | "error";

/** Longest side of a sampled frame, matching the upload pipeline. */
const SAMPLE_SIZE = 320;
/** Longest side of the photo kept when the camera is frozen. */
const PHOTO_SIZE = 1280;
/** Pause between the start of one sample and the next. */
const SAMPLE_INTERVAL_MS = 150;

export interface CameraRequest {
  count: number;
  exclude: RGB[];
  colorSpace: ColorSpace;
}

interface UseCameraOptions {
  request: CameraRequest;
  onFrame: (detail: ExtractionDetail) => void;
  onFreeze: (photo: File) => void;
  onClose: (notice?: string) => void;
}

const errorMessage = (error: unknown) => {
  switch ((error as DOMException | undefined)?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow it in your browser settings, or upload a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. Upload a photo instead.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is busy in another app. Close that app and try again, or upload a photo instead.";
    default:
      return "The camera could not start. Upload a photo instead.";
  }
};

function drawFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  limit: number,
) {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;
  const scale = Math.min(1, limit / Math.max(videoWidth, videoHeight));
  canvas.width = Math.max(1, Math.round(videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx;
}

/**
 * Runs the rear camera: shows the stream in a video element, samples a frame
 * through the quantizer worker about every 150 ms (never while the previous
 * one is still running), and can freeze the current frame into a photo. The
 * stream stops on freeze, close, tab hide, page hide and unmount.
 */
export function useCamera({
  request,
  onFrame,
  onFreeze,
  onClose,
}: UseCameraOptions) {
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const canvas = useRef<HTMLCanvasElement>();
  // Set once a freeze starts, so a sample still in flight cannot replace the
  // palette of the frame being kept.
  const frozen = useRef(false);
  // The freeze whose photo is still being encoded, if any. Closing, retrying
  // or leaving clears it, so a late result is dropped instead of replacing a
  // photo chosen since.
  const pendingFreeze = useRef<symbol | null>(null);
  // The loop reads the newest values without restarting the stream.
  const latest = useRef({ request, onFrame, onFreeze, onClose });
  latest.current = { request, onFrame, onFreeze, onClose };

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const cancelFreeze = useCallback(() => {
    pendingFreeze.current = null;
    frozen.current = false;
  }, []);

  const fail = useCallback(
    (error: unknown) => {
      release();
      setMessage(errorMessage(error));
      setStatus("error");
    },
    [release],
  );

  useEffect(() => {
    let cancelled = false;
    frozen.current = false;
    setStatus("starting");
    Promise.resolve()
      .then(() =>
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }),
      )
      .then(async (opened) => {
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = opened;
        const element = video.current!;
        element.srcObject = opened;
        await element.play();
        if (!cancelled) setStatus("live");
      })
      .catch((error) => {
        if (!cancelled) fail(error);
      });
    return () => {
      cancelled = true;
      cancelFreeze();
      release();
    };
  }, [attempt, fail, release, cancelFreeze]);

  useEffect(() => {
    if (status !== "live") return;
    const controller = new AbortController();
    let timer = 0;
    const sample = async () => {
      const started = performance.now();
      try {
        const element = video.current!;
        canvas.current ??= document.createElement("canvas");
        const ctx = drawFrame(element, canvas.current, SAMPLE_SIZE);
        if (ctx) {
          const { width, height } = canvas.current;
          const data = ctx.getImageData(0, 0, width, height);
          const detail = await runInWorker(
            {
              buffer: data.data.buffer,
              width,
              height,
              ...latest.current.request,
            },
            [data.data.buffer],
            controller.signal,
          );
          if (!controller.signal.aborted && !frozen.current)
            latest.current.onFrame(detail);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        fail(error);
        return;
      }
      if (!controller.signal.aborted)
        timer = window.setTimeout(
          sample,
          Math.max(0, SAMPLE_INTERVAL_MS - (performance.now() - started)),
        );
    };
    void sample();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [status, fail]);

  useEffect(() => {
    const hide = () => {
      cancelFreeze();
      release();
      latest.current.onClose("Camera stopped because the tab was hidden.");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", release);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", release);
    };
  }, [release, cancelFreeze]);

  const freeze = useCallback(() => {
    const element = video.current;
    const target = document.createElement("canvas");
    if (
      pendingFreeze.current ||
      status !== "live" ||
      !element ||
      !drawFrame(element, target, PHOTO_SIZE)
    )
      return;
    frozen.current = true;
    const mine = Symbol("freeze");
    pendingFreeze.current = mine;
    target.toBlob(
      (blob) => {
        if (pendingFreeze.current !== mine) return;
        pendingFreeze.current = null;
        if (!blob) {
          fail(null);
          return;
        }
        release();
        latest.current.onFreeze(
          new File([blob], "Camera photo", { type: "image/jpeg" }),
        );
      },
      "image/jpeg",
      0.92,
    );
  }, [status, fail, release]);

  const retry = useCallback(() => {
    cancelFreeze();
    setAttempt((n) => n + 1);
  }, [cancelFreeze]);

  const close = useCallback(() => {
    cancelFreeze();
    latest.current.onClose();
  }, [cancelFreeze]);

  return { video, status, message, freeze, retry, close };
}
