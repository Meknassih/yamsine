"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { getDieTextures } from "./diceTextures";

const TARGET_EULER: Record<number, THREE.Euler> = {
  1: new THREE.Euler(0, 0, 0),
  2: new THREE.Euler(-Math.PI / 2, 0, 0),
  3: new THREE.Euler(0, 0, -Math.PI / 2),
  4: new THREE.Euler(0, 0, Math.PI / 2),
  5: new THREE.Euler(Math.PI / 2, 0, 0),
  6: new THREE.Euler(Math.PI, 0, 0),
};

const TARGET_QUAT: Record<number, THREE.Quaternion> = {};
for (let v = 1; v <= 6; v++) {
  TARGET_QUAT[v] = new THREE.Quaternion().setFromEuler(TARGET_EULER[v]!);
}

const DIE_COUNT = 5;
const DIE_SPACING = 2.4;
const SETTLE_DURATION = 450;

interface DieState {
  mesh: THREE.Mesh;
  angularVel: THREE.Vector3;
  settleStartQuat: THREE.Quaternion;
  settleTargetQuat: THREE.Quaternion;
  settleProgress: number;
  baseY: number;
}

type AnimPhase = "idle" | "rolling" | "settling";

interface Dice3DProps {
  values: number[];
  rolling: boolean;
  rollDuration?: number;
  kept?: boolean[];
  onSettle?: () => void;
}

export default function Dice3D({
  values,
  rolling,
  rollDuration = 800,
  kept,
  onSettle,
}: Dice3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const diceRef = useRef<DieState[]>([]);
  const animFrameRef = useRef(0);
  const phaseRef = useRef<AnimPhase>("idle");
  const rollingStartRef = useRef(0);
  const settleStartRef = useRef(0);
  const onSettleRef = useRef(onSettle);
  const prevRollingRef = useRef(rolling);
  const keptRef = useRef(kept);
  const clockRef = useRef(new THREE.Clock());

  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  useEffect(() => {
    keptRef.current = kept;
  }, [kept]);

  const getTargetQuat = useCallback((value: number) => {
    return TARGET_QUAT[value]?.clone() ?? new THREE.Quaternion();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;
    const aspect = width / Math.max(height, 1);

    const camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 50);
    camera.position.set(0, 8, 5);
    camera.lookAt(0, 0.4, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 512;
    key.shadow.mapSize.height = 512;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0005;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8899cc, 0.8);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, 1, -5);
    scene.add(rim);

    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.8;
    floor.receiveShadow = true;
    scene.add(floor);

    const textures = getDieTextures();
    const geometry = new RoundedBoxGeometry(1, 1, 1, 3, 0.15);

    const dice: DieState[] = [];
    for (let i = 0; i < DIE_COUNT; i++) {
      const faceMaterials = [
        textures[3]!, // +X = value 3
        textures[4]!, // -X = value 4
        textures[1]!, // +Y = value 1
        textures[6]!, // -Y = value 6
        textures[2]!, // +Z = value 2
        textures[5]!, // -Z = value 5
      ].map(
        (tex) =>
          new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.5,
            metalness: 0.02,
          })
      );

      const mesh = new THREE.Mesh(geometry, faceMaterials);
      const x = (i - (DIE_COUNT - 1) / 2) * DIE_SPACING;
      mesh.position.set(x, 1.2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      dice.push({
        mesh,
        angularVel: new THREE.Vector3(),
        settleStartQuat: new THREE.Quaternion(),
        settleTargetQuat: getTargetQuat(values[i] ?? 1),
        settleProgress: 1,
        baseY: mesh.position.y,
      });
    }
    diceRef.current = dice;

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);

      const dt = Math.min(clockRef.current.getDelta(), 0.1);
      const phase = phaseRef.current;

      for (let i = 0; i < dice.length; i++) {
        const die = dice[i]!;
        const isKept = !!(keptRef.current && keptRef.current[i]);

        if (phase === "rolling") {
          if (isKept) {
            die.mesh.position.y = die.baseY;
            die.mesh.quaternion.copy(die.settleTargetQuat);
          } else {
            die.angularVel.x += (Math.random() - 0.5) * 12 * dt;
            die.angularVel.y += (Math.random() - 0.5) * 12 * dt;
            die.angularVel.z += (Math.random() - 0.5) * 8 * dt;

            const speed = die.angularVel.length();
            const maxSpeed = 14;
            if (speed > maxSpeed) {
              die.angularVel.multiplyScalar(maxSpeed / speed);
            }

            const axis = die.angularVel.clone().normalize();
            const angle = speed * dt;
            if (angle > 0.001) {
              const deltaQ = new THREE.Quaternion().setFromAxisAngle(axis, angle);
              die.mesh.quaternion.premultiply(deltaQ);
            }

            die.mesh.position.y = die.baseY;
          }
        } else if (phase === "settling") {
          if (isKept) {
            die.mesh.position.y = die.baseY;
            die.mesh.quaternion.copy(die.settleTargetQuat);
            die.settleProgress = 1;
          } else {
            die.mesh.position.y = die.baseY;
            const elapsed = performance.now() - settleStartRef.current;
            const duration = SETTLE_DURATION;
            const rawT = Math.min(elapsed / duration, 1);
            const t = easeOutCubic(rawT);

            die.mesh.quaternion
              .copy(die.settleStartQuat)
              .slerp(die.settleTargetQuat, t);

            if (rawT >= 1) {
              die.settleProgress = 1;
            }
          }
        } else if (phase === "idle") {
          die.mesh.position.y = die.baseY;
        }

        if (isKept) {
          die.mesh.position.y += 0.4;
        }
      }

      if (phase === "settling") {
        const allSettled = dice.every(
          (d, i) => d.settleProgress >= 1 || (keptRef.current && keptRef.current[i])
        );
        if (allSettled) {
          phaseRef.current = "idle";
          onSettleRef.current?.();
        }
      }

      renderer.render(scene, camera);
    }

    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || 400;
      const h = container.clientHeight || 300;
      rendererRef.current.setSize(w, h, false);
      cameraRef.current.aspect = w / Math.max(h, 1);
      cameraRef.current.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      geometry.dispose();
      for (const die of dice) {
        for (const mat of die.mesh.material as THREE.MeshStandardMaterial[]) {
          mat.dispose();
        }
      }
      floorGeo.dispose();
      floorMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [getTargetQuat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const wasRolling = prevRollingRef.current;
    prevRollingRef.current = rolling;

    if (rolling && !wasRolling) {
      phaseRef.current = "rolling";
      rollingStartRef.current = performance.now();
      for (let i = 0; i < diceRef.current.length; i++) {
        const die = diceRef.current[i]!;
        if (keptRef.current && keptRef.current[i]) {
          die.angularVel.set(0, 0, 0);
        } else {
          die.angularVel.set(
            (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 18,
            (Math.random() - 0.5) * 12
          );
        }
      }
      return;
    }

    if (!rolling && wasRolling) {
      const elapsed = performance.now() - rollingStartRef.current;
      const remaining = Math.max(0, rollDuration - elapsed);
      if (remaining > 0) {
        const timer = setTimeout(() => {
          startSettling();
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        startSettling();
      }
    }

    function startSettling() {
      phaseRef.current = "settling";
      settleStartRef.current = performance.now();
      for (let i = 0; i < diceRef.current.length; i++) {
        const die = diceRef.current[i]!;
        if (keptRef.current && keptRef.current[i]) {
          die.settleStartQuat.copy(die.settleTargetQuat);
          die.settleProgress = 1;
          continue;
        }
        die.settleStartQuat.copy(die.mesh.quaternion);
        die.settleTargetQuat.copy(getTargetQuat(values[i] ?? 1));
        die.settleProgress = 0;
      }
    }
  }, [rolling, values, rollDuration, getTargetQuat, kept]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[200px]"
      style={{ touchAction: "none" }}
    />
  );
}
