"use client";

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";

interface HumanModelProps {
  activeLayers: {
    skeletal: boolean;
    muscular: boolean;
    nervous: boolean;
    vascular: boolean;
    lymphatic: boolean;
    acupuncture: boolean;
  };
  selectedPart: string | null;
  onSelectPart: (partName: string) => void;
}

// Helper to determine material properties based on state
function getMaterialProps(
  layer: string,
  partName: string,
  selectedPart: string | null,
  hoveredPart: string | null
) {
  const isSelected = selectedPart === partName;
  const isHovered = hoveredPart === partName;

  let color = "#ffffff";
  let opacity = 0.8;
  let wireframe = false;
  let emissive = "#000000";

  switch (layer) {
    case "skeletal":
      color = isSelected ? "#a7f3d0" : isHovered ? "#e2e8f0" : "#cbd5e1";
      opacity = isSelected ? 0.9 : 0.6;
      emissive = isSelected ? "#059669" : "#000000";
      break;
    case "muscular":
      color = isSelected ? "#f87171" : isHovered ? "#ef4444" : "#991b1b";
      opacity = isSelected ? 0.85 : 0.55;
      emissive = isSelected ? "#b91c1c" : "#000000";
      break;
    case "nervous":
      color = "#eab308"; // Glowing yellow wires
      opacity = 0.9;
      wireframe = true;
      emissive = "#ca8a04";
      break;
    case "vascular":
      color = "#ef4444"; // Glowing red arteries
      opacity = 0.8;
      wireframe = true;
      emissive = "#dc2626";
      break;
    case "lymphatic":
      color = "#22c55e"; // Glowing green lymphatic ducts
      opacity = 0.7;
      wireframe = true;
      emissive = "#16a34a";
      break;
  }

  return {
    color,
    transparent: true,
    opacity,
    wireframe,
    emissive,
    emissiveIntensity: isSelected ? 1.2 : isHovered ? 0.5 : 0.1,
  };
}

export default function HumanModel({
  activeLayers,
  selectedPart,
  onSelectPart,
}: HumanModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);

  // Slow rotation for presentation
  useFrame(() => {
    if (groupRef.current && !selectedPart) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  // Body Parts Definition with their offsets and scales
  const bodyParts = [
    { name: "Head", pos: [0, 2.5, 0], scale: [0.5, 0.5, 0.5], geom: "sphere" },
    { name: "Neck", pos: [0, 1.9, 0], scale: [0.22, 0.4, 0.22], geom: "cylinder" },
    { name: "Chest", pos: [0, 1.1, 0], scale: [0.75, 0.8, 0.45], geom: "box" },
    { name: "Abdomen", pos: [0, 0.3, 0], scale: [0.65, 0.6, 0.4], geom: "box" },
    
    // Right Arm
    { name: "Right Shoulder", pos: [-0.95, 1.4, 0], scale: [0.25, 0.25, 0.25], geom: "sphere" },
    { name: "Right Upper Arm", pos: [-1.2, 0.9, 0], scale: [0.18, 0.7, 0.18], geom: "cylinder" },
    { name: "Right Forearm", pos: [-1.4, 0.2, 0], scale: [0.15, 0.6, 0.15], geom: "cylinder" },
    { name: "Right Hand", pos: [-1.5, -0.25, 0], scale: [0.14, 0.25, 0.08], geom: "box" },

    // Left Arm
    { name: "Left Shoulder", pos: [0.95, 1.4, 0], scale: [0.25, 0.25, 0.25], geom: "sphere" },
    { name: "Left Upper Arm", pos: [1.2, 0.9, 0], scale: [0.18, 0.7, 0.18], geom: "cylinder" },
    { name: "Left Forearm", pos: [1.4, 0.2, 0], scale: [0.15, 0.6, 0.15], geom: "cylinder" },
    { name: "Left Hand", pos: [1.5, -0.25, 0], scale: [0.14, 0.25, 0.08], geom: "box" },

    // Right Leg
    { name: "Right Hip", pos: [-0.35, -0.2, 0], scale: [0.25, 0.25, 0.25], geom: "sphere" },
    { name: "Right Thigh", pos: [-0.38, -0.8, 0], scale: [0.24, 0.9, 0.24], geom: "cylinder" },
    { name: "Right Calf", pos: [-0.38, -1.7, 0], scale: [0.18, 0.8, 0.18], geom: "cylinder" },
    { name: "Right Foot", pos: [-0.38, -2.15, 0.15], scale: [0.16, 0.14, 0.35], geom: "box" },

    // Left Leg
    { name: "Left Hip", pos: [0.35, -0.2, 0], scale: [0.25, 0.25, 0.25], geom: "sphere" },
    { name: "Left Thigh", pos: [0.38, -0.8, 0], scale: [0.24, 0.9, 0.24], geom: "cylinder" },
    { name: "Left Calf", pos: [0.38, -1.7, 0], scale: [0.18, 0.8, 0.18], geom: "cylinder" },
    { name: "Left Foot", pos: [0.38, -2.15, 0.15], scale: [0.16, 0.14, 0.35], geom: "box" },
  ];

  // Acupoints coordinates mapping on 3D space
  const acupoints = [
    { name: "GV20 (Baihui - 百会)", pos: [0, 3.03, 0], color: "#a855f7", meridian: "Du Vessel" },
    { name: "GB21 (Jianjing - 肩井)", pos: [0.75, 1.55, 0.05], color: "#eab308", meridian: "Gallbladder" },
    { name: "GB21 (Jianjing - 肩井) L", pos: [-0.75, 1.55, 0.05], color: "#eab308", meridian: "Gallbladder" },
    { name: "LI4 (Hegu - 合谷) R", pos: [-1.6, -0.3, 0.1], color: "#3b82f6", meridian: "Large Intestine" },
    { name: "LI4 (Hegu - 合谷) L", pos: [1.6, -0.3, 0.1], color: "#3b82f6", meridian: "Large Intestine" },
    { name: "LU7 (Lieque - 列缺) R", pos: [-1.45, 0.1, 0.08], color: "#06b6d4", meridian: "Lung" },
    { name: "LU7 (Lieque - 列缺) L", pos: [1.45, 0.1, 0.08], color: "#06b6d4", meridian: "Lung" },
    { name: "BL23 (Shenshu - 肾俞)", pos: [0.22, 0.25, -0.42], color: "#ec4899", meridian: "Bladder" },
    { name: "BL23 (Shenshu - 肾俞) L", pos: [-0.22, 0.25, -0.42], color: "#ec4899", meridian: "Bladder" },
  ];

  return (
    <group ref={groupRef}>
      {/* 1. SKELETAL LAYER (RENDERED DEEP INSIDE) */}
      {activeLayers.skeletal &&
        bodyParts.map((part) => {
          const isSelected = selectedPart === part.name;
          const skeletonScale = part.name === "Head" ? 0.44 : 0.8;
          
          return (
            <mesh
              key={`skeletal-${part.name}`}
              position={part.pos as [number, number, number]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPart(part.name);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPart(part.name);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredPart(null);
              }}
            >
              {part.geom === "sphere" ? (
                <sphereGeometry args={[part.scale[0] * skeletonScale, 20, 20]} />
              ) : part.geom === "cylinder" ? (
                <cylinderGeometry
                  args={[
                    part.scale[0] * skeletonScale,
                    part.scale[0] * skeletonScale,
                    part.scale[1],
                    16,
                  ]}
                />
              ) : (
                <boxGeometry
                  args={[
                    part.scale[0] * skeletonScale,
                    part.scale[1] * skeletonScale,
                    part.scale[2] * skeletonScale,
                  ]}
                />
              )}
              <meshStandardMaterial
                {...getMaterialProps("skeletal", part.name, selectedPart, hoveredPart)}
                roughness={0.4}
                metalness={0.1}
              />
            </mesh>
          );
        })}

      {/* 2. MUSCULAR LAYER (OUTER TRANSPARENT SHELL) */}
      {activeLayers.muscular &&
        bodyParts.map((part) => {
          const isSelected = selectedPart === part.name;
          
          return (
            <mesh
              key={`muscular-${part.name}`}
              position={part.pos as [number, number, number]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPart(part.name);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPart(part.name);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoveredPart(null);
              }}
            >
              {part.geom === "sphere" ? (
                <sphereGeometry args={[part.scale[0], 24, 24]} />
              ) : part.geom === "cylinder" ? (
                <cylinderGeometry args={[part.scale[0], part.scale[0] * 0.9, part.scale[1], 16]} />
              ) : (
                <boxGeometry args={part.scale as [number, number, number]} />
              )}
              <meshStandardMaterial
                {...getMaterialProps("muscular", part.name, selectedPart, hoveredPart)}
                roughness={0.8}
                bumpScale={0.1}
              />
            </mesh>
          );
        })}

      {/* 3. NERVOUS SYSTEM LAYER (YELLOW GLOWING WIREFRAMES) */}
      {activeLayers.nervous &&
        bodyParts.map((part) => {
          const nerveScale = 1.05;
          return (
            <mesh
              key={`nervous-${part.name}`}
              position={part.pos as [number, number, number]}
            >
              {part.geom === "sphere" ? (
                <sphereGeometry args={[part.scale[0] * nerveScale, 12, 12]} />
              ) : part.geom === "cylinder" ? (
                <cylinderGeometry args={[part.scale[0] * nerveScale, part.scale[0] * nerveScale, part.scale[1], 10]} />
              ) : (
                <boxGeometry args={[part.scale[0] * nerveScale, part.scale[1] * nerveScale, part.scale[2] * nerveScale]} />
              )}
              <meshStandardMaterial
                {...getMaterialProps("nervous", part.name, selectedPart, hoveredPart)}
              />
            </mesh>
          );
        })}

      {/* 4. VASCULAR SYSTEM LAYER (RED ARTERIAL GLOWING WIRES) */}
      {activeLayers.vascular &&
        bodyParts.map((part) => {
          const vascularScale = 1.03;
          return (
            <mesh
              key={`vascular-${part.name}`}
              position={part.pos as [number, number, number]}
            >
              {part.geom === "sphere" ? (
                <sphereGeometry args={[part.scale[0] * vascularScale, 10, 10]} />
              ) : part.geom === "cylinder" ? (
                <cylinderGeometry args={[part.scale[0] * vascularScale, part.scale[0] * 0.8 * vascularScale, part.scale[1], 8]} />
              ) : (
                <boxGeometry args={[part.scale[0] * vascularScale, part.scale[1] * vascularScale, part.scale[2] * vascularScale]} />
              )}
              <meshStandardMaterial
                {...getMaterialProps("vascular", part.name, selectedPart, hoveredPart)}
              />
            </mesh>
          );
        })}

      {/* 5. LYMPHATIC SYSTEM LAYER (GREEN DUCTS) */}
      {activeLayers.lymphatic &&
        bodyParts.map((part) => {
          const lymphaticScale = 1.01;
          return (
            <mesh
              key={`lymphatic-${part.name}`}
              position={part.pos as [number, number, number]}
            >
              {part.geom === "sphere" ? (
                <sphereGeometry args={[part.scale[0] * lymphaticScale, 8, 8]} />
              ) : part.geom === "cylinder" ? (
                <cylinderGeometry args={[part.scale[0] * lymphaticScale, part.scale[0] * lymphaticScale, part.scale[1], 8]} />
              ) : (
                <boxGeometry args={[part.scale[0] * lymphaticScale, part.scale[1] * lymphaticScale, part.scale[2] * lymphaticScale]} />
              )}
              <meshStandardMaterial
                {...getMaterialProps("lymphatic", part.name, selectedPart, hoveredPart)}
              />
            </mesh>
          );
        })}

      {/* 6. ACUPUNCTURE MERIDIANS & ACUPOINTS */}
      {activeLayers.acupuncture && (
        <group>
          {/* Renders Acupoint glowing spheres */}
          {acupoints.map((pt, idx) => (
            <mesh key={`acupoint-${idx}`} position={pt.pos as [number, number, number]}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshBasicMaterial color={pt.color} />
              
              {/* Acupoint labels appearing on hover */}
              <Html distanceFactor={4} center>
                <div className="bg-slate-900/90 text-white border border-slate-700/60 rounded-lg px-2 py-0.5 text-[9px] font-bold whitespace-nowrap shadow-md pointer-events-none select-none backdrop-blur-sm">
                  {pt.name}
                </div>
              </Html>
            </mesh>
          ))}
          
          {/* Meridian Line Connectors */}
          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 3.03, 0),     // Baihui
              new THREE.Vector3(0, 1.9, 0.22),   // Neck front
              new THREE.Vector3(0, 1.1, 0.45),   // Chest
              new THREE.Vector3(0, 0.3, 0.4),    // Abdomen
              new THREE.Vector3(0.38, -0.8, 0.24), // Left thigh
              new THREE.Vector3(0.38, -1.7, 0.18), // Left calf
            ])} />
            <lineBasicMaterial color="#a855f7" linewidth={2} />
          </line>
          
          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0.75, 1.55, 0.05),   // Jianjing R
              new THREE.Vector3(1.2, 0.9, 0.18),     // Upper arm L
              new THREE.Vector3(1.45, 0.1, 0.08),    // Lieque L
              new THREE.Vector3(1.6, -0.3, 0.1),     // Hegu L
            ])} />
            <lineBasicMaterial color="#06b6d4" linewidth={2} />
          </line>

          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-0.75, 1.55, 0.05),  // Jianjing L
              new THREE.Vector3(-1.2, 0.9, 0.18),    // Upper arm R
              new THREE.Vector3(-1.45, 0.1, 0.08),   // Lieque R
              new THREE.Vector3(-1.6, -0.3, 0.1),    // Hegu R
            ])} />
            <lineBasicMaterial color="#3b82f6" linewidth={2} />
          </line>
        </group>
      )}

      {/* Floating 3D selection tooltip */}
      {hoveredPart && (
        <Html position={bodyParts.find((p) => p.name === hoveredPart)?.pos as [number, number, number]} distanceFactor={6} center>
          <div className="bg-emerald-500/90 text-white font-extrabold text-[10px] px-2 py-1 rounded-xl backdrop-blur-sm shadow-md pointer-events-none whitespace-nowrap select-none animate-pulse">
            {hoveredPart}
          </div>
        </Html>
      )}
    </group>
  );
}
