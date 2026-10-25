"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { canDimensions, imagePlacement, type CanSpec } from "@/lib/can-spec";
// Replace this isolated surface contract with a calibrated factory model when supplied.
export default function CanModel({
  spec,
  raster,
}: {
  spec: CanSpec;
  raster: HTMLCanvasElement | null;
}) {
  const d = canDimensions(spec),
    h = d.heightMm / 100,
    r = d.diameterMm / 200,
    ph = d.printHeightMm / 100;
  const profile = useMemo(
    () => [
      new THREE.Vector2(r * 0.72, -h / 2),
      new THREE.Vector2(r * 0.94, -h / 2 + 0.025),
      new THREE.Vector2(r, -h / 2 + 0.07),
      new THREE.Vector2(r, -h / 2 + 0.16),
      new THREE.Vector2(r, h / 2 - 0.16),
      new THREE.Vector2(r * 0.96, h / 2 - 0.1),
      new THREE.Vector2(r * 0.84, h / 2 - 0.035),
      new THREE.Vector2(r * 0.84, h / 2),
    ],
    [r, h],
  );
  const texture = useMemo(() => {
    if (!raster) return null;
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = Math.max(
      256,
      Math.round((2048 * d.printHeightMm) / d.wrapWidthMm),
    );
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const p = imagePlacement(
      raster.width,
      raster.height,
      c.width,
      c.height,
      spec.placement,
    );
    ctx.drawImage(raster, p.x, p.y, p.width, p.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }, [raster, d.printHeightMm, d.wrapWidthMm, spec.placement]);
  useEffect(
    () => () => {
      texture?.dispose();
    },
    [texture],
  );
  return (
    <group>
      <mesh castShadow>
        <latheGeometry args={[profile, 64]} />
        <meshStandardMaterial
          color="#bfc8cc"
          metalness={0.94}
          roughness={0.22}
        />
      </mesh>
      {texture && (
        <mesh
          rotation={[0, Math.PI + (spec.placement.seam * Math.PI) / 180, 0]}
        >
          <cylinderGeometry args={[r + 0.0009, r + 0.0009, ph, 96, 1, true]} />
          <meshStandardMaterial
            map={texture}
            transparent
            alphaTest={0.01}
            color="#ffffff"
            metalness={0.18}
            roughness={0.44}
          />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <group key={side} position={[0, side * (h / 2 - 0.012), 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 0.84, 0.014, 12, 72]} />
            <meshStandardMaterial
              color="#d7dde0"
              metalness={1}
              roughness={0.2}
            />
          </mesh>
          <mesh>
            <cylinderGeometry args={[r * 0.82, r * 0.82, 0.012, 64]} />
            <meshStandardMaterial
              color={side === 1 ? "#b9c1c4" : "#9aa6ac"}
              metalness={0.95}
              roughness={0.32}
            />
          </mesh>
          <mesh position={[0, side * 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[r * 0.67, 0.004, 8, 64]} />
            <meshStandardMaterial
              color="#8c989e"
              metalness={0.9}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
      <group position={[0, h / 2 + 0.003, 0]}>
        <mesh position={[0, 0, -r * 0.28]} scale={[0.65, 1, 1.2]}>
          <cylinderGeometry args={[r * 0.22, r * 0.22, 0.007, 36]} />
          <meshStandardMaterial
            color="#4e5e65"
            metalness={0.85}
            roughness={0.4}
          />
        </mesh>
        <mesh
          position={[0, 0.014, r * 0.08]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.65, 1, 1]}
        >
          <torusGeometry args={[r * 0.23, 0.018, 10, 40]} />
          <meshStandardMaterial color="#d8dfe1" metalness={1} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.016, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.012, 20]} />
          <meshStandardMaterial color="#ccd1d3" metalness={1} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}
