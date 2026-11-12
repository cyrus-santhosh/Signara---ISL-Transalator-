import type {
  LandmarkConnectionArray,
  NormalizedLandmark,
  Results,
} from "@mediapipe/holistic";

type LandmarkList = NormalizedLandmark[] | undefined;

function isValidLandmark(landmark: NormalizedLandmark | undefined): landmark is NormalizedLandmark {
  return Boolean(landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y));
}

function drawLandmarkSet(
  context: CanvasRenderingContext2D,
  landmarks: LandmarkList,
  connections: LandmarkConnectionArray,
  xFor: (x: number) => number,
  yFor: (y: number) => number,
  color: string,
  radius: number,
) {
  if (!landmarks?.length) return;

  context.lineWidth = 2;
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = color;
  context.shadowBlur = 7;

  for (const [startIndex, endIndex] of connections) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!isValidLandmark(start) || !isValidLandmark(end)) continue;

    context.beginPath();
    context.moveTo(xFor(start.x), yFor(start.y));
    context.lineTo(xFor(end.x), yFor(end.y));
    context.stroke();
  }

  context.shadowBlur = 5;
  for (const landmark of landmarks) {
    if (!isValidLandmark(landmark)) continue;

    context.beginPath();
    context.arc(xFor(landmark.x), yFor(landmark.y), radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = "#ffffff";
    context.stroke();
  }
  context.shadowBlur = 0;
}

export function drawLandmarkOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  results: Results,
  handConnections: LandmarkConnectionArray,
  poseConnections: LandmarkConnectionArray,
) {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  if (width <= 0 || height <= 0) return;

  const pixelRatio = window.devicePixelRatio || 1;
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a 2D context for the landmark overlay.");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
  const coverScale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const renderedWidth = video.videoWidth * coverScale;
  const renderedHeight = video.videoHeight * coverScale;
  const cropX = (renderedWidth - width) / 2;
  const cropY = (renderedHeight - height) / 2;
  const xFor = (x: number) => width - (x * renderedWidth - cropX);
  const yFor = (y: number) => y * renderedHeight - cropY;

  drawLandmarkSet(
    context,
    results.poseLandmarks,
    poseConnections,
    xFor,
    yFor,
    "#ffd166",
    3.2,
  );
  drawLandmarkSet(
    context,
    results.leftHandLandmarks,
    handConnections,
    xFor,
    yFor,
    "#42f5c5",
    4.2,
  );
  drawLandmarkSet(
    context,
    results.rightHandLandmarks,
    handConnections,
    xFor,
    yFor,
    "#ff70a6",
    4.2,
  );
}

export function clearLandmarkOverlay(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}
