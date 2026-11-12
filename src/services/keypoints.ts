import type { NormalizedLandmark, Results } from "@mediapipe/holistic";
import type { KeypointFrame, Landmark, LandmarkSet } from "./signSocket";

function normalizeLandmarks(
  landmarks: NormalizedLandmark[] | undefined,
): LandmarkSet {
  if (!landmarks?.length) return null;

  return landmarks.map((landmark): Landmark => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: Number.isFinite(landmark.visibility) ? landmark.visibility! : null,
    presence:
      "presence" in landmark && Number.isFinite(landmark.presence)
        ? (landmark.presence as number)
        : null,
  }));
}

export function createKeypointFrame(results: Results, frameNumber: number): KeypointFrame {
  return {
    type: "keypoints",
    timestamp: Date.now(),
    frameNumber,
    landmarks: {
      leftHand: normalizeLandmarks(results.leftHandLandmarks),
      rightHand: normalizeLandmarks(results.rightHandLandmarks),
      pose: normalizeLandmarks(results.poseLandmarks),
    },
  };
}
