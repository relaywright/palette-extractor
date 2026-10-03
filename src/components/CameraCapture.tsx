import { useEffect } from "react";
import {
  useCamera,
  type CameraRequest,
  type CameraStatus,
} from "../hooks/useCamera";
import type { ExtractionDetail } from "../lib/extract";
import { Icon } from "./Icon";
import "./camera.css";

/**
 * The live camera in the photo frame: the video, a Freeze control (or a tap
 * on the video), and a plain message with an upload fallback when the camera
 * cannot start.
 */
export default function CameraCapture({
  request,
  onStatus,
  onFrame,
  onFreeze,
  onClose,
  onUpload,
}: {
  request: CameraRequest;
  onStatus: (status: CameraStatus) => void;
  onFrame: (detail: ExtractionDetail) => void;
  onFreeze: (photo: File) => void;
  onClose: (notice?: string) => void;
  onUpload: () => void;
}) {
  const camera = useCamera({ request, onFrame, onFreeze, onClose });
  const { status } = camera;

  useEffect(() => onStatus(status), [status, onStatus]);

  return (
    <div className="camera-layer" data-camera-status={status}>
      <video
        ref={camera.video}
        className="camera-video"
        aria-label="Live camera preview. Tap to freeze."
        muted
        playsInline
        onClick={camera.freeze}
      />
      {status !== "error" && (
        <>
          <span className="camera-badge">
            <i /> {status === "live" ? "Live" : "Starting camera…"}
          </span>
          <button
            className="icon-button camera-close"
            aria-label="Close camera"
            onClick={() => onClose()}
          >
            <Icon name="close" />
          </button>
          <button
            className="button primary camera-freeze"
            disabled={status !== "live"}
            onClick={camera.freeze}
          >
            Freeze
          </button>
        </>
      )}
      {status === "error" && (
        <div className="camera-error">
          <Icon name="image" size={30} />
          <h3>Camera unavailable</h3>
          <p role="alert">{camera.message}</p>
          <div>
            <button className="button primary" onClick={onUpload}>
              <Icon name="upload" /> Upload image
            </button>
            <button className="button secondary" onClick={camera.retry}>
              Try again
            </button>
            <button className="text-button" onClick={() => onClose()}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
