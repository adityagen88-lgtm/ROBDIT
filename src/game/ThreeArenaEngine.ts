import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AVATAR_PRESETS, LEVEL_CONFIGS } from './config';
import {
  createExplorerRig,
  createGridTileTexture,
  createMysteryBoxRig,
  createRadialShadowTexture,
  ExplorerRig,
  ForestAtmosphereSystem,
  ParticleBurstSystem,
  updateNameTagSprite,
} from './proceduralModels';
import { AvatarId, GamePhase, PlayerRecord, RadarSnapshot } from './types';

interface PlatformBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

interface ActiveBox3D {
  id: string;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  respawnTimer: number;
  rig: ReturnType<typeof createMysteryBoxRig>;
}

interface RemoteActor {
  playerId: string;
  name: string;
  avatarId: AvatarId;
  rig: ExplorerRig;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  targetYaw: number;
  moving: boolean;
  grounded: boolean;
  walkPhase: number;
}

export interface ArenaCallbacks {
  onNearestBoxChange: (boxId: string | null) => void;
  onLocalPlayerMove?: (move: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    moving: boolean;
    grounded: boolean;
  }) => void;
  onRadarUpdate?: (snapshot: RadarSnapshot) => void;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class ThreeArenaEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  private shadowTex: THREE.CanvasTexture;
  private worldGroup = new THREE.Group();
  private boxesGroup = new THREE.Group();
  private actorsGroup = new THREE.Group();
  private particles: ParticleBurstSystem;
  private atmosphere: ForestAtmosphereSystem;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private platforms: PlatformBox[] = [];
  private treeObstacles: Array<{ x: number; z: number; r: number }> = [];
  private activeBoxes: ActiveBox3D[] = [];
  private remoteActors = new Map<string, RemoteActor>();
  private podiumActors: RemoteActor[] = [];

  private playerRig: ExplorerRig;
  private playerAvatarId: AvatarId = 'Rimbi';
  private playerName = 'Penjelajah';
  private playerPos = new THREE.Vector3(0, 0, 10);
  private playerVelY = 0;
  private playerYaw = Math.PI;
  private playerWalkPhase = 0;
  private isGrounded = true;
  private lastNetSendTime = 0;
  private lastRadarSendTime = 0;

  private keysPressed = new Set<string>();
  private touchMove = { x: 0, z: 0 };
  private inputPaused = false;
  private currentPhase: GamePhase = 'Login';
  private currentLevel: 1 | 2 | 3 = 1;
  private nearestBoxId: string | null = null;
  private callbacks: ArenaCallbacks;

  private camCurrentPos = new THREE.Vector3(0, 7, 18);
  private camCurrentLook = new THREE.Vector3(0, 1.5, 0);

  constructor(
    container: HTMLElement,
    callbacks: ArenaCallbacks,
    initialAvatar: AvatarId,
    initialName = 'Penjelajah'
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.playerAvatarId = initialAvatar;
    this.playerName = initialName;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7dd3fc);
    this.scene.fog = new THREE.FogExp2(0xbae6fd, 0.012);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.1, 220);
    this.camera.position.copy(this.camCurrentPos);

    // Three-point outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3f6212, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.keyLight.position.set(28, 42, 22);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 110;
    const d = 38;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(-25, 18, -25);
    this.scene.add(rimLight);

    this.shadowTex = createRadialShadowTexture();
    this.scene.add(this.worldGroup, this.boxesGroup, this.actorsGroup);
    this.particles = new ParticleBurstSystem(this.scene);
    this.atmosphere = new ForestAtmosphereSystem(this.scene);

    this.playerRig = createExplorerRig(
      AVATAR_PRESETS[this.playerAvatarId],
      this.shadowTex,
      !this.isSoftwareGl,
      this.playerName,
      true
    );
    this.actorsGroup.add(this.playerRig.group);

    this.buildLevelWorld(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.tick();
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
  };

  private handleWindowBlur = () => {
    this.keysPressed.clear();
    this.touchMove.x = 0;
    this.touchMove.z = 0;
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const canWalk = this.currentPhase === 'Playing' || this.currentPhase === 'WaitingRoom';
    if (this.inputPaused || !canWalk) return;

    const code = e.code;
    this.keysPressed.add(code);
    if (code === 'Space') {
      e.preventDefault();
      this.triggerJump();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysPressed.delete(e.code);
  };

  public setInputPaused(paused: boolean) {
    this.inputPaused = paused;
    if (paused) {
      this.keysPressed.clear();
      this.touchMove.x = 0;
      this.touchMove.z = 0;
    }
  }

  public setTouchInput(dx: number, dz: number) {
    if (this.inputPaused) {
      this.touchMove.x = 0;
      this.touchMove.z = 0;
      return;
    }
    this.touchMove.x = dx;
    this.touchMove.z = dz;
  }

  public triggerJump() {
    const canJump = this.currentPhase === 'Playing' || this.currentPhase === 'WaitingRoom';
    if (!canJump || this.inputPaused) return;
    if (this.isGrounded) {
      this.playerVelY = 13.2;
      this.isGrounded = false;
    }
  }

  public setPlayerIdentity(name: string, avatarId: AvatarId) {
    const cleanName = name.trim() || 'Penjelajah Cilik';
    const avatarChanged = this.playerAvatarId !== avatarId;
    const nameChanged = this.playerName !== cleanName;

    this.playerName = cleanName;
    this.playerAvatarId = avatarId;

    if (avatarChanged) {
      const pos = this.playerRig.group.position.clone();
      const rot = this.playerRig.group.rotation.y;
      this.actorsGroup.remove(this.playerRig.group);
      this.playerRig = createExplorerRig(
        AVATAR_PRESETS[avatarId],
        this.shadowTex,
        !this.isSoftwareGl,
        cleanName,
        true
      );
      this.playerRig.group.position.copy(pos);
      this.playerRig.group.rotation.y = rot;
      this.actorsGroup.add(this.playerRig.group);
    } else if (nameChanged) {
      updateNameTagSprite(
        this.playerRig.nameSprite,
        cleanName,
        true,
        AVATAR_PRESETS[avatarId].shirtCss
      );
    }
  }

  public syncRoster(
    players: PlayerRecord[],
    phase: GamePhase,
    localPlayerId: string | null,
    isAdmin = false
  ) {
    const prevPhase = this.currentPhase;
    this.currentPhase = phase;

    // Show Mystery Boxes only during active gameplay / spectator / elimination
    this.boxesGroup.visible =
      phase === 'Playing' || phase === 'Spectator' || phase === 'EliminationReport';

    // Clear podium actors when leaving Podium
    if (phase !== 'Podium' && this.podiumActors.length > 0) {
      for (const p of this.podiumActors) {
        this.actorsGroup.remove(p.rig.group);
      }
      this.podiumActors = [];
    }

    if (phase === 'Login') {
      for (const actor of this.remoteActors.values()) {
        this.actorsGroup.remove(actor.rig.group);
      }
      this.remoteActors.clear();
      this.playerRig.group.visible = true;
      this.playerPos.set(0, 0, 0);
      this.playerRig.group.position.set(0, 0, 0);
      return;
    }

    // Local student rig visibility
    this.playerRig.group.visible = !isAdmin && (phase === 'Playing' || phase === 'WaitingRoom');
    if (prevPhase === 'Login' && phase === 'WaitingRoom' && !isAdmin) {
      this.playerPos.set(0, 0, 12);
      this.playerRig.group.position.set(0, 0, 12);
    }

    // Idempotent sync of real remote human players
    const visibleRemoteIds = new Set<string>();
    for (const p of players) {
      if (p.id === localPlayerId) continue;
      if (phase !== 'WaitingRoom' && p.status !== 'Playing') continue;
      visibleRemoteIds.add(p.id);

      const existing = this.remoteActors.get(p.id);
      if (existing) {
        if (existing.name !== p.name || existing.avatarId !== p.avatarId) {
          this.actorsGroup.remove(existing.rig.group);
          const rig = createExplorerRig(
            AVATAR_PRESETS[p.avatarId],
            this.shadowTex,
            !this.isSoftwareGl,
            p.name,
            false
          );
          rig.group.position.set(existing.x, existing.y, existing.z);
          this.actorsGroup.add(rig.group);
          existing.rig = rig;
          existing.name = p.name;
          existing.avatarId = p.avatarId;
        }
        existing.targetX = p.x;
        existing.targetY = p.y;
        existing.targetZ = p.z;
        existing.targetYaw = p.yaw;
        existing.moving = p.moving;
        existing.grounded = p.grounded;
      } else {
        const rig = createExplorerRig(
          AVATAR_PRESETS[p.avatarId],
          this.shadowTex,
          !this.isSoftwareGl,
          p.name,
          false
        );
        rig.group.position.set(p.x, p.y, p.z);
        rig.group.rotation.y = p.yaw;
        this.actorsGroup.add(rig.group);
        this.remoteActors.set(p.id, {
          playerId: p.id,
          name: p.name,
          avatarId: p.avatarId,
          rig,
          x: p.x,
          y: p.y,
          z: p.z,
          targetX: p.x,
          targetY: p.y,
          targetZ: p.z,
          yaw: p.yaw,
          targetYaw: p.yaw,
          moving: p.moving,
          grounded: p.grounded,
          walkPhase: Math.random() * 6,
        });
      }
    }

    // Remove disconnected or eliminated remote actors
    for (const [id, actor] of this.remoteActors.entries()) {
      if (!visibleRemoteIds.has(id)) {
        this.actorsGroup.remove(actor.rig.group);
        this.remoteActors.delete(id);
      }
    }
  }

  public updateRemotePlayer(data: {
    id: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    moving: boolean;
    grounded: boolean;
  }) {
    const actor = this.remoteActors.get(data.id);
    if (!actor) return;
    actor.targetX = data.x;
    actor.targetY = data.y;
    actor.targetZ = data.z;
    actor.targetYaw = data.yaw;
    actor.moving = data.moving;
    actor.grounded = data.grounded;
  }

  public syncOpenedBoxes(openedIds: string[]) {
    const set = new Set(openedIds);
    let changed = false;
    for (const box of this.activeBoxes) {
      if (set.has(box.id) && !box.opened) {
        box.opened = true;
        box.respawnTimer = 8;
        box.rig.root.visible = false;
        changed = true;
      }
    }
    if (changed) {
      this.emitRadarSnapshot();
    }
  }

  public loadLevel(level: 1 | 2 | 3) {
    this.currentLevel = level;
    this.playerPos.set(0, 0, 14);
    this.playerVelY = 0;
    this.isGrounded = true;
    this.playerYaw = Math.PI;
    this.buildLevelWorld(level);
    this.emitRadarSnapshot();
  }

  public showPodium(topThree: PlayerRecord[], localPlayerId: string | null) {
    this.currentPhase = 'Podium';
    this.clearGroup(this.worldGroup);
    this.clearGroup(this.boxesGroup);
    this.activeBoxes = [];
    this.platforms = [];
    this.treeObstacles = [];
    this.playerRig.group.visible = false;
    this.atmosphere.setTheme('Podium');

    for (const actor of this.remoteActors.values()) {
      this.actorsGroup.remove(actor.rig.group);
    }
    this.remoteActors.clear();
    for (const p of this.podiumActors) {
      this.actorsGroup.remove(p.rig.group);
    }
    this.podiumActors = [];

    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x1e1b4b, 0.01);
    this.hemiLight.color.setHex(0xfef3c7);
    this.hemiLight.groundColor.setHex(0x1e293b);
    this.keyLight.color.setHex(0xfde68a);

    const floorTex = createGridTileTexture('#1e293b', '#334155', this.renderer.capabilities.getMaxAnisotropy());
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !this.isSoftwareGl;
    this.worldGroup.add(floor);

    const podiumHeights = [3.0, 2.0, 1.2];
    const podiumX = [0, -3.4, 3.4];
    const podiumColors = [0xfbbf24, 0xcbd5e1, 0xd97706];

    for (let i = 0; i < 3; i++) {
      const h = podiumHeights[i];
      const ped = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, h, 2.6),
        new THREE.MeshStandardMaterial({
          color: podiumColors[i],
          roughness: 0.25,
          metalness: 0.8,
        })
      );
      ped.position.set(podiumX[i], h / 2, 0);
      ped.castShadow = !this.isSoftwareGl;
      ped.receiveShadow = !this.isSoftwareGl;
      this.worldGroup.add(ped);

      const winner = topThree[i];
      if (winner) {
        const rig = createExplorerRig(
          AVATAR_PRESETS[winner.avatarId],
          this.shadowTex,
          !this.isSoftwareGl,
          winner.name,
          winner.id === localPlayerId
        );
        rig.group.position.set(podiumX[i], h, 0);
        rig.group.rotation.y = 0;
        this.actorsGroup.add(rig.group);
        this.podiumActors.push({
          playerId: winner.id,
          name: winner.name,
          avatarId: winner.avatarId,
          rig,
          x: podiumX[i],
          y: h,
          z: 0,
          targetX: podiumX[i],
          targetY: h,
          targetZ: 0,
          yaw: 0,
          targetYaw: 0,
          moving: false,
          grounded: true,
          walkPhase: i * 1.4,
        });
      }
    }

    this.particles.burstAt(0, 3.5, 0, 60);
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
    }
  }

  private buildLevelWorld(level: 1 | 2 | 3) {
    this.clearGroup(this.worldGroup);
    this.clearGroup(this.boxesGroup);
    this.platforms = [];
    this.treeObstacles = [];
    this.activeBoxes = [];

    const cfg = LEVEL_CONFIGS[level];
    this.atmosphere.setTheme(level);
    this.scene.background = new THREE.Color(cfg.skyColor);
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, level === 1 ? 0.0085 : 0.012);

    this.hemiLight.color.setHex(level === 1 ? 0xe0f2fe : level === 2 ? 0xa78bfa : 0xfef08a);
    this.hemiLight.groundColor.setHex(cfg.groundColor);
    this.keyLight.color.setHex(level === 1 ? 0xfffbeb : level === 2 ? 0xfdba74 : 0xfde047);

    // Extended outdoor terrain (no walled box void)
    const groundHex = '#' + cfg.groundColor.toString(16).padStart(6, '0');
    const lineHex = level === 1 ? '#2f723c' : level === 2 ? '#44403c' : '#292524';
    const groundTex = createGridTileTexture(
      groundHex,
      lineHex,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({
        map: groundTex,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = !this.isSoftwareGl;
    this.worldGroup.add(ground);

    // Central spawn courtyard pad
    const padMat = new THREE.MeshStandardMaterial({
      color: cfg.platformColor,
      roughness: 0.65,
      metalness: level === 3 ? 0.5 : 0.1,
    });
    const centerPad = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.2, 0.35, 24), padMat);
    centerPad.position.set(0, 0.175, 14);
    centerPad.receiveShadow = !this.isSoftwareGl;
    this.worldGroup.add(centerPad);

    // Obby elevated platforms arranged around the arena
    const obbySpecs: Array<[number, number, number, number, number]> = [
      [-10, 1.1, 4, 4.5, 4.5],
      [-15, 2.2, -3, 4.5, 4.5],
      [-8, 1.3, -12, 5.2, 4.5],
      [0, 2.4, -18, 6.0, 5.2],
      [10, 1.2, -11, 4.8, 4.8],
      [16, 2.3, -2, 4.8, 4.8],
      [11, 1.1, 7, 4.6, 4.6],
      [0, 1.5, -2, 5.0, 5.0],
    ];

    for (const [px, py, pz, sx, sz] of obbySpecs) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(sx, py, sz), padMat);
      plat.position.set(px, py / 2, pz);
      plat.castShadow = !this.isSoftwareGl;
      plat.receiveShadow = !this.isSoftwareGl;
      this.worldGroup.add(plat);

      // Decorative trim ledge
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(sx + 0.25, 0.18, sz + 0.25),
        new THREE.MeshStandardMaterial({
          color: cfg.accentColor,
          roughness: 0.4,
          metalness: level === 3 ? 0.8 : 0.2,
        })
      );
      trim.position.set(px, py - 0.08, pz);
      this.worldGroup.add(trim);

      this.platforms.push({
        minX: px - sx / 2,
        maxX: px + sx / 2,
        minZ: pz - sz / 2,
        maxZ: pz + sz / 2,
        topY: py,
      });
    }

    // Natural perimeter props using InstancedMesh (>20 repeated assets)
    this.buildBiomePerimeter(level, cfg.accentColor);

    // Spawn Mystery Boxes on both ground clearings & obby platforms
    const boxSpots: Array<[number, number, number]> = [
      [-10, 1.1, 4],
      [-15, 2.2, -3],
      [-8, 1.3, -12],
      [0, 2.4, -18],
      [10, 1.2, -11],
      [16, 2.3, -2],
      [11, 1.1, 7],
      [0, 1.5, -2],
      [-20, 0, 12],
      [20, 0, 12],
      [-19, 0, -16],
      [19, 0, -16],
    ];

    boxSpots.slice(0, cfg.activeBoxCount).forEach(([bx, by, bz], idx) => {
      const rig = createMysteryBoxRig(cfg.accentColor, this.shadowTex, !this.isSoftwareGl);
      rig.root.position.set(bx, by, bz);
      this.boxesGroup.add(rig.root);
      this.activeBoxes.push({
        id: `box-${level}-${idx}`,
        x: bx,
        y: by,
        z: bz,
        opened: false,
        respawnTimer: 0,
        rig,
      });
    });
  }

  private addForestFoliage(
    treePositions: Array<{ x: number; z: number; scale: number; collides: boolean }>,
    tintHueBase: number,
    bushCount: number
  ) {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const treeCount = treePositions.length;

    // 1. Multi-tiered 3-part shady trees (trunk + lower wide canopy + upper crown)
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.54, 3.8, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.92 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunks.castShadow = !this.isSoftwareGl;

    const lowerCrownGeo = new THREE.ConeGeometry(2.6, 3.4, 9);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
    const lowerCrowns = new THREE.InstancedMesh(lowerCrownGeo, crownMat, treeCount);
    lowerCrowns.castShadow = !this.isSoftwareGl;

    const upperCrownGeo = new THREE.ConeGeometry(1.85, 3.0, 9);
    const upperCrowns = new THREE.InstancedMesh(upperCrownGeo, crownMat, treeCount);
    upperCrowns.castShadow = !this.isSoftwareGl;

    const shadeGeo = new THREE.PlaneGeometry(5.6, 5.6);
    const shadeMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
    });
    const shadeDiscs = new THREE.InstancedMesh(shadeGeo, shadeMat, treeCount);

    treePositions.forEach((t, i) => {
      const s = t.scale;
      dummy.rotation.set(0, (i * 1.1) % (Math.PI * 2), 0);
      dummy.position.set(t.x, 1.9 * s, t.z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, 4.3 * s, t.z);
      dummy.updateMatrix();
      lowerCrowns.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, 6.2 * s, t.z);
      dummy.updateMatrix();
      upperCrowns.setMatrixAt(i, dummy.matrix);

      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.position.set(t.x, 0.03, t.z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      shadeDiscs.setMatrixAt(i, dummy.matrix);

      color.setHSL(tintHueBase + (i % 5) * 0.016, 0.56, 0.28 + (i % 3) * 0.05);
      lowerCrowns.setColorAt(i, color);
      color.setHSL(tintHueBase + (i % 5) * 0.016, 0.58, 0.36 + (i % 3) * 0.05);
      upperCrowns.setColorAt(i, color);

      if (t.collides) {
        this.treeObstacles.push({ x: t.x, z: t.z, r: 0.65 * s });
      }
    });

    trunks.computeBoundingSphere();
    lowerCrowns.computeBoundingSphere();
    upperCrowns.computeBoundingSphere();
    shadeDiscs.computeBoundingSphere();
    if (lowerCrowns.instanceColor) lowerCrowns.instanceColor.needsUpdate = true;
    if (upperCrowns.instanceColor) upperCrowns.instanceColor.needsUpdate = true;
    this.worldGroup.add(trunks, lowerCrowns, upperCrowns, shadeDiscs);

    // 2. Lush forest bushes & wildflowers along clearings
    const bushGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
    bushes.castShadow = !this.isSoftwareGl;

    const flowerGeo = new THREE.CylinderGeometry(0.22, 0.05, 0.18, 6);
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, bushCount);

    const flowerPalette = [0xfef08a, 0xfb7185, 0x93c5fd, 0xfdba74];

    for (let i = 0; i < bushCount; i++) {
      const anchor = treePositions[i % treeCount];
      const ang = (i * 2.39996) % (Math.PI * 2);
      const dist = 2.0 + (i % 4) * 0.9;
      const bx = THREE.MathUtils.clamp(anchor.x + Math.cos(ang) * dist, -34, 34);
      const bz = THREE.MathUtils.clamp(anchor.z + Math.sin(ang) * dist, -34, 34);
      const bs = 0.65 + (i % 4) * 0.22;

      dummy.rotation.set(0, ang, 0);
      dummy.position.set(bx, 0.45 * bs, bz);
      dummy.scale.set(bs * 1.15, bs * 0.85, bs * 1.15);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);

      color.setHSL(tintHueBase + 0.02 + (i % 4) * 0.015, 0.62, 0.34 + (i % 3) * 0.05);
      bushes.setColorAt(i, color);

      dummy.position.set(bx + Math.cos(ang + 1.2) * 1.1, 0.14, bz + Math.sin(ang + 1.2) * 1.1);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
      color.setHex(flowerPalette[i % flowerPalette.length]);
      flowers.setColorAt(i, color);
    }

    bushes.computeBoundingSphere();
    flowers.computeBoundingSphere();
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    this.worldGroup.add(bushes, flowers);
  }

  private buildBiomePerimeter(level: 1 | 2 | 3, accentColor: number) {
    const dummy = new THREE.Object3D();

    if (level === 1) {
      // Level 1: Dense double-ring perimeter woodland + inner shady grove trees
      const trees: Array<{ x: number; z: number; scale: number; collides: boolean }> = [];
      const outerCount = 56;
      for (let i = 0; i < outerCount; i++) {
        const angle = (i / outerCount) * Math.PI * 2;
        const r = 27.5 + (i % 3) * 4.8;
        trees.push({
          x: Math.cos(angle) * r,
          z: Math.sin(angle) * r,
          scale: 0.9 + (i % 4) * 0.18,
          collides: false,
        });
      }

      // Inner shady grove trees placed in safe clearings away from obby platforms & spawn pad
      const innerSpots: Array<[number, number, number]> = [
        [-19, 4, 1.15],
        [-21, -8, 1.25],
        [-13, 17, 1.1],
        [14, 17, 1.12],
        [21, 3, 1.22],
        [21, -10, 1.15],
        [-14, -21, 1.2],
        [13, -21, 1.18],
        [-5, 7, 0.95],
        [6, 11, 0.92],
        [-4, -7, 0.96],
        [6, -6, 0.98],
      ];
      for (const [tx, tz, sc] of innerSpots) {
        trees.push({ x: tx, z: tz, scale: sc, collides: true });
      }

      this.addForestFoliage(trees, 0.33, 64);
    } else {
      // Temple stone pillars (Level 2) or Golden crystal spires (Level 3)
      const count = 36;
      const pillarGeo =
        level === 2
          ? new THREE.CylinderGeometry(0.75, 0.9, 6.5, 8)
          : new THREE.ConeGeometry(1.3, 7.2, 6);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: level === 2 ? 0x78716c : 0xf59e0b,
        roughness: level === 2 ? 0.85 : 0.25,
        metalness: level === 2 ? 0.1 : 0.85,
      });
      const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, count);
      pillars.castShadow = !this.isSoftwareGl;

      const capGeo = new THREE.OctahedronGeometry(0.55, 0);
      const capMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.9,
      });
      const caps = new THREE.InstancedMesh(capGeo, capMat, count);

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = 28 + (i % 3) * 6;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const s = 0.85 + (i % 3) * 0.18;

        dummy.position.set(x, 3.2 * s, z);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        pillars.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, 7.1 * s, z);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
      }
      pillars.computeBoundingSphere();
      caps.computeBoundingSphere();
      this.worldGroup.add(pillars, caps);

      // Surround Temple & Golden Mountain with shady outer pines/shrubs for depth
      const scenicTrees: Array<{ x: number; z: number; scale: number; collides: boolean }> = [];
      for (let i = 0; i < 28; i++) {
        const angle = ((i + 0.5) / 28) * Math.PI * 2;
        const r = 31 + (i % 2) * 5;
        scenicTrees.push({
          x: Math.cos(angle) * r,
          z: Math.sin(angle) * r,
          scale: 0.95 + (i % 3) * 0.18,
          collides: false,
        });
      }
      this.addForestFoliage(scenicTrees, level === 2 ? 0.37 : 0.14, 32);
    }
  }

  public markBoxSolved(boxId: string, respawnSeconds: number) {
    const box = this.activeBoxes.find((b) => b.id === boxId);
    if (!box) return;

    this.particles.burstAt(box.x, box.y, box.z, 52);
    box.opened = true;
    box.respawnTimer = respawnSeconds;
    box.rig.root.visible = false;

    if (this.nearestBoxId === boxId) {
      this.nearestBoxId = null;
      this.callbacks.onNearestBoxChange(null);
    }
    this.emitRadarSnapshot();
  }

  private emitRadarSnapshot() {
    if (!this.callbacks.onRadarUpdate) return;
    if (this.currentPhase !== 'Playing' && this.currentPhase !== 'Spectator') return;

    const remotePlayers = Array.from(this.remoteActors.values()).map((a) => ({
      id: a.playerId,
      name: a.name,
      x: Number(a.x.toFixed(2)),
      z: Number(a.z.toFixed(2)),
    }));

    const boxes = this.activeBoxes.map((b) => ({
      id: b.id,
      x: b.x,
      z: b.z,
      opened: b.opened,
    }));

    const platforms = this.platforms.map((p) => ({
      minX: p.minX,
      maxX: p.maxX,
      minZ: p.minZ,
      maxZ: p.maxZ,
    }));

    this.callbacks.onRadarUpdate({
      localPlayer: this.playerRig.group.visible
        ? {
            x: Number(this.playerPos.x.toFixed(2)),
            z: Number(this.playerPos.z.toFixed(2)),
            yaw: Number(this.playerYaw.toFixed(2)),
          }
        : null,
      remotePlayers,
      boxes,
      platforms,
    });
  }

  public getBoxWorldPosition(boxId: string) {
    const box = this.activeBoxes.find((b) => b.id === boxId);
    return box ? { x: box.x, y: box.y, z: box.z } : { x: 0, y: 0, z: 0 };
  }

  private getFloorHeightAt(x: number, z: number, currentY: number): number {
    let floorY = 0;
    for (const p of this.platforms) {
      if (
        x >= p.minX - 0.35 &&
        x <= p.maxX + 0.35 &&
        z >= p.minZ - 0.35 &&
        z <= p.maxZ + 0.35 &&
        currentY >= p.topY - 0.75
      ) {
        if (p.topY > floorY) floorY = p.topY;
      }
    }
    return floorY;
  }

  private animateExplorer(rig: ExplorerRig, walkPhase: number, moving: boolean, grounded: boolean) {
    if (!grounded) {
      rig.leftLeg.rotation.x = 0.35;
      rig.rightLeg.rotation.x = -0.35;
      rig.leftArm.rotation.x = -0.9;
      rig.rightArm.rotation.x = -0.9;
      return;
    }
    if (moving) {
      const swing = Math.sin(walkPhase * 11) * 0.65;
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.8;
      rig.rightArm.rotation.x = swing * 0.8;
      rig.bodyGroup.position.y = Math.abs(Math.cos(walkPhase * 11)) * 0.08;
    } else {
      rig.leftLeg.rotation.x *= 0.82;
      rig.rightLeg.rotation.x *= 0.82;
      rig.leftArm.rotation.x *= 0.82;
      rig.rightArm.rotation.x *= 0.82;
      rig.bodyGroup.position.y *= 0.82;
    }
  }

  private tick = () => {
    if (this.disposed) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    // 1. Update local player movement & physics during Playing or WaitingRoom
    if (
      (this.currentPhase === 'Playing' || this.currentPhase === 'WaitingRoom') &&
      this.playerRig.group.visible
    ) {
      let moveX = this.inputPaused ? 0 : this.touchMove.x;
      let moveZ = this.inputPaused ? 0 : this.touchMove.z;

      if (!this.inputPaused) {
        if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) moveZ -= 1;
        if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) moveZ += 1;
        if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) moveX -= 1;
        if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) moveX += 1;
      }

      const mag = Math.hypot(moveX, moveZ);
      const isMoving = mag > 0.05;
      if (isMoving) {
        moveX /= mag;
        moveZ /= mag;
        const speed = 11.5;
        let nextX = THREE.MathUtils.clamp(this.playerPos.x + moveX * speed * dt, -25, 25);
        let nextZ = THREE.MathUtils.clamp(this.playerPos.z + moveZ * speed * dt, -25, 25);

        const r = 0.5;
        for (const p of this.platforms) {
          if (this.playerPos.y < p.topY - 0.55) {
            const insideX = nextX > p.minX - r && nextX < p.maxX + r;
            const insideZ = nextZ > p.minZ - r && nextZ < p.maxZ + r;
            if (insideX && insideZ) {
              const overlapLeft = Math.abs(nextX - (p.minX - r));
              const overlapRight = Math.abs(p.maxX + r - nextX);
              const overlapTop = Math.abs(nextZ - (p.minZ - r));
              const overlapBottom = Math.abs(p.maxZ + r - nextZ);
              const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
              if (minOverlap === overlapLeft) nextX = p.minX - r;
              else if (minOverlap === overlapRight) nextX = p.maxX + r;
              else if (minOverlap === overlapTop) nextZ = p.minZ - r;
              else nextZ = p.maxZ + r;
            }
          }
        }

        for (const t of this.treeObstacles) {
          const dx = nextX - t.x;
          const dz = nextZ - t.z;
          const dTree = Math.hypot(dx, dz);
          const minDist = t.r + 0.45;
          if (dTree < minDist && dTree > 0.0001) {
            nextX = t.x + (dx / dTree) * minDist;
            nextZ = t.z + (dz / dTree) * minDist;
          }
        }

        this.playerPos.x = nextX;
        this.playerPos.z = nextZ;

        const targetYaw = Math.atan2(moveX, moveZ);
        let diff = targetYaw - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * Math.min(1, 14 * dt);
        this.playerWalkPhase += dt;
      }

      this.playerVelY -= 32 * dt;
      this.playerPos.y += this.playerVelY * dt;
      const floorY = this.getFloorHeightAt(this.playerPos.x, this.playerPos.z, this.playerPos.y);
      if (this.playerPos.y <= floorY) {
        this.playerPos.y = floorY;
        this.playerVelY = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }

      this.playerRig.group.position.copy(this.playerPos);
      this.playerRig.group.rotation.y = this.playerYaw;
      this.animateExplorer(this.playerRig, this.playerWalkPhase, isMoving, this.isGrounded);

      // Broadcast local player movement at ~15 Hz to multiplayer server
      if (this.callbacks.onLocalPlayerMove && elapsed - this.lastNetSendTime >= 0.066) {
        this.lastNetSendTime = elapsed;
        this.callbacks.onLocalPlayerMove({
          x: Number(this.playerPos.x.toFixed(2)),
          y: Number(this.playerPos.y.toFixed(2)),
          z: Number(this.playerPos.z.toFixed(2)),
          yaw: Number(this.playerYaw.toFixed(2)),
          moving: isMoving,
          grounded: this.isGrounded,
        });
      }

      // Proximity check against active Mystery Boxes (only when Playing)
      if (this.currentPhase === 'Playing') {
        let closestId: string | null = null;
        let closestDist = 3.2;
        for (const box of this.activeBoxes) {
          if (box.opened) continue;
          const dist = Math.hypot(this.playerPos.x - box.x, this.playerPos.z - box.z);
          const dy = Math.abs(this.playerPos.y - box.y);
          if (dist < closestDist && dy < 2.5) {
            closestDist = dist;
            closestId = box.id;
          }
        }
        if (closestId !== this.nearestBoxId) {
          this.nearestBoxId = closestId;
          this.callbacks.onNearestBoxChange(closestId);
        }
      }

      _vec3A.set(this.playerPos.x, this.playerPos.y + 6.5, this.playerPos.z + 10.5);
      _vec3B.set(this.playerPos.x, this.playerPos.y + 1.4, this.playerPos.z);
    } else if (this.currentPhase === 'Login') {
      this.playerRig.group.rotation.y = Math.sin(elapsed * 0.6) * 0.6;
      this.animateExplorer(this.playerRig, elapsed * 0.4, false, true);
      _vec3A.set(4.5, 4.2, 9.5);
      _vec3B.set(0, 1.5, 0);
    } else if (this.currentPhase === 'Podium') {
      for (let i = 0; i < this.podiumActors.length; i++) {
        const w = this.podiumActors[i];
        const hop = Math.abs(Math.sin(elapsed * 3.8 + w.walkPhase)) * 0.45;
        w.rig.group.position.y = w.y + hop;
        w.rig.leftArm.rotation.x = -2.4 + Math.sin(elapsed * 6 + i) * 0.3;
        w.rig.rightArm.rotation.x = -2.4 - Math.sin(elapsed * 6 + i) * 0.3;
      }
      _vec3A.set(Math.sin(elapsed * 0.25) * 4, 5.2, 12.5);
      _vec3B.set(0, 2.2, 0);
    } else {
      // Teacher Admin / Spectator / EliminationReport orbit camera
      _vec3A.set(Math.sin(elapsed * 0.2) * 25, 16, Math.cos(elapsed * 0.2) * 25);
      _vec3B.set(0, 1.5, 0);
    }

    this.camCurrentPos.x = THREE.MathUtils.damp(this.camCurrentPos.x, _vec3A.x, 5.5, dt);
    this.camCurrentPos.y = THREE.MathUtils.damp(this.camCurrentPos.y, _vec3A.y, 5.5, dt);
    this.camCurrentPos.z = THREE.MathUtils.damp(this.camCurrentPos.z, _vec3A.z, 5.5, dt);

    this.camCurrentLook.x = THREE.MathUtils.damp(this.camCurrentLook.x, _vec3B.x, 7, dt);
    this.camCurrentLook.y = THREE.MathUtils.damp(this.camCurrentLook.y, _vec3B.y, 7, dt);
    this.camCurrentLook.z = THREE.MathUtils.damp(this.camCurrentLook.z, _vec3B.z, 7, dt);

    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    // 2. Animate Mystery Boxes (bob + rotate gem + respawn timer)
    for (const box of this.activeBoxes) {
      if (box.opened) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.opened = false;
          box.rig.root.visible = true;
        }
        continue;
      }
      box.rig.chestGroup.position.y = 0.85 + Math.sin(elapsed * 2.4 + box.x) * 0.14;
      box.rig.chestGroup.rotation.y += dt * 0.7;
      box.rig.gem.rotation.y -= dt * 1.8;
      const pulse = 1 + Math.sin(elapsed * 3.5 + box.z) * 0.08;
      box.rig.ring.scale.set(pulse, pulse, 1);
    }

    // 3. Smoothly interpolate real remote human players
    for (const actor of this.remoteActors.values()) {
      actor.x = THREE.MathUtils.damp(actor.x, actor.targetX, 12, dt);
      actor.y = THREE.MathUtils.damp(actor.y, actor.targetY, 12, dt);
      actor.z = THREE.MathUtils.damp(actor.z, actor.targetZ, 12, dt);

      let diff = actor.targetYaw - actor.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      actor.yaw += diff * Math.min(1, 12 * dt);

      if (actor.moving) {
        actor.walkPhase += dt;
      }
      actor.rig.group.position.set(actor.x, actor.y, actor.z);
      actor.rig.group.rotation.y = actor.yaw;
      this.animateExplorer(actor.rig, actor.walkPhase, actor.moving, actor.grounded);
    }

    // 4. Update 3D confetti particles & floating forest atmosphere
    this.particles.update(dt);
    this.atmosphere.update(dt, elapsed);

    // 5. Emit throttled radar snapshot (~10 Hz) for GameHUD mini-map
    if (
      this.callbacks.onRadarUpdate &&
      (this.currentPhase === 'Playing' || this.currentPhase === 'Spectator') &&
      elapsed - this.lastRadarSendTime >= 0.095
    ) {
      this.lastRadarSendTime = elapsed;
      this.emitRadarSnapshot();
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    if (!sync) {
      this.frameId = window.setTimeout(cb, 32);
      return;
    }
    let polls = 0;
    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      polls++;
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED && polls < 10) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 32);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);

    this.particles.dispose();
    this.atmosphere.dispose();
    this.shadowTex.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
