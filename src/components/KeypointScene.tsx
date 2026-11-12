import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const points: [number, number, number][] = [
  [0, -1.2, 0],
  [-0.32, -0.78, 0],
  [-0.45, -0.22, 0.02],
  [-0.5, 0.35, 0],
  [-0.48, 0.85, -0.02],
  [-0.18, -0.72, 0.04],
  [-0.18, -0.08, 0.08],
  [-0.16, 0.58, 0.04],
  [-0.12, 1.25, 0],
  [0.02, -0.68, 0.08],
  [0.08, -0.02, 0.14],
  [0.15, 0.68, 0.08],
  [0.2, 1.42, 0],
  [0.22, -0.72, 0.02],
  [0.32, -0.1, 0.08],
  [0.43, 0.58, 0.02],
  [0.5, 1.22, -0.04],
  [0.4, -0.84, -0.04],
  [0.56, -0.4, 0],
  [0.7, 0.05, -0.06],
  [0.78, 0.5, -0.12],
];

const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [1, 5],
  [5, 9],
  [9, 13],
  [13, 17],
];

function Connection({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const midpoint = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b]);
  const length = a.distanceTo(b);
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return q;
  }, [a, b]);
  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.018, 0.018, length, 8]} />
      <meshBasicMaterial color="#60a5fa" transparent opacity={0.66} />
    </mesh>
  );
}

function HandModel({ interactive = true }: { interactive?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const vectors = useMemo(() => points.map((point) => new THREE.Vector3(...point)), []);
  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.22;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.45) * 0.08;
    if (interactive) {
      group.current.rotation.y += state.pointer.x * delta * 0.3;
      group.current.rotation.x += state.pointer.y * delta * 0.12;
    }
  });
  return (
    <group ref={group} rotation={[0, -0.4, -0.15]} scale={1.2}>
      {vectors.map((position, index) => (
        <mesh key={index} position={position}>
          <sphereGeometry args={[index === 0 ? 0.09 : 0.055, 16, 16]} />
          <meshBasicMaterial color={index === 12 || index === 8 ? "#a7f3d0" : "#2563eb"} />
        </mesh>
      ))}
      {edges.map(([start, end], index) => (
        <Connection key={index} a={vectors[start]} b={vectors[end]} />
      ))}
    </group>
  );
}

function WebGLFallback() {
  return (
    <div className="scene-fallback" aria-label="Animated sign language hand visualization">
      <svg viewBox="0 0 220 280" role="img">
        {edges.map(([a, b], index) => (
          <line
            key={index}
            x1={110 + points[a][0] * 88}
            y1={150 - points[a][1] * 75}
            x2={110 + points[b][0] * 88}
            y2={150 - points[b][1] * 75}
          />
        ))}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={110 + point[0] * 88}
            cy={150 - point[1] * 75}
            r={index % 5 === 0 ? 6 : 4}
          />
        ))}
      </svg>
    </div>
  );
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function KeypointScene({
  className = "",
  mini = false,
}: {
  className?: string;
  mini?: boolean;
}) {
  if (!supportsWebGL()) return <WebGLFallback />;
  return (
    <div className={`keypoint-scene ${className}`} aria-label="Rotating 3D keypoint hand">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4.2], fov: mini ? 46 : 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <HandModel interactive={!mini} />
      </Canvas>
    </div>
  );
}
