import type { Holistic, HolisticConfig, LandmarkConnectionArray } from "@mediapipe/holistic";

export const MEDIAPIPE_VERSION = "0.5.1675471629";
export const HOLISTIC_ASSET_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${MEDIAPIPE_VERSION}/`;
const HOLISTIC_SCRIPT_URL = `${HOLISTIC_ASSET_BASE_URL}holistic.js`;

export function locateHolisticFile(file: string): string {
  const asset = file.endsWith("holistic_solution_packed_assets.data")
    ? "holistic_solution_packed_assets.data"
    : file;
  return new URL(asset, HOLISTIC_ASSET_BASE_URL).toString();
}

declare global {
  interface Window {
    Holistic?: new (config?: HolisticConfig) => Holistic;
    HAND_CONNECTIONS?: LandmarkConnectionArray;
    POSE_CONNECTIONS?: LandmarkConnectionArray;
  }
}

let scriptLoad: Promise<new (config?: HolisticConfig) => Holistic> | undefined;

export function loadHolistic(): Promise<new (config?: HolisticConfig) => Holistic> {
  if (window.Holistic) return Promise.resolve(window.Holistic);
  if (scriptLoad) return scriptLoad;

  scriptLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = HOLISTIC_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Holistic) {
        resolve(window.Holistic);
      } else {
        scriptLoad = undefined;
        reject(new Error("MediaPipe Holistic loaded without its browser API."));
      }
    };
    script.onerror = () => {
      scriptLoad = undefined;
      script.remove();
      reject(new Error(`Could not load MediaPipe Holistic script: ${HOLISTIC_SCRIPT_URL}`));
    };
    document.head.appendChild(script);
  });

  return scriptLoad;
}
