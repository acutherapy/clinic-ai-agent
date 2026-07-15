"use client";

import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, Html } from "@react-three/drei";
import * as THREE from "three";

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

export default function HumanModel({
  activeLayers,
  selectedPart,
  onSelectPart,
}: HumanModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);

  // Load the realistic human body GLB model
  const { scene } = useGLTF("/models/human_body.glb");

  // Apply holographic medical scanning material effects
  useEffect(() => {
    scene.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Define premium glowing glass/hologram material
        child.material = new THREE.MeshStandardMaterial({
          color: selectedPart ? "#0f766e" : "#0f172a", // teal/cyan if selected, else deep slate
          transparent: true,
          opacity: activeLayers.muscular ? 0.35 : 0.08, // make skin transparent to see inner layers if toggled
          wireframe: activeLayers.muscular && !selectedPart,
          roughness: 0.1,
          metalness: 0.9,
          emissive: selectedPart ? "#14b8a6" : "#1e293b",
          emissiveIntensity: selectedPart ? 1.0 : 0.15,
        });
      }
    });
  }, [scene, selectedPart, activeLayers.muscular]);

  // Rotate group slowly when no part is selected
  useFrame(() => {
    if (groupRef.current && !selectedPart) {
      groupRef.current.rotation.y += 0.003;
    }
  });

  // Calculate selected region based on click vertical coordinates
  const handleModelClick = (e: any) => {
    e.stopPropagation();
    
    // Get local intersection point Y coordinate to map regions
    const localY = e.point.y;
    const localX = e.point.x;
    
    let clickedPart = "Abdomen";

    if (localY > 2.0) {
      clickedPart = "Head";
    } else if (localY > 1.5 && localY <= 2.0) {
      clickedPart = "Neck";
    } else if (localY > 0.5 && localY <= 1.5) {
      clickedPart = "Chest";
    } else if (localY <= 0.5 && localY > -0.2) {
      clickedPart = "Abdomen";
    } else if (localY <= -0.2) {
      if (localX > 0.1) {
        clickedPart = "Left Leg";
      } else {
        clickedPart = "Right Leg";
      }
    }

    onSelectPart(clickedPart);
  };

  // Hover detection based on pointer coordinates
  const handleModelMove = (e: any) => {
    e.stopPropagation();
    const localY = e.point.y;
    const localX = e.point.x;
    
    let part = "Abdomen";
    if (localY > 2.0) part = "Head";
    else if (localY > 1.5 && localY <= 2.0) part = "Neck";
    else if (localY > 0.5 && localY <= 1.5) part = "Chest";
    else if (localY <= 0.5 && localY > -0.2) part = "Abdomen";
    else if (localY <= -0.2) part = localX > 0.1 ? "Left Leg" : "Right Leg";

    setHoveredPart(part);
  };

  // Acupoints coordinates mapping on 3D space
  const acupoints = [
    { name: "GV20 (Baihui - 百会)", pos: [0, 2.5, 0], color: "#a855f7", meridian: "Du Vessel" },
    { name: "GB21 (Jianjing - 肩井) R", pos: [0.35, 1.45, 0.05], color: "#eab308", meridian: "Gallbladder" },
    { name: "GB21 (Jianjing - 肩井) L", pos: [-0.35, 1.45, 0.05], color: "#eab308", meridian: "Gallbladder" },
    { name: "LI4 (Hegu - 合谷) L", pos: [0.65, 0.35, 0.15], color: "#3b82f6", meridian: "Large Intestine" },
    { name: "LI4 (Hegu - 合谷) R", pos: [-0.65, 0.35, 0.15], color: "#3b82f6", meridian: "Large Intestine" },
    { name: "LU7 (Lieque - 列缺) L", pos: [0.55, 0.55, 0.1], color: "#06b6d4", meridian: "Lung" },
    { name: "LU7 (Lieque - 列缺) R", pos: [-0.55, 0.55, 0.1], color: "#06b6d4", meridian: "Lung" },
    { name: "BL23 (Shenshu - 肾俞) R", pos: [0.18, 0.6, -0.25], color: "#ec4899", meridian: "Bladder" },
    { name: "BL23 (Shenshu - 肾俞) L", pos: [-0.18, 0.6, -0.25], color: "#ec4899", meridian: "Bladder" },
  ];

  return (
    <group ref={groupRef}>
      {/* 1. REALISTIC HUMAN BODY GLB MODEL RENDERED AS INNER HOLOGRAPHIC SHELL */}
      <primitive 
        object={scene} 
        position={[0, -1.0, 0]} // Center the GLB model vertically
        scale={[1.1, 1.1, 1.1]} // Scale to fit the grid view
        onClick={handleModelClick}
        onPointerMove={handleModelMove}
        onPointerOut={() => setHoveredPart(null)}
      />

      {/* 2. INNER NERVOUS / SKELETAL GLOW LAYERS (SIMULATED VIA MULTIPART CYLINDERS/BOXES INSIDE SHOWN IF LAYER ACTIVE) */}
      {activeLayers.skeletal && (
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 1.6, 8]} />
          <meshBasicMaterial color="#cbd5e1" transparent opacity={0.65} />
        </mesh>
      )}

      {/* 3. ACUPUNCTURE MERIDIANS & ACUPOINTS OVERLAID ON THE MODEL */}
      {activeLayers.acupuncture && (
        <group>
          {/* Renders Acupoint glowing spheres */}
          {acupoints.map((pt, idx) => (
            <mesh key={`acupoint-${idx}`} position={pt.pos as [number, number, number]}>
              <sphereGeometry args={[0.05, 16, 16]} />
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
              new THREE.Vector3(0, 2.5, 0),       // Baihui
              new THREE.Vector3(0, 1.5, 0.2),     // Neck front
              new THREE.Vector3(0, 0.9, 0.28),    // Chest
              new THREE.Vector3(0, 0.2, 0.25),    // Abdomen
              new THREE.Vector3(0.18, -0.3, 0.15), // Left thigh
              new THREE.Vector3(0.18, -0.9, 0.12), // Left calf
            ])} />
            <lineBasicMaterial color="#a855f7" linewidth={2.5} />
          </line>
          
          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0.35, 1.45, 0.05),   // Jianjing L
              new THREE.Vector3(0.48, 0.9, 0.1),     // Upper arm L
              new THREE.Vector3(0.55, 0.55, 0.1),    // Lieque L
              new THREE.Vector3(0.65, 0.35, 0.15),   // Hegu L
            ])} />
            <lineBasicMaterial color="#06b6d4" linewidth={2.5} />
          </line>

          <line>
            <bufferGeometry attach="geometry" {...new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-0.35, 1.45, 0.05),  // Jianjing R
              new THREE.Vector3(-0.48, 0.9, 0.1),    // Upper arm R
              new THREE.Vector3(-0.55, 0.55, 0.1),   // Lieque R
              new THREE.Vector3(-0.65, 0.35, 0.15),  // Hegu R
            ])} />
            <lineBasicMaterial color="#3b82f6" linewidth={2.5} />
          </line>
        </group>
      )}

      {/* Floating 3D selection tooltip */}
      {hoveredPart && (
        <Html position={(acupoints.find((p) => p.name.includes(hoveredPart))?.pos as [number, number, number]) || [0, 0.5, 0]} distanceFactor={6} center>
          <div className="bg-emerald-500/90 text-white font-extrabold text-[10px] px-2 py-1 rounded-xl backdrop-blur-sm shadow-md pointer-events-none whitespace-nowrap select-none animate-pulse">
            {hoveredPart}
          </div>
        </Html>
      )}
    </group>
  );
}
