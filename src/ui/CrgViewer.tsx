"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const COLOR_PALETTE = ["#f97316", "#22c55e", "#06b6d4", "#eab308", "#3b82f6", "#ef4444", "#14b8a6"];

function extFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (!material) return;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else {
      material.dispose();
    }
  });
}

function styleModel(root: THREE.Object3D, wireframe: boolean): void {
  let meshIndex = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;

      if ("wireframe" in material) {
        (material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).wireframe = wireframe;
      }

      if ("color" in material && material.color instanceof THREE.Color) {
        const hasTexture = "map" in material && !!material.map;
        if (!hasTexture) {
          const hsl = { h: 0, s: 0, l: 0 };
          material.color.getHSL(hsl);
          if (hsl.s < 0.08) {
            material.color.set(COLOR_PALETTE[meshIndex % COLOR_PALETTE.length]!);
          }
        }
      }
    }
    meshIndex += 1;
  });
}

function fitCameraToObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.4;

  camera.position.set(center.x + distance * 0.6, center.y + distance * 0.35, center.z + distance);
  camera.near = Math.max(distance / 200, 0.01);
  camera.far = distance * 200;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

async function parseModel(ext: string, bytes: ArrayBuffer): Promise<THREE.Object3D> {
  if (ext === "glb" || ext === "gltf") {
    const loader = new GLTFLoader();
    return await new Promise<THREE.Object3D>((resolve, reject) => {
      loader.parse(
        bytes,
        "",
        (gltf) => resolve(gltf.scene),
        (err) => reject(err instanceof Error ? err : new Error("Failed to parse GLTF/GLB."))
      );
    });
  }

  if (ext === "obj") {
    const loader = new OBJLoader();
    const text = new TextDecoder().decode(bytes);
    return loader.parse(text);
  }

  if (ext === "fbx") {
    const loader = new FBXLoader();
    return loader.parse(bytes, "");
  }

  throw new Error("Unsupported CRG format for preview.");
}

export function CrgViewer({ projectId, fileName, uploadedAt }: { projectId: string; fileName: string; uploadedAt: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const wireframeRef = useRef(false);

  const [status, setStatus] = useState<string | null>("Loading preview...");
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const ext = useMemo(() => extFromFileName(fileName), [fileName]);

  function resetCamera() {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    if (!camera || !controls || !model) return;
    fitCameraToObject(camera, controls, model);
  }

  useEffect(() => {
    wireframeRef.current = wireframe;
    const model = modelRef.current;
    if (model) styleModel(model, wireframe);
  }, [wireframe]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;
    let frame = 0;
    let model: THREE.Object3D | null = null;

    setError(null);
    setStatus("Loading preview...");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e6edf7");

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(2, 2, 2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c7df, 1.05);
    scene.add(hemi);

    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(amb);

    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(4, 6, 3);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x7dd3fc, 0.75);
    fill.position.set(-5, 4, -4);
    scene.add(fill);

    const grid = new THREE.GridHelper(200, 40, 0x64748b, 0x94a3b8);
    grid.position.y = -0.001;
    scene.add(grid);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(tick);
    };
    tick();

    async function loadModel() {
      try {
        const res = await fetch(`/api/projects/${projectId}/download?kind=crg&t=${encodeURIComponent(uploadedAt)}`, {
          cache: "no-store"
        });
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          throw new Error(maybeJson?.error ?? "Failed to load CRG.");
        }
        const bytes = await res.arrayBuffer();
        const parsed = await parseModel(ext, bytes);
        if (cancelled) {
          disposeObject(parsed);
          return;
        }
        styleModel(parsed, wireframeRef.current);
        model = parsed;
        modelRef.current = parsed;
        scene.add(parsed);
        fitCameraToObject(camera, controls, parsed);
        setStatus(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load preview.");
          setStatus(null);
        }
      }
    }

    void loadModel();

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();

      if (model) {
        scene.remove(model);
        disposeObject(model);
      }

      modelRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;

      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [ext, projectId, uploadedAt]);

  return (
    <div style={{ position: "relative" }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" type="button" onClick={resetCamera}>
          Reset camera
        </button>
        <button className="btn" type="button" onClick={() => setWireframe((v) => !v)}>
          Wireframe: {wireframe ? "On" : "Off"}
        </button>
      </div>
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: 420,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
      />
      {status ? (
        <div className="alert" style={{ position: "absolute", left: 12, bottom: 12, pointerEvents: "none" }}>
          {status}
        </div>
      ) : null}
      {error ? (
        <div className="alert alertErr" style={{ marginTop: 10 }}>
          <strong>Viewer error:</strong> {error}
        </div>
      ) : null}
    </div>
  );
}
