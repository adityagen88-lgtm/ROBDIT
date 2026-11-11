import * as THREE from 'three';
import { AvatarPreset } from './types';

export interface ExplorerRig {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  bodyGroup: THREE.Group;
  nameSprite: THREE.Sprite;
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGridTileTexture(
  baseHex: string,
  lineHex: string,
  anisotropy = 4
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle organic stone/grass grain speckles
  for (let i = 0; i < 240; i++) {
    const x = (Math.sin(i * 78.233) * 0.5 + 0.5) * size;
    const y = (Math.cos(i * 45.164) * 0.5 + 0.5) * size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 4, 4);
  }

  ctx.strokeStyle = lineHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function drawNameTagCanvas(
  canvas: HTMLCanvasElement,
  displayName: string,
  isLocalPlayer: boolean,
  accentCss: string
) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const label = (displayName.trim() || 'Penjelajah').slice(0, 18);
  const fullText = isLocalPlayer ? `${label} (Kamu)` : label;

  ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
  const textWidth = ctx.measureText(fullText).width;
  const boxWidth = Math.min(w - 16, Math.max(130, textWidth + 52));
  const boxX = (w - boxWidth) / 2;
  const boxY = 10;
  const boxH = h - 20;
  const r = 12;

  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxH, r);
  ctx.fillStyle = isLocalPlayer ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 23, 42, 0.82)';
  ctx.fill();

  ctx.lineWidth = isLocalPlayer ? 3 : 2;
  ctx.strokeStyle = isLocalPlayer ? '#fbbf24' : 'rgba(148, 163, 184, 0.55)';
  ctx.stroke();

  // Avatar color swatch square
  ctx.fillStyle = accentCss;
  ctx.fillRect(boxX + 14, boxY + (boxH - 14) / 2, 14, 14);

  // Crisp player name text
  ctx.fillStyle = isLocalPlayer ? '#fef08a' : '#f8fafc';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(fullText, boxX + 36, h / 2 + 1, boxWidth - 48);
}

export function createNameTagSprite(
  displayName: string,
  isLocalPlayer: boolean,
  accentCss: string
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 76;
  drawNameTagCanvas(canvas, displayName, isLocalPlayer, accentCss);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.85, 0.6, 1);
  sprite.position.set(0, 3.18, 0);
  sprite.userData = { canvas, isLocalPlayer, accentCss };
  return sprite;
}

export function updateNameTagSprite(
  sprite: THREE.Sprite,
  displayName: string,
  isLocalPlayer: boolean,
  accentCss: string
) {
  const mat = sprite.material as THREE.SpriteMaterial;
  const canvas = (sprite.userData.canvas as HTMLCanvasElement) || document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 76;
  drawNameTagCanvas(canvas, displayName, isLocalPlayer, accentCss);
  if (mat.map) {
    mat.map.needsUpdate = true;
  }
}

export function createExplorerRig(
  preset: AvatarPreset,
  shadowTex: THREE.Texture,
  castShadow: boolean,
  displayName = 'Penjelajah',
  isLocalPlayer = false
): ExplorerRig {
  const group = new THREE.Group();

  // Soft grounded contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 1.7),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  group.add(shadowPlane);

  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const shirtMat = new THREE.MeshStandardMaterial({
    color: preset.shirtHex,
    roughness: 0.72,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: preset.pantsHex,
    roughness: 0.85,
    metalness: 0.02,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: preset.skinHex,
    roughness: 0.6,
    metalness: 0.0,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x2b1d14,
    roughness: 0.48,
    metalness: 0.15,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: preset.hatHex,
    roughness: 0.78,
    metalness: 0.05,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: preset.accentHex,
    roughness: 0.35,
    metalness: 0.55,
  });

  // Left & Right Legs (pivoted at hip y = 0.78)
  const makeLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.78, 0);

    const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.34), pantsMat);
    upperLeg.position.y = -0.31;
    upperLeg.castShadow = castShadow;
    legPivot.add(upperLeg);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.42), bootMat);
    boot.position.set(0, -0.67, 0.04);
    boot.castShadow = castShadow;
    legPivot.add(boot);

    return legPivot;
  };

  const leftLeg = makeLeg(-0.2);
  const rightLeg = makeLeg(0.2);
  bodyGroup.add(leftLeg, rightLeg);

  // Torso + Explorer Vest Strap + Backpack
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.88, 0.46), shirtMat);
  torso.position.y = 1.22;
  torso.castShadow = castShadow;
  bodyGroup.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.49), bootMat);
  belt.position.y = 0.85;
  bodyGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.08), accentMat);
  buckle.position.set(0, 0.85, 0.24);
  bodyGroup.add(buckle);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.28), hatMat);
  backpack.position.set(0, 1.24, -0.34);
  backpack.castShadow = castShadow;
  bodyGroup.add(backpack);

  // Left & Right Arms (pivoted at shoulder y = 1.56)
  const makeArm = (xOffset: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 1.56, 0);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.56, 0.3), shirtMat);
    sleeve.position.y = -0.26;
    sleeve.castShadow = castShadow;
    armPivot.add(sleeve);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), skinMat);
    hand.position.y = -0.62;
    hand.castShadow = castShadow;
    armPivot.add(hand);

    return armPivot;
  };

  const leftArm = makeArm(-0.57);
  const rightArm = makeArm(0.57);
  bodyGroup.add(leftArm, rightArm);

  // Head + Eyes + Explorer Safari Hat
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.64, 0.66), skinMat);
  head.position.y = 2.02;
  head.castShadow = castShadow;
  bodyGroup.add(head);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.05), eyeMat);
  leftEye.position.set(-0.14, 2.04, 0.33);
  const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.05), eyeMat);
  rightEye.position.set(0.14, 2.04, 0.33);
  bodyGroup.add(leftEye, rightEye);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.65, 0.08, 16), hatMat);
  hatBrim.position.y = 2.34;
  hatBrim.castShadow = castShadow;
  bodyGroup.add(hatBrim);

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.28, 16), hatMat);
  hatCrown.position.y = 2.50;
  hatCrown.castShadow = castShadow;
  bodyGroup.add(hatCrown);

  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.43, 0.07, 16), accentMat);
  hatBand.position.y = 2.40;
  bodyGroup.add(hatBand);

  const nameSprite = createNameTagSprite(displayName, isLocalPlayer, preset.shirtCss);
  group.add(nameSprite);

  return { group, leftLeg, rightLeg, leftArm, rightArm, bodyGroup, nameSprite };
}

export function createMysteryBoxRig(
  accentColor: number,
  shadowTex: THREE.Texture,
  castShadow: boolean
): { root: THREE.Group; chestGroup: THREE.Group; gem: THREE.Mesh; ring: THREE.Mesh } {
  const root = new THREE.Group();

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 2.1),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  const chestGroup = new THREE.Group();
  chestGroup.position.y = 0.85;
  root.add(chestGroup);

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x7c4a26,
    roughness: 0.78,
    metalness: 0.05,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.22,
    metalness: 0.88,
  });
  const gemMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.25,
  });

  // Chest body
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.82, 1.0), woodMat);
  base.castShadow = castShadow;
  chestGroup.add(base);

  // Gold straps
  const strapLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.88, 1.06), goldMat);
  strapLeft.position.x = -0.45;
  const strapRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.88, 1.06), goldMat);
  strapRight.position.x = 0.45;
  chestGroup.add(strapLeft, strapRight);

  // Arched chest lid
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.34, 1.06), woodMat);
  lid.position.y = 0.54;
  lid.castShadow = castShadow;
  chestGroup.add(lid);

  // Front golden lock plate
  const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.12), goldMat);
  lockPlate.position.set(0, 0.28, 0.52);
  chestGroup.add(lockPlate);

  // Floating glowing question crystal above lid
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), gemMat);
  gem.position.y = 1.25;
  chestGroup.add(gem);

  // Ground beacon ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.15, 28),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);

  return { root, chestGroup, gem, ring };
}

interface ActiveParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  age: number;
  maxAge: number;
  scale: number;
}

const CONFETTI_PALETTE = [
  new THREE.Color(0xfbbf24), // Gold
  new THREE.Color(0x22c55e), // Emerald
  new THREE.Color(0x38bdf8), // Sky
  new THREE.Color(0xf43f5e), // Coral Pink
  new THREE.Color(0xffffff), // Sparkle White
];

export class ParticleBurstSystem {
  private instanced: THREE.InstancedMesh;
  private particles: ActiveParticle[] = [];
  private maxCount = 240;
  private cursor = 0;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.24, 0.08, 0.16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });
    this.instanced = new THREE.InstancedMesh(geo, mat, this.maxCount);
    this.instanced.frustumCulled = false;

    for (let i = 0; i < this.maxCount; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        age: 0,
        maxAge: 1.4,
        scale: 0.001,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0.001, 0.001, 0.001);
      this.dummy.updateMatrix();
      this.instanced.setMatrixAt(i, this.dummy.matrix);
      this.instanced.setColorAt(i, CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]);
    }
    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) this.instanced.instanceColor.needsUpdate = true;

    scene.add(this.instanced);
  }

  public burstAt(x: number, y: number, z: number, count = 48) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.maxCount;

      const angle = Math.random() * Math.PI * 2;
      const horiz = 3 + Math.random() * 8;
      p.active = true;
      p.pos.set(x, y + 2.4, z);
      p.vel.set(Math.cos(angle) * horiz, 9 + Math.random() * 9, Math.sin(angle) * horiz);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      p.age = 0;
      p.maxAge = 1.0 + Math.random() * 0.7;
      p.scale = 0.8 + Math.random() * 0.7;
    }
  }

  public update(dt: number) {
    let anyChanged = false;
    for (let i = 0; i < this.maxCount; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      anyChanged = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0.001, 0.001, 0.001);
        this.dummy.updateMatrix();
        this.instanced.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      // Gravity + air drag
      p.vel.y -= 22 * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
      p.pos.addScaledVector(p.vel, dt);

      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const lifeProgress = p.age / p.maxAge;
      const fadeScale = Math.max(0.01, lifeProgress > 0.7 ? (1 - lifeProgress) / 0.3 : 1);
      const s = p.scale * fadeScale;

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.instanced.setMatrixAt(i, this.dummy.matrix);
    }
    if (anyChanged) {
      this.instanced.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.instanced.geometry.dispose();
    (this.instanced.material as THREE.Material).dispose();
  }
}

export class ForestAtmosphereSystem {
  private points: THREE.Points;
  private positions: Float32Array;
  private speeds: Float32Array;
  private count = 140;
  private texture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.positions = new Float32Array(this.count * 3);
    this.speeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 62;
      this.positions[i * 3 + 1] = 0.6 + Math.random() * 7.5;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 62;
      this.speeds[i] = 0.4 + Math.random() * 0.9;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.55,
      map: this.texture,
      color: 0xd9f99d,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  public setTheme(level: 1 | 2 | 3 | 'Podium') {
    const mat = this.points.material as THREE.PointsMaterial;
    if (level === 1) {
      mat.color.setHex(0xd9f99d); // Sunlit forest fireflies & fresh pollen
      mat.opacity = 0.8;
    } else if (level === 2) {
      mat.color.setHex(0xfdba74); // Warm temple torch embers
      mat.opacity = 0.65;
    } else if (level === 3) {
      mat.color.setHex(0xfde047); // Golden summit shimmer
      mat.opacity = 0.75;
    } else {
      mat.color.setHex(0xfef08a);
      mat.opacity = 0.85;
    }
  }

  public update(dt: number, elapsed: number) {
    const attr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3;
      const spd = this.speeds[i];
      this.positions[idx] += Math.sin(elapsed * 0.7 + i) * 0.45 * dt;
      this.positions[idx + 1] += Math.sin(elapsed * 1.1 + i * 1.7) * 0.35 * dt + spd * 0.12 * dt;
      this.positions[idx + 2] += Math.cos(elapsed * 0.6 + i * 0.9) * 0.45 * dt;

      if (this.positions[idx + 1] > 8.5) {
        this.positions[idx + 1] = 0.7;
      }
    }
    attr.needsUpdate = true;
  }

  public dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
