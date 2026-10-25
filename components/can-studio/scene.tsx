"use client";
import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  ContactShadows,
} from "@react-three/drei";
import CanModel from "./model";
import type { OrbitControls as OrbitType } from "three-stdlib";
import { canDimensions, imagePlacement, type CanSpec } from "@/lib/can-spec";
export type CameraCommand = {
  pose: "front" | "back" | "top" | "angle" | "left" | "right" | "in" | "out";
  id: number;
};
function CameraRig({
  command,
  auto,
  scale,
}: {
  command: CameraCommand;
  auto: boolean;
  scale: number;
}) {
  const controls = useRef<OrbitType>(null);
  const { camera } = useThree();
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const r = scale * 2.25;
    switch (command.pose) {
      case "front":
        camera.position.set(0, 0.1, r);
        break;
      case "back":
        camera.position.set(0, 0.1, -r);
        break;
      case "top":
        camera.position.set(0.001, r, 0.01);
        break;
      case "angle":
        camera.position.set(r * 0.35, r * 0.3, r);
        break;
      case "left":
        c.setAzimuthalAngle(c.getAzimuthalAngle() - 0.3);
        break;
      case "right":
        c.setAzimuthalAngle(c.getAzimuthalAngle() + 0.3);
        break;
      case "in":
        camera.position.multiplyScalar(0.85);
        break;
      case "out":
        camera.position.multiplyScalar(1.15);
        break;
    }
    c.update();
  }, [camera, command, scale]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      minDistance={scale * 1.3}
      maxDistance={scale * 5}
      autoRotate={auto}
      autoRotateSpeed={0.65}
      minPolarAngle={0.01}
      maxPolarAngle={Math.PI - 0.03}
    />
  );
}
export default function Scene({
  spec,
  raster,
  command,
  auto,
  onReady,
  onFailure,
}: {
  spec: CanSpec;
  raster: HTMLCanvasElement | null;
  command: CameraCommand;
  auto: boolean;
  onReady: () => void;
  onFailure: () => void;
}) {
  const h = canDimensions(spec).heightMm / 100;
  return (
    <Canvas
      frameloop={auto ? "always" : "demand"}
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [h * 1.8, h * 0.8, h * 2.2], fov: 30 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute("aria-label", "Интерактивная 3D-банка");
        gl.domElement.addEventListener("webglcontextlost", onFailure, {
          once: true,
        });
        onReady();
      }}
    >
      <color attach="background" args={["#eeeee8"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 5, 4]} intensity={2.4} />
      <Environment resolution={128}>
        <color attach="background" args={["#bac3c3"]} />
        <Lightformer
          position={[3, 2, 3]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[3, 5, 1]}
          intensity={4}
        />
        <Lightformer
          position={[-3, 1, 1]}
          rotation={[0, Math.PI / 3, 0]}
          scale={[1, 5, 1]}
          intensity={3}
        />
        <Lightformer
          position={[0, 4, -3]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={4}
          intensity={2}
        />
      </Environment>
      <CanModel spec={spec} raster={raster} />
      <ContactShadows
        key={`${h}-${spec.preset}-${spec.diameterMm || 0}`}
        position={[0, -h / 2 - 0.035, 0]}
        opacity={0.26}
        scale={h * 3}
        blur={2.5}
        far={h}
        resolution={128}
        frames={1}
      />
      <CameraRig command={command} auto={auto} scale={h} />
    </Canvas>
  );
}
