"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { Suspense } from "react";
import HumanModel from "./HumanModel";

interface AnatomyCanvasProps {
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

export default function AnatomyCanvas({
  activeLayers,
  selectedPart,
  onSelectPart,
}: AnatomyCanvasProps) {
  return (
    <div className="w-full h-full min-h-[500px] relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl">
      {/* 3D R3F Canvas */}
      <Canvas
        camera={{ position: [0, 1, 4.5], fov: 45 }}
        gl={{ antialias: true }}
      >
        {/* Holographic background color */}
        <color attach="background" args={["#030712"]} />

        {/* Ambient light for subtle overall illumination */}
        <ambientLight intensity={0.4} />

        {/* Dynamic lights for nice depth/glint on 3D objects */}
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#059669" />
        <pointLight position={[-10, 10, -10]} intensity={1.0} color="#3b82f6" />
        <directionalLight position={[0, 5, 5]} intensity={0.8} />

        {/* Grid helpers for medical clinic style ground plane */}
        <Grid
          position={[0, -2.5, 0]}
          args={[10.5, 10.5]}
          cellSize={0.5}
          cellThickness={1}
          cellColor="#1e293b"
          sectionSize={2.5}
          sectionThickness={1.5}
          sectionColor="#334155"
          fadeDistance={15}
          infiniteGrid
        />

        <Suspense fallback={null}>
          <HumanModel
            activeLayers={activeLayers}
            selectedPart={selectedPart}
            onSelectPart={onSelectPart}
          />
        </Suspense>

        {/* Camera Rotation / Zoom limits */}
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 + 0.1} // Avoid looking too far below the grid
          minDistance={1.5}                  // Prevent zooming inside the head
          maxDistance={8}                    // Prevent zooming out too far
          target={[0, 0.5, 0]}
        />
      </Canvas>

      {/* Renders overlay instructions */}
      <div className="absolute bottom-4 left-4 pointer-events-none select-none">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Controls</p>
        <p className="text-[11px] text-slate-300">Left Click + Drag: Rotate | Right Click + Drag: Pan | Scroll: Zoom</p>
      </div>

      <div className="absolute top-4 right-4 pointer-events-none select-none">
        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full backdrop-blur-sm shadow-md">
          ● Holographic Engine V1
        </span>
      </div>
    </div>
  );
}
