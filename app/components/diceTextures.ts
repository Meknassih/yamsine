import * as THREE from "three";

const TEXTURE_SIZE = 256;
const PIP_RADIUS = 16;

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [25, 25],
    [75, 25],
    [50, 50],
    [25, 75],
    [75, 75],
  ],
  6: [
    [25, 20],
    [75, 20],
    [25, 50],
    [75, 50],
    [25, 80],
    [75, 80],
  ],
};

function createFaceTexture(value: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#faf9f6";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const dots = DOT_POSITIONS[value];
  if (dots) {
    const scale = TEXTURE_SIZE / 100;
    ctx.fillStyle = "#1e293b";
    for (const [cx, cy] of dots) {
      ctx.beginPath();
      ctx.arc(cx * scale, cy * scale, PIP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

let _textures: THREE.CanvasTexture[] | null = null;

export function getDieTextures(): THREE.CanvasTexture[] {
  if (!_textures) {
    _textures = [0, 1, 2, 3, 4, 5, 6].map((v) => createFaceTexture(v));
  }
  return _textures;
}
