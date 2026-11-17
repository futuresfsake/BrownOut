// The 3D war room: a card-stock model of an operations room. Everything is built here from
// boxes, planes and circles; no model files are loaded (DL-20). This file is a separate chunk
// that loads while the player reads the briefing.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import * as THREE from "three";
import type { RoomSignals } from "../signals/room.js";
import { brightnessAt, brightnessOf, FADE_MS, flickerAt } from "./light.js";
import { paceStep, startPace, type FrameCost } from "./meter.js";
import { ease, fieldOfView, mix, MOVE_MS, stationOf, type StationId } from "./stations.js";
import {
  BOARD_SIZE,
  CLOCK_SIZE,
  BUBBLE_SIZE,
  drawBoard,
  drawBubble,
  drawClock,
  drawLogbook,
  drawMonitor,
  drawTag,
  drawPhone,
  drawTelevision,
  LOGBOOK_SIZE,
  MONITOR_SIZE,
  PALETTE,
  PHONE_SIZE,
  TAG_SIZE,
  TEXTURE_FONTS,
  TV_SIZE,
} from "./textures.js";

export interface RoomProps {
  signals: RoomSignals;
  station: StationId;
  /** The station whose HTML button has keyboard focus, so its object can be outlined. */
  focused: StationId | null;
  /** Reduced motion: camera moves are cuts, light changes are instant, no parallax. */
  steady: boolean;
  /** Phones: fewer pixels, no parallax, larger hit areas. */
  compact: boolean;
  onStation: (id: StationId) => void;
  /** The graphics context was lost and did not come back. */
  onLost: () => void;
  /** Frames have stayed under 24 a second for five seconds of drawing. */
  onSlow: () => void;
  /** Called on each frame with the running count and what the last frame cost to draw. */
  onFrame: (count: number, cost: FrameCost) => void;
  onReady: () => void;
}

type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Materials and shared pieces

/** Three tone steps, for the flat-toned look of card. */
function useToneSteps(): THREE.DataTexture {
  return useMemo(() => {
    const steps = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    const texture = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  }, []);
}

interface BlockProps {
  size: Vec3;
  position: Vec3;
  colour: string;
  tones: THREE.DataTexture;
  rotation?: Vec3;
  /** A heavier outline: hovered, focused by keyboard, or the object at the current station. */
  marked?: boolean;
  edges?: boolean;
}

/** How far the rim of a hovered or focused object stands out from it, in metres. */
const RIM = 0.04;

/** A card box with inked edges. */
function Block({ size, position, colour, tones, rotation, marked, edges = true }: BlockProps) {
  const [w, h, d] = size;
  const geometry = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  const outline = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  useEffect(
    () => () => {
      geometry.dispose();
      outline.dispose();
    },
    [geometry, outline],
  );
  return (
    <group position={position} {...(rotation ? { rotation } : {})}>
      <mesh geometry={geometry}>
        <meshToonMaterial color={colour} gradientMap={tones} />
      </mesh>
      {edges && (
        <lineSegments geometry={outline}>
          <lineBasicMaterial color={PALETTE.ink} />
        </lineSegments>
      )}
      {marked && (
        // A rim: a slightly larger box drawn inside out, so only its edge shows round the object.
        <mesh>
          <boxGeometry args={[w + RIM * 2, h + RIM * 2, d + RIM * 2]} />
          <meshBasicMaterial color={PALETTE.signal} side={THREE.BackSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** A texture drawn on a 2D canvas, redrawn when what it shows changes. */
function useDrawn(
  size: readonly [number, number],
  draw: (ctx: CanvasRenderingContext2D) => void,
  key: string,
  fontsReady: boolean,
): THREE.CanvasTexture {
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = size[0];
    canvas.height = size[1];
    const made = new THREE.CanvasTexture(canvas);
    made.colorSpace = THREE.SRGBColorSpace;
    made.anisotropy = 4;
    return made;
  }, [size]);
  useEffect(() => () => texture.dispose(), [texture]);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useLayoutEffect(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    drawRef.current(ctx);
    texture.needsUpdate = true;
    invalidate();
  }, [texture, key, fontsReady, invalidate]);
  return texture;
}

/** A flat, self-lit face: a screen, the wall board, a page. It keeps its brightness as the room dims. */
function Face({
  size,
  position,
  rotation,
  texture,
}: {
  size: [number, number];
  position: Vec3;
  rotation?: Vec3;
  texture: THREE.Texture;
}) {
  return (
    <mesh position={position} {...(rotation ? { rotation } : {})}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** An invisible box that takes the click or tap for an object, larger than the object on phones. */
function Target({
  size,
  position,
  onGo,
  onHover,
}: {
  size: Vec3;
  position: Vec3;
  onGo: () => void;
  onHover: (over: boolean) => void;
}) {
  return (
    <mesh
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onGo();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------------------------
// Camera and light

function Rig({
  station,
  steady,
  compact,
  jolt,
}: {
  station: StationId;
  steady: boolean;
  compact: boolean;
  /** Changes whenever something happens that should shake the room. */
  jolt: number;
}) {
  const joltedAt = useRef(-Infinity);
  const lastJolt = useRef(jolt);
  useLayoutEffect(() => {
    if (jolt > lastJolt.current) joltedAt.current = performance.now();
    lastJolt.current = jolt;
  }, [jolt]);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const pointer = useThree((s) => s.pointer);
  const invalidate = useThree((s) => s.invalidate);
  const move = useRef({ from: stationOf(station), to: stationOf(station), start: -Infinity });
  const look = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    camera.fov = fieldOfView(size.width / Math.max(size.height, 1));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);

  useLayoutEffect(() => {
    const now = performance.now();
    move.current = {
      from: move.current.to,
      to: stationOf(station),
      start: steady ? -Infinity : now,
    };
    invalidate();
  }, [station, steady, invalidate]);

  // The lean follows the pointer, so a pointer move at the desk is a reason to draw a frame.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (station !== "desk" || steady || compact) return;
    const canvas = gl.domElement;
    const moved = () => invalidate();
    canvas.addEventListener("pointermove", moved);
    return () => canvas.removeEventListener("pointermove", moved);
  }, [gl, station, steady, compact, invalidate]);

  useFrame(() => {
    const { from, to, start } = move.current;
    const t = Math.min(1, (performance.now() - start) / MOVE_MS);
    const k = ease(t);
    const position = mix(from.position, to.position, k);
    const target = mix(from.target, to.target, k);
    // At the desk the view leans with the pointer by at most two degrees, for depth.
    if (to.id === "desk" && t >= 1 && !steady && !compact) {
      target[0] += pointer.x * 0.24;
      target[1] += pointer.y * 0.12;
    }
    // Never quite still: the view drifts a little, as a head does.
    if (t >= 1 && !steady && !compact) {
      const now = performance.now();
      position[0] += Math.sin(now / 4300) * 0.025;
      position[1] += Math.sin(now / 3100 + 1) * 0.012;
      // A jolt: the room shakes for most of a second and settles.
      const shake = Math.max(0, 1 - (now - joltedAt.current) / 800);
      position[0] += (Math.sin(now / 17) + Math.sin(now / 31)) * 0.025 * shake;
      position[1] += Math.sin(now / 23) * 0.02 * shake;
    }
    camera.position.set(position[0], position[1], position[2]);
    look.current.set(target[0], target[1], target[2]);
    camera.lookAt(look.current);
    if (t < 1) invalidate();
  });
  return null;
}

function Lights({ level, strip, steady }: { level: 0 | 1 | 2; strip: boolean; steady: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const ambient = useRef<THREE.AmbientLight>(null);
  const ceiling = useRef<THREE.DirectionalLight>(null);
  const amber = useRef<THREE.PointLight>(null);
  const fade = useRef({ from: brightnessOf(level), to: brightnessOf(level), start: -Infinity });

  useLayoutEffect(() => {
    const current = fade.current;
    const now = performance.now();
    const at = brightnessAt(current.from, current.to, now - current.start);
    fade.current = { from: at, to: brightnessOf(level), start: steady ? -Infinity : now };
    invalidate();
  }, [level, steady, invalidate]);

  useFrame((state) => {
    const { from, to, start } = fade.current;
    const elapsed = performance.now() - start;
    const hum = steady ? 1 : flickerAt(state.clock.elapsedTime, level);
    const b = brightnessAt(from, to, elapsed, steady) * hum;
    if (amber.current) {
      const breath = steady ? 1 : 0.82 + 0.18 * Math.sin(state.clock.elapsedTime * 3);
      amber.current.intensity = strip ? 2.6 * breath : 0;
    }
    if (ambient.current) ambient.current.intensity = 2.25 * b;
    if (ceiling.current) ceiling.current.intensity = 1.5 * b;
    if (elapsed < FADE_MS) invalidate();
  });

  return (
    <>
      <ambientLight ref={ambient} color="#e6f5f3" />
      <directionalLight ref={ceiling} color="#e6f5f3" position={[1.5, 6, 3.5]} />
      {/* The emergency strip throws a low amber light across the room. */}
      <pointLight
        ref={amber}
        color="#e0701a"
        position={[0, 2.85, BACK + 0.9]}
        intensity={strip ? 2.4 : 0}
        distance={7}
        decay={1.6}
      />
    </>
  );
}

/** Counts frames, and notices when drawing is slow. Draws nothing itself. */
function Meter({
  onFrame,
  onSlow,
}: {
  onFrame: (n: number, cost: FrameCost) => void;
  onSlow: () => void;
}) {
  const count = useRef(0);
  const pace = useRef(startPace());
  useFrame(({ gl }) => {
    count.current += 1;
    // This runs before the frame is drawn, so the renderer still holds the cost of the last one.
    onFrame(count.current, { calls: gl.info.render.calls, triangles: gl.info.render.triangles });
    const step = paceStep(pace.current, performance.now());
    pace.current = step.pace;
    if (step.tell) onSlow();
  });
  return null;
}

// ---------------------------------------------------------------------------------------------
// The room

const ROOM = { width: 10, depth: 7.4, height: 3.2 } as const;
const BACK = -ROOM.depth / 2;

function Shell({ tones }: { tones: THREE.DataTexture }) {
  const seams = useMemo(() => {
    const points: number[] = [];
    // Floor seams, front to back, like sheets of card laid side by side.
    for (let x = -4; x <= 4; x += 2) points.push(x, 0.002, BACK, x, 0.002, -BACK);
    // One seam along the back wall at dado height.
    points.push(-ROOM.width / 2, 1.0, BACK + 0.002, ROOM.width / 2, 1.0, BACK + 0.002);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);
  useEffect(() => () => seams.dispose(), [seams]);
  const half = ROOM.width / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshToonMaterial color={PALETTE.floor} gradientMap={tones} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, BACK]}>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshToonMaterial color={PALETTE.wall} gradientMap={tones} />
      </mesh>
      <mesh position={[-half, ROOM.height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshToonMaterial color={PALETTE.wallSide} gradientMap={tones} />
      </mesh>
      <mesh position={[half, ROOM.height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshToonMaterial color={PALETTE.wallSide} gradientMap={tones} />
      </mesh>
      <mesh position={[0, ROOM.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshToonMaterial color={PALETTE.ceiling} gradientMap={tones} />
      </mesh>
      <lineSegments geometry={seams}>
        <lineBasicMaterial color={PALETTE.rule} />
      </lineSegments>
    </group>
  );
}

/** A flat dark shape under furniture, as on a card model. Not a real shadow. */
function ContactShadow({ size, position }: { size: [number, number]; position: Vec3 }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={PALETTE.ink} transparent opacity={0.16} depthWrite={false} />
    </mesh>
  );
}

function Ceiling({
  level,
  strip,
  tones,
  steady,
}: {
  level: 0 | 1 | 2;
  strip: boolean;
  tones: THREE.DataTexture;
  steady: boolean;
}) {
  const panels = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const stripMat = useRef<THREE.MeshBasicMaterial>(null);
  const tube = useMemo(() => new THREE.Color("#f4fbf6"), []);
  const low = useMemo(() => new THREE.Color("#7a3d10"), []);
  const high = useMemo(() => new THREE.Color("#ff9a2e"), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const b = brightnessOf(level) * (steady ? 1 : flickerAt(t, level));
    for (const m of panels.current) m?.color.copy(tube).multiplyScalar(0.3 + 0.7 * b);
    if (stripMat.current) {
      if (strip) {
        stripMat.current.color.copy(low).lerp(high, steady ? 1 : 0.5 + 0.5 * Math.sin(t * 3));
      } else {
        stripMat.current.color.set(PALETTE.ink2);
      }
    }
  });
  return (
    <group>
      {[-2.3, 2.3].map((x, n) => (
        <group key={x} position={[x, ROOM.height - 0.04, -1.7]}>
          <Block
            size={[2.2, 0.06, 1.1]}
            position={[0, 0, 0]}
            colour={PALETTE.paper2}
            tones={tones}
          />
          <mesh position={[0, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.0, 0.9]} />
            <meshBasicMaterial
              ref={(m) => {
                panels.current[n] = m;
              }}
              color="#f4fbf6"
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <group position={[0, ROOM.height - 0.05, BACK + 0.5]}>
        <Block size={[5.2, 0.07, 0.14]} position={[0, 0, 0]} colour={PALETTE.ink2} tones={tones} />
        <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.0, 0.09]} />
          <meshBasicMaterial ref={stripMat} color={PALETTE.ink2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** The red second hand. It sweeps while the incident clock runs and stops when it stops. */
function SecondHand({ running, steady }: { running: boolean; steady: boolean }) {
  const arm = useRef<THREE.Group>(null);
  const angle = useRef(0);
  useFrame((_, delta) => {
    if (steady) return;
    if (running) angle.current -= Math.min(delta, 0.1) * ((Math.PI * 2) / 10);
    if (arm.current) arm.current.rotation.z = angle.current;
  });
  return (
    <group ref={arm} position={[0, 0.0925, 0.045]}>
      <mesh position={[0, 0.13, 0]}>
        <planeGeometry args={[0.014, 0.34]} />
        <meshBasicMaterial color={PALETTE.signal} toneMapped={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.024, 16]} />
        <meshBasicMaterial color={PALETTE.signal} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Dust turning slowly in the light. Start positions come from a formula, so they never vary. */
function Dust({ steady }: { steady: boolean }) {
  const COUNT = 90;
  const geometry = useMemo(() => {
    const unit = (i: number, k: number) => {
      const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const points = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      points[i * 3] = (unit(i, 1) - 0.5) * 8;
      points[i * 3 + 1] = 0.3 + unit(i, 2) * 2.7;
      points[i * 3 + 2] = BACK + 0.4 + unit(i, 3) * (ROOM.depth - 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((state, delta) => {
    if (steady) return;
    const p = geometry.getAttribute("position") as THREE.BufferAttribute;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.1);
    for (let i = 0; i < COUNT; i++) {
      let y = p.getY(i) + dt * (0.03 + (i % 7) * 0.012);
      if (y > 3) y = 0.3;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.4 + i) * dt * 0.05);
    }
    p.needsUpdate = true;
  });
  if (steady) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial
        color="#f4fbf6"
        size={0.035}
        transparent
        opacity={0.5}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/** A lamp that breathes while it asks for you: slowly when waiting, quickly when overdue. */
function Pulse({
  state,
  steady,
  position,
  children,
}: {
  state: "off" | "on" | "overdue";
  steady: boolean;
  position: Vec3;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const rate = state === "overdue" ? 9 : 5;
    const k = state === "off" || steady ? 1 : 1 + 0.4 * Math.sin(s.clock.elapsedTime * rate);
    ref.current.scale.setScalar(k);
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

/** Shakes its contents in a short burst every few seconds while active, like a phone on a desk. */
function Buzz({
  active,
  steady,
  position,
  rotation,
  children,
}: {
  active: boolean;
  steady: boolean;
  position: Vec3;
  rotation: Vec3;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    const g = ref.current;
    if (!g) return;
    const t = s.clock.elapsedTime;
    const on = active && !steady && t % 2.6 < 0.4;
    g.position.x = position[0] + (on ? Math.sin(t * 80) * 0.004 : 0);
    g.position.z = position[2] + (on ? Math.cos(t * 70) * 0.003 : 0);
    g.rotation.y = rotation[1] + (on ? Math.sin(t * 60) * 0.02 : 0);
  });
  return (
    <group ref={ref} position={position} rotation={rotation}>
      {children}
    </group>
  );
}

/** A faint bar of light that rolls down the television, as on a screen left on for hours. */
function Scan({ on, steady }: { on: boolean; steady: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (ref.current) ref.current.position.y = 0.58 - ((s.clock.elapsedTime % 3.4) / 3.4) * 1.16;
  });
  if (!on || steady) return null;
  return (
    <mesh ref={ref} position={[0, 0, 0.11]}>
      <planeGeometry args={[2.0, 0.07]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.1}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Mika Tan, the engineer on shift: a card-stock figure at the far desk. Mika reacts to what
 * happens in the room: looks up when you send something, types and says "On it." while a task
 * runs, stands and waves with "Done." when it finishes, and answers when clicked. All of it is
 * drawn from signals the room already has; none of it changes the game.
 */
const SKIN = "#c98f6a";

type MikaMode = "idle" | "heard" | "working" | "report";

function Mika({
  working,
  entries,
  steady,
  fontsReady,
  tones,
  level,
}: {
  level: 0 | 1 | 2;
  working: boolean;
  entries: number;
  steady: boolean;
  fontsReady: boolean;
  tones: THREE.DataTexture;
}) {
  const gl = useThree((s) => s.gl);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const parts = useFaceParts();
  const bubbleRef = useRef<THREE.Group>(null);
  const bubbleMat = useRef<THREE.MeshBasicMaterial>(null);
  const events = useRef({ heard: -99, reported: -99, started: -99, bubble: -99 });
  const wasWorking = useRef(working);
  const lastEntries = useRef(entries);
  const [text, setText] = useState("");

  const say = (words: string) => {
    events.current.bubble = performance.now() / 1000;
    setText(words);
  };

  useEffect(() => {
    const now = performance.now() / 1000;
    if (working && !wasWorking.current) {
      events.current.started = now;
      say("On it.");
    }
    if (!working && wasWorking.current) {
      events.current.reported = now;
      say("Done.");
    }
    wasWorking.current = working;
  }, [working]);

  useEffect(() => {
    // Anything you send or do makes Mika look up.
    if (entries !== lastEntries.current) events.current.heard = performance.now() / 1000;
    lastEntries.current = entries;
  }, [entries]);

  const bubble = useDrawn(BUBBLE_SIZE, (ctx) => drawBubble(ctx, text), text, fontsReady);

  useFrame(() => {
    if (steady) return;
    const now = performance.now() / 1000;
    const e = events.current;
    const sinceReport = now - e.reported;
    const sinceHeard = now - e.heard;
    const mode: MikaMode =
      sinceReport < 3.2 ? "report" : sinceHeard < 1.4 ? "heard" : working ? "working" : "idle";

    // Standing up for a report: eased up and back down.
    const stand = mode === "report" ? Math.sin(Math.min(sinceReport / 3.2, 1) * Math.PI) : 0;
    const lift = Math.min(1, stand * 2.2);
    if (body.current) {
      body.current.position.y = lift * 0.26 + Math.sin(now * 1.6) * 0.004;
      body.current.rotation.z = mode === "idle" ? Math.sin(now * 0.5) * 0.015 : 0;
    }

    const typing = mode === "working";
    const rate = typing ? 17 : 0;
    const bob = (phase: number) => (typing ? Math.sin(now * rate + phase) * 0.09 : 0);
    const rest = mode === "idle" ? Math.sin(now * 1.3) * 0.03 : 0;
    const upper = -0.7 + rest;
    if (armL.current) armL.current.rotation.x = upper + bob(0) * 0.5;
    if (foreL.current) foreL.current.rotation.x = -0.7 + bob(0);
    if (armR.current) {
      armR.current.rotation.x =
        mode === "report" ? -Math.PI * 0.92 * lift + upper * (1 - lift) : upper + bob(1.7) * 0.5;
      armR.current.rotation.z = mode === "report" ? -0.25 * lift : 0;
    }
    if (foreR.current) {
      foreR.current.rotation.x =
        mode === "report" ? -0.2 * lift + -0.7 * (1 - lift) : -0.7 + bob(1.7);
      foreR.current.rotation.z = mode === "report" ? Math.sin(now * 13) * 0.55 * lift : 0;
    }

    if (head.current) {
      let yaw: number;
      let pitch: number;
      if (mode === "idle") {
        // Glances about the room, now and then at the wall board.
        yaw = Math.sin(now * 0.45) * 0.4 + Math.sin(now * 0.17) * 0.2;
        pitch = 0.05 + Math.sin(now * 0.31) * 0.05;
      } else if (mode === "working") {
        yaw = Math.sin(now * 0.9) * 0.08;
        pitch = 0.3 + Math.sin(now * 2.4) * 0.03;
      } else if (mode === "heard") {
        // Looks up at you, with a nod.
        yaw = -0.3;
        pitch = -0.05 + Math.sin(Math.min(sinceHeard, 1) * Math.PI * 2) * 0.16;
      } else {
        yaw = -0.3 + Math.sin(now * 5) * 0.05;
        pitch = -0.08;
      }
      head.current.rotation.y += (yaw - head.current.rotation.y) * 0.12;
      head.current.rotation.x += (pitch - head.current.rotation.x) * 0.12;
    }

    // Mika's nerve goes as the lights do: brows up at level 1, wide-eyed and sweating at 2.
    const talking = now - e.bubble < 1.2;
    setFace(parts, 0, level === 0 ? 0 : level === 1 ? 0.5 : 1, talking ? 0.45 : 0, now);
    if (level === 2 && body.current && mode !== "report") {
      body.current.position.x = Math.sin(now * 38) * 0.004;
    }

    // The speech bubble pops in, stays a moment, and fades.
    const age = now - e.bubble;
    if (bubbleRef.current && bubbleMat.current) {
      const pop = Math.min(1, age / 0.18);
      const out = age > 2.2 ? Math.max(0, 1 - (age - 2.2) / 0.5) : 1;
      bubbleRef.current.visible = text !== "" && age < 2.7;
      bubbleRef.current.scale.setScalar(0.4 + 0.6 * (1 - (1 - pop) * (1 - pop)));
      bubbleMat.current.opacity = out;
      bubbleRef.current.position.y = 1.98 + lift * 0.26 + Math.sin(age * 4) * 0.01;
    }
  });

  const poke = () => {
    events.current.heard = performance.now() / 1000;
    say(
      ["Yes?", "Listening.", "Go ahead.", "Ready."][Math.floor(performance.now() / 1000) % 4] ??
        "Yes?",
    );
  };

  const vest = PALETTE.signal;
  return (
    <group position={[-0.2, 0, -0.78]}>
      {/* Chair */}
      <Block
        size={[0.5, 0.06, 0.5]}
        position={[0, 0.45, 0]}
        colour={PALETTE.ink}
        tones={tones}
        edges={false}
      />
      <Block
        size={[0.5, 0.55, 0.06]}
        position={[0, 0.78, -0.26]}
        colour={PALETTE.ink}
        tones={tones}
        edges={false}
      />
      <Block
        size={[0.06, 0.42, 0.06]}
        position={[0, 0.21, 0]}
        colour={PALETTE.ink}
        tones={tones}
        edges={false}
      />
      <Block
        size={[0.5, 0.04, 0.06]}
        position={[0, 0.02, 0]}
        colour={PALETTE.ink}
        tones={tones}
        edges={false}
      />

      <group ref={body}>
        <Block
          size={[0.44, 0.16, 0.42]}
          position={[0, 0.56, 0.02]}
          colour={PALETTE.ink2}
          tones={tones}
        />
        <Block size={[0.44, 0.56, 0.26]} position={[0, 0.95, 0]} colour={vest} tones={tones} />
        {/* A pale stripe across the vest */}
        <mesh position={[0, 0.9, 0.132]}>
          <planeGeometry args={[0.44, 0.05]} />
          <meshBasicMaterial color={PALETTE.paper0} toneMapped={false} />
        </mesh>

        {/* Arms, hinged at the shoulder and the elbow */}
        {([-1, 1] as const).map((side) => (
          <group
            key={side}
            ref={side < 0 ? armL : armR}
            position={[side * 0.29, 1.17, 0]}
            rotation={[-0.7, 0, 0]}
          >
            <Block size={[0.1, 0.3, 0.1]} position={[0, -0.15, 0]} colour={vest} tones={tones} />
            <group ref={side < 0 ? foreL : foreR} position={[0, -0.3, 0]} rotation={[-0.7, 0, 0]}>
              <Block
                size={[0.09, 0.28, 0.09]}
                position={[0, -0.14, 0]}
                colour={SKIN}
                tones={tones}
              />
            </group>
          </group>
        ))}

        <group ref={head} position={[0, 1.4, 0]}>
          <Block size={[0.27, 0.29, 0.27]} position={[0, 0, 0]} colour={SKIN} tones={tones} />
          <Hair style={1} colour={PALETTE.ink} tones={tones} />
          {/* Headset band and microphone */}
          <Block
            size={[0.31, 0.03, 0.04]}
            position={[0, 0.1, 0]}
            colour={PALETTE.ink2}
            tones={tones}
            edges={false}
          />
          <Block
            size={[0.03, 0.03, 0.14]}
            position={[-0.13, -0.03, 0.12]}
            colour={PALETTE.ink2}
            tones={tones}
            edges={false}
          />
          <Expression parts={parts} tones={tones} />
        </group>
      </group>

      <group ref={bubbleRef} position={[0, 1.98, 0.1]} visible={false}>
        <mesh>
          <planeGeometry args={[0.52, 0.195]} />
          <meshBasicMaterial ref={bubbleMat} map={bubble} transparent toneMapped={false} />
        </mesh>
      </group>

      <Target
        size={[0.7, 1.3, 0.6]}
        position={[0, 1.0, 0]}
        onGo={poke}
        onHover={(over) => {
          gl.domElement.style.cursor = over ? "pointer" : "default";
        }}
      />
    </group>
  );
}

/**
 * The people who are waiting for you. One walks in for each unanswered thread (up to three),
 * wearing their own name tag. They fidget and ask "Any news?" while they wait; once they are
 * overdue they go red, glare, shake, stamp, sweat and shout. When the thread is answered
 * they leave. They are the same card-stock figures as Mika.
 */
const SLOTS = [
  { x: 0.75, z: -0.9 },
  { x: 1.3, z: -0.4 },
  { x: 0.1, z: -1.35 },
] as const;
const COATS = ["#d9a62e", "#f4fbf6", "#1f5f6b"] as const;
const SKINS = ["#8d5a3b", "#e0b08a", "#b9784f"] as const;
const HAIRS = ["#1b1210", "#6b3a1e", "#2a2a2e"] as const;
const OFFSTAGE = -5.5;
const CALM_LINES = ["Hello?", "Any news?", "Excuse me?", "Got a minute?", "Anyone there?"] as const;
const ANGRY_LINES = [
  "ANSWER!",
  "How long?!",
  "WAITING!",
  "Hurry up!",
  "Well?!",
  "Seriously?!",
] as const;

interface FaceParts {
  browL: RefObject<THREE.Mesh | null>;
  browR: RefObject<THREE.Mesh | null>;
  mouth: RefObject<THREE.Mesh | null>;
  flush: RefObject<THREE.MeshBasicMaterial | null>;
  sweat: RefObject<THREE.Mesh | null>;
}

/** Eyes with whites, brows that can frown or worry, a mouth that opens, a flush and a sweat drop. */
function Expression({ parts, tones }: { parts: FaceParts; tones: THREE.DataTexture }) {
  return (
    <>
      {[-0.065, 0.065].map((x) => (
        <group key={x} position={[x, 0.025, 0.137]}>
          <mesh>
            <planeGeometry args={[0.06, 0.055]} />
            <meshBasicMaterial color={PALETTE.paper0} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[0.032, 0.04]} />
            <meshBasicMaterial color={PALETTE.ink} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh ref={parts.browL} position={[-0.065, 0.075, 0.139]}>
        <planeGeometry args={[0.08, 0.018]} />
        <meshBasicMaterial color={PALETTE.ink} toneMapped={false} />
      </mesh>
      <mesh ref={parts.browR} position={[0.065, 0.075, 0.139]}>
        <planeGeometry args={[0.08, 0.018]} />
        <meshBasicMaterial color={PALETTE.ink} toneMapped={false} />
      </mesh>
      {/* A flush across the cheeks when they lose patience */}
      <mesh position={[0, -0.035, 0.1375]}>
        <planeGeometry args={[0.2, 0.05]} />
        <meshBasicMaterial
          ref={parts.flush}
          color="#d6361c"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={parts.mouth} position={[0, -0.075, 0.139]}>
        <planeGeometry args={[0.075, 0.022]} />
        <meshBasicMaterial color="#3a0d0a" toneMapped={false} />
      </mesh>
      <mesh ref={parts.sweat} position={[0.15, 0.08, 0.1]} visible={false}>
        <planeGeometry args={[0.04, 0.06]} />
        <meshBasicMaterial color="#8fd3ee" toneMapped={false} />
      </mesh>
      {/* Ears */}
      {[-1, 1].map((side) => (
        <Block
          key={side}
          size={[0.03, 0.07, 0.05]}
          position={[side * 0.15, 0, 0]}
          colour="#b57c58"
          tones={tones}
          edges={false}
        />
      ))}
    </>
  );
}

function useFaceParts(): FaceParts {
  return {
    browL: useRef<THREE.Mesh>(null),
    browR: useRef<THREE.Mesh>(null),
    mouth: useRef<THREE.Mesh>(null),
    flush: useRef<THREE.MeshBasicMaterial>(null),
    sweat: useRef<THREE.Mesh>(null),
  };
}

/** Sets a face for an amount of anger (0 to 1), worry (0 to 1) and how wide the mouth is. */
function setFace(parts: FaceParts, anger: number, worry: number, mouth: number, t: number) {
  const tilt = worry * 0.28 - anger * 0.55;
  const lift = 0.075 - anger * 0.012 + worry * 0.012;
  if (parts.browL.current) {
    parts.browL.current.rotation.z = tilt;
    parts.browL.current.position.y = lift;
  }
  if (parts.browR.current) {
    parts.browR.current.rotation.z = -tilt;
    parts.browR.current.position.y = lift;
  }
  if (parts.mouth.current) {
    parts.mouth.current.scale.set(1 + mouth * 0.25, 1 + mouth * 2.6, 1);
    parts.mouth.current.position.y = -0.075 - mouth * 0.012;
  }
  if (parts.flush.current) parts.flush.current.opacity = anger * (0.55 + Math.sin(t * 6) * 0.15);
  const sweating = anger > 0.5 || worry > 0.6;
  if (parts.sweat.current) {
    parts.sweat.current.visible = sweating;
    parts.sweat.current.position.y = 0.1 - ((t * 0.7) % 1) * 0.2;
  }
}

/** Three hairstyles: a short crop with a fringe, long hair, and a spiky top. */
function Hair({
  style,
  colour,
  tones,
}: {
  style: number;
  colour: string;
  tones: THREE.DataTexture;
}) {
  const piece = (
    size: [number, number, number],
    position: [number, number, number],
    key?: string,
  ) => (
    <Block
      key={key ?? position.join()}
      size={size}
      position={position}
      colour={colour}
      tones={tones}
      edges={false}
    />
  );
  if (style % 3 === 1) {
    return (
      <>
        {piece([0.3, 0.1, 0.3], [0, 0.17, -0.01])}
        {piece([0.3, 0.36, 0.07], [0, -0.04, -0.15])}
        {piece([0.04, 0.3, 0.2], [-0.155, -0.02, -0.04])}
        {piece([0.04, 0.3, 0.2], [0.155, -0.02, -0.04])}
      </>
    );
  }
  if (style % 3 === 2) {
    return (
      <>
        {piece([0.29, 0.06, 0.29], [0, 0.16, -0.01])}
        {piece([0.06, 0.1, 0.06], [-0.09, 0.24, 0])}
        {piece([0.06, 0.12, 0.06], [0, 0.25, 0])}
        {piece([0.06, 0.14, 0.06], [0.09, 0.26, 0])}
      </>
    );
  }
  return (
    <>
      {piece([0.29, 0.1, 0.29], [0, 0.17, -0.01])}
      {piece([0.29, 0.05, 0.05], [0, 0.12, 0.13])}
    </>
  );
}

function Visitor({
  index,
  who,
  steady,
  fontsReady,
  tones,
}: {
  index: number;
  who: RoomSignals["visitors"][number] | undefined;
  steady: boolean;
  fontsReady: boolean;
  tones: THREE.DataTexture;
}) {
  const present = who !== undefined;
  const urgent = who?.overdue ?? false;
  const press = who?.press ?? false;
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const tagRef = useRef<THREE.Group>(null);
  const bubbleRef = useRef<THREE.Group>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const parts = useFaceParts();
  const x = useRef(steady && present ? (SLOTS[index]?.x ?? 0) : OFFSTAGE);
  const lastCycle = useRef(-1);
  const [line, setLine] = useState("");
  const slot = SLOTS[index] ?? SLOTS[0];
  const coat = COATS[index % COATS.length] ?? COATS[0];
  const skin = SKINS[index % SKINS.length] ?? SKINS[0];
  const hair = HAIRS[index % HAIRS.length] ?? HAIRS[0];
  const name = who?.name ?? "";

  const tag = useDrawn(
    TAG_SIZE,
    (ctx) => drawTag(ctx, name, urgent),
    `${name}|${urgent}`,
    fontsReady,
  );
  const bubble = useDrawn(BUBBLE_SIZE, (ctx) => drawBubble(ctx, line), line, fontsReady);

  useFrame((state, delta) => {
    const g = root.current;
    if (!g) return;
    const goal = present ? slot.x : OFFSTAGE;
    const gap = goal - x.current;
    const walking = !steady && Math.abs(gap) > 0.02;
    if (steady) x.current = goal;
    else x.current += Math.sign(gap) * Math.min(Math.abs(gap), Math.min(delta, 0.1) * 1.8);
    g.visible = x.current > OFFSTAGE + 0.3;

    const t = state.clock.elapsedTime + index * 1.7;
    const anger = urgent ? 1 : 0;
    const worry = urgent ? 0 : Math.min(1, 0.35 + (who?.waitingMinutes ?? 0) / 30);
    const agit = urgent ? 1.6 : 0.45;
    const still = walking || steady;

    // Pacing, stamping and (when overdue) trembling with rage.
    const pace = still ? 0 : Math.sin(t * 1.3 * agit) * 0.2 * agit;
    const hop = walking
      ? Math.abs(Math.sin(t * 9)) * 0.05
      : steady
        ? 0
        : urgent
          ? Math.abs(Math.sin(t * 7)) * 0.07
          : Math.abs(Math.sin(t * 4 * agit)) * 0.04 * agit;
    const tremble = urgent && !still ? Math.sin(t * 47) * 0.012 : 0;
    g.position.set(x.current + pace + tremble, hop, slot.z);
    const turn = walking ? (gap > 0 ? 1 : -1) * 1.1 : urgent && !still ? -0.35 : 0;
    g.rotation.y += (turn - g.rotation.y) * 0.2;
    if (tagRef.current) {
      tagRef.current.rotation.y = -g.rotation.y;
      tagRef.current.visible = !walking && present;
    }
    if (bubbleRef.current) bubbleRef.current.rotation.y = -g.rotation.y;

    // They speak up on a beat: now and then while waiting, constantly once overdue.
    const period = urgent ? 2.4 : 6;
    const cycle = Math.floor((t + 3) / period);
    const phase = (t + 3) % period;
    const speaking = !still && present && phase < (urgent ? 1.7 : 1.9);
    if (cycle !== lastCycle.current && speaking) {
      lastCycle.current = cycle;
      const pool = urgent ? ANGRY_LINES : CALM_LINES;
      setLine(pool[(cycle + index * 2) % pool.length] ?? "");
    }
    if (bubbleRef.current) {
      bubbleRef.current.visible = speaking && line !== "";
      const pop = Math.min(1, phase / 0.15);
      bubbleRef.current.scale.setScalar(
        (0.45 + 0.55 * (1 - (1 - pop) * (1 - pop))) * (urgent ? 1 + Math.sin(t * 22) * 0.04 : 1),
      );
    }
    if (ring.current) ring.current.opacity = urgent && !still ? 0.18 + Math.sin(t * 6) * 0.1 : 0;

    const swing = Math.sin(t * 9) * 0.6;
    if (legL.current) legL.current.rotation.x = walking ? swing : 0;
    if (legR.current) legR.current.rotation.x = walking ? -swing : 0;
    if (armL.current && armR.current) {
      if (walking) {
        armL.current.rotation.x = -swing;
        armR.current.rotation.x = swing;
      } else if (steady) {
        armL.current.rotation.x = -0.2;
        armR.current.rotation.x = -0.2;
      } else if (urgent) {
        // One fist raised and shaking, the other jabbing at you.
        armR.current.rotation.x = -Math.PI * 0.85 + Math.sin(t * 12) * 0.35;
        armR.current.rotation.z = -0.2 + Math.sin(t * 17) * 0.12;
        armL.current.rotation.x = -1.35 + Math.sin(t * 8) * 0.4;
      } else {
        // Checking a watch, then a shrug, then a drum of the fingers.
        const beat = Math.floor(t / 3) % 3;
        armL.current.rotation.x =
          beat === 0 ? -1.6 + Math.sin(t * 5) * 0.05 : -0.5 + Math.sin(t * 3) * 0.3;
        armR.current.rotation.x =
          beat === 2 ? -0.9 + Math.sin(t * 4) * 0.4 : -0.3 + Math.sin(t * 2.3 + 1) * 0.3;
        armR.current.rotation.z = 0;
      }
    }
    if (head.current) {
      if (steady) {
        head.current.rotation.set(0, 0, 0);
      } else if (urgent) {
        // Chin out, head snapping toward you with each shout.
        head.current.rotation.y = -0.2 + Math.sin(t * 5) * 0.12;
        head.current.rotation.x = 0.1 + (speaking ? Math.abs(Math.sin(t * 14)) * 0.12 : 0);
        head.current.rotation.z = Math.sin(t * 3) * 0.08;
      } else {
        head.current.rotation.y = Math.sin(t * 0.9) * (walking ? 0 : 0.5 * agit);
        head.current.rotation.x = Math.sin(t * 2.2) * 0.08 * agit;
        head.current.rotation.z = 0;
      }
    }
    const mouth = speaking ? (urgent ? 0.5 + Math.abs(Math.sin(t * 14)) * 0.5 : 0.35) : 0;
    setFace(parts, anger, worry, mouth, t);
  });

  return (
    <group ref={root} visible={false} position={[OFFSTAGE, 0, slot.z]}>
      {/* A red warning ring on the floor under anyone who is overdue */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.46, 24]} />
        <meshBasicMaterial
          ref={ring}
          color="#ff3b1d"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={side < 0 ? legL : legR} position={[side * 0.1, 0.8, 0]}>
          <Block
            size={[0.15, 0.8, 0.17]}
            position={[0, -0.4, 0]}
            colour={PALETTE.ink2}
            tones={tones}
          />
          <Block
            size={[0.17, 0.08, 0.28]}
            position={[0, -0.76, 0.05]}
            colour={PALETTE.ink}
            tones={tones}
            edges={false}
          />
        </group>
      ))}
      <Block size={[0.44, 0.58, 0.26]} position={[0, 1.09, 0]} colour={coat} tones={tones} />
      {/* A tie or lanyard, so each one reads differently from the front */}
      <mesh position={[0, 1.07, 0.133]}>
        <planeGeometry args={[index === 1 ? 0.06 : 0.04, 0.4]} />
        <meshBasicMaterial color={index === 0 ? PALETTE.signal : PALETTE.ink} toneMapped={false} />
      </mesh>
      {([-1, 1] as const).map((side) => (
        <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.29, 1.33, 0]}>
          <Block size={[0.1, 0.5, 0.1]} position={[0, -0.25, 0]} colour={coat} tones={tones} />
          <Block
            size={[0.11, 0.11, 0.11]}
            position={[0, -0.55, 0]}
            colour={skin}
            tones={tones}
            edges={false}
          />
          {press && side > 0 && (
            // Reporters carry a notepad.
            <Block
              size={[0.16, 0.2, 0.02]}
              position={[0, -0.6, 0.08]}
              colour={PALETTE.paper0}
              tones={tones}
            />
          )}
        </group>
      ))}
      <Block
        size={[0.1, 0.06, 0.1]}
        position={[0, 1.4, 0]}
        colour={skin}
        tones={tones}
        edges={false}
      />
      <group ref={head} position={[0, 1.59, 0]}>
        <Block size={[0.27, 0.29, 0.27]} position={[0, 0, 0]} colour={skin} tones={tones} />
        <Hair style={index} colour={hair} tones={tones} />
        <Expression parts={parts} tones={tones} />
      </group>

      <group ref={tagRef} position={[0, 1.95, 0]} visible={false}>
        <mesh>
          <planeGeometry args={[0.46, 0.115]} />
          <meshBasicMaterial map={tag} transparent toneMapped={false} />
        </mesh>
      </group>
      <group ref={bubbleRef} position={[0, 2.2, 0.1]} visible={false}>
        <mesh>
          <planeGeometry args={[0.62, 0.232]} />
          <meshBasicMaterial map={bubble} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** A rotating red beacon on the back wall for when the room has browned out. It sweeps; it does not flash. */
function Beacon({ steady }: { steady: boolean }) {
  const sweep = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (sweep.current && !steady) sweep.current.rotation.z = -t * 2.6;
    if (glow.current)
      glow.current.intensity = steady ? 1.2 : 0.4 + 1.6 * (0.5 + 0.5 * Math.sin(t * 2.6));
  });
  return (
    <group position={[4.35, 2.55, BACK + 0.12]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.17, 0.12, 14]} />
        <meshBasicMaterial color={PALETTE.ink} />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.11, 14, 10]} />
        <meshBasicMaterial color="#ff3b1d" toneMapped={false} />
      </mesh>
      <group ref={sweep} position={[0, 0, 0.02]}>
        <mesh>
          <circleGeometry args={[1.7, 24, -0.22, 0.44]} />
          <meshBasicMaterial
            color="#ff3b1d"
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI]}>
          <circleGeometry args={[1.7, 24, -0.22, 0.44]} />
          <meshBasicMaterial
            color="#ff3b1d"
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      <pointLight
        ref={glow}
        color="#ff3b1d"
        position={[0, 0, 0.6]}
        distance={6}
        decay={1.6}
        intensity={1.2}
      />
    </group>
  );
}

interface SceneProps extends Omit<RoomProps, "onLost" | "onReady"> {
  fontsReady: boolean;
}

function Scene({
  signals,
  station,
  focused,
  steady,
  compact,
  onStation,
  onSlow,
  onFrame,
  fontsReady,
}: SceneProps) {
  const tones = useToneSteps();
  useEffect(() => () => tones.dispose(), [tones]);
  const gl = useThree((s) => s.gl);
  const [hovered, setHovered] = useState<StationId | null>(null);

  useEffect(() => {
    gl.domElement.style.cursor = hovered ? "pointer" : "default";
  }, [gl, hovered]);

  // The object you are already looking at needs no rim; one you point at or tab to does.
  const marked = (id: StationId) => station !== id && (hovered === id || focused === id);
  const hover = (id: StationId) => (over: boolean) =>
    setHovered((current) => (over ? id : current === id ? null : current));
  // Phones get hit areas well beyond the object.
  const grow = compact ? 1.5 : 1.12;

  const board = useDrawn(
    BOARD_SIZE,
    (ctx) => drawBoard(ctx, signals.board, signals.level),
    JSON.stringify([signals.board, signals.level]),
    fontsReady,
  );
  const clock = useDrawn(
    CLOCK_SIZE,
    (ctx) => drawClock(ctx, signals.clock),
    JSON.stringify(signals.clock),
    fontsReady,
  );
  const television = useDrawn(
    TV_SIZE,
    (ctx) => drawTelevision(ctx, signals.tv),
    JSON.stringify(signals.tv),
    fontsReady,
  );
  const monitor = useDrawn(
    MONITOR_SIZE,
    (ctx) => drawMonitor(ctx, signals.monitorCount),
    String(signals.monitorCount),
    fontsReady,
  );
  const phone = useDrawn(
    PHONE_SIZE,
    (ctx) => drawPhone(ctx, signals.phone, signals.phoneFrom),
    `${signals.phone}|${signals.phoneFrom ?? ""}`,
    fontsReady,
  );
  const logbook = useDrawn(
    LOGBOOK_SIZE,
    (ctx) => drawLogbook(ctx, signals.logLines),
    String(signals.logLines),
    fontsReady,
  );

  const lamp = (state: "off" | "on" | "overdue") =>
    state === "off" ? PALETTE.ink2 : state === "overdue" ? "#e2600f" : "#c8651b";

  return (
    <>
      <Rig
        station={station}
        steady={steady}
        compact={compact}
        jolt={signals.level * 10 + Math.min(signals.monitorCount, 3)}
      />
      <Lights level={signals.level} strip={signals.emergencyStrip} steady={steady} />
      <Meter onFrame={onFrame} onSlow={onSlow} />
      <Shell tones={tones} />
      <Ceiling level={signals.level} strip={signals.emergencyStrip} tones={tones} steady={steady} />
      <Dust steady={steady} />
      {signals.level === 2 && <Beacon steady={steady} />}
      {[0, 1, 2].map((i) => (
        <Visitor
          key={i}
          index={i}
          who={signals.visitors[i]}
          steady={steady}
          fontsReady={fontsReady}
          tones={tones}
        />
      ))}

      {/* Wall board */}
      <group position={[-1.9, 1.78, BACK]}>
        <Block
          size={[3.56, 1.86, 0.08]}
          position={[0, 0, 0.04]}
          colour={PALETTE.signal}
          tones={tones}
          marked={marked("board")}
        />
        <Face size={[3.4, 1.7]} position={[0, 0, 0.085]} texture={board} />
        <Target
          size={[3.56 * grow, 1.86 * grow, 0.3]}
          position={[0, 0, 0.1]}
          onGo={() => onStation("board")}
          onHover={hover("board")}
        />
      </group>

      {/* Wall clock */}
      <group position={[0.42, 2.3, BACK]}>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[0.74, 0.74 * (CLOCK_SIZE[1] / CLOCK_SIZE[0])]} />
          <meshBasicMaterial map={clock} transparent toneMapped={false} />
        </mesh>
        <SecondHand running={signals.clock.running} steady={steady} />
      </group>

      {/* Television */}
      <group position={[2.55, 1.88, BACK]}>
        <Block
          size={[2.14, 1.26, 0.1]}
          position={[0, 0, 0.05]}
          colour={PALETTE.ink}
          tones={tones}
          marked={marked("press")}
        />
        <Face size={[2.0, 1.125]} position={[0, 0, 0.105]} texture={television} />
        <Pulse state={signals.tv.waiting} steady={steady} position={[0.92, -0.69, 0.06]}>
          <mesh>
            <circleGeometry args={[0.035, 16]} />
            <meshBasicMaterial color={lamp(signals.tv.waiting)} toneMapped={false} />
          </mesh>
        </Pulse>
        <Scan on={signals.tv.on} steady={steady} />
        <Target
          size={[2.14 * grow, 1.26 * grow, 0.3]}
          position={[0, 0, 0.1]}
          onGo={() => onStation("press")}
          onHover={hover("press")}
        />
      </group>

      {/* Mika's desk, across the room. People are not modelled: Mika is a lit desk. */}
      <group position={[2.7, 0, -1.6]}>
        <ContactShadow size={[1.9, 1.1]} position={[0, 0.004, 0]} />
        <Mika
          level={signals.level}
          working={signals.mikaLamp}
          entries={signals.logLines}
          steady={steady}
          fontsReady={fontsReady}
          tones={tones}
        />
        <Block
          size={[1.7, 0.06, 0.9]}
          position={[0, 0.74, 0]}
          colour={PALETTE.ochre}
          tones={tones}
        />
        <Block size={[1.6, 0.7, 0.8]} position={[0, 0.36, 0]} colour={PALETTE.ink2} tones={tones} />
        <Block
          size={[0.62, 0.4, 0.04]}
          position={[0.3, 1.02, -0.2]}
          colour={PALETTE.ink}
          tones={tones}
        />
        <Block
          size={[0.08, 0.1, 0.08]}
          position={[0.3, 0.8, -0.2]}
          colour={PALETTE.ink2}
          tones={tones}
          edges={false}
        />
        <mesh position={[0.3, 1.02, -0.178]}>
          <planeGeometry args={[0.56, 0.34]} />
          <meshBasicMaterial
            color={signals.mikaLamp ? PALETTE.paper0 : PALETTE.ink2}
            toneMapped={false}
          />
        </mesh>
        {/* Desk lamp: on while a task runs. */}
        <Block
          size={[0.16, 0.03, 0.16]}
          position={[-0.5, 0.785, 0.1]}
          colour={PALETTE.ink}
          tones={tones}
          edges={false}
        />
        {/* Kept low, so from your desk the shade sits under the television, not across it. */}
        <Block
          size={[0.03, 0.28, 0.03]}
          position={[-0.5, 0.94, 0.1]}
          colour={PALETTE.ink}
          tones={tones}
          edges={false}
        />
        <mesh position={[-0.5, 1.1, 0.1]}>
          <coneGeometry args={[0.15, 0.2, 20, 1, true]} />
          <meshBasicMaterial
            color={signals.mikaLamp ? "#e2892f" : PALETTE.ink2}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        {signals.mikaLamp && (
          <mesh position={[-0.5, 0.775, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.36, 24]} />
            <meshBasicMaterial
              color="#f0c184"
              transparent
              opacity={0.55}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>

      {/* Your desk */}
      <group position={[0, 0, 1.2]}>
        <ContactShadow size={[4.0, 1.3]} position={[0, 0.004, 0]} />
        <Block
          size={[3.8, 0.06, 1.1]}
          position={[0, 0.75, 0]}
          colour={PALETTE.ochre}
          tones={tones}
        />
        <Block
          size={[3.6, 0.72, 0.9]}
          position={[0, 0.36, -0.05]}
          colour={PALETTE.ink2}
          tones={tones}
        />

        {/* Logbook, lying open */}
        <group position={[-1.2, 0.79, 0]}>
          <Block
            size={[0.78, 0.03, 0.56]}
            position={[0, 0, 0]}
            colour={PALETTE.ink}
            tones={tones}
            marked={marked("log")}
          />
          <Face
            size={[0.72, 0.5]}
            position={[0, 0.017, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            texture={logbook}
          />
          <Target
            size={[0.78 * grow, 0.3, 0.56 * grow]}
            position={[0, 0.1, 0]}
            onGo={() => onStation("log")}
            onHover={hover("log")}
          />
        </group>

        {/* Desk monitor */}
        <group position={[0.5, 0.78, -0.3]}>
          <Block
            size={[0.26, 0.02, 0.18]}
            position={[0, 0.01, 0]}
            colour={PALETTE.ink}
            tones={tones}
            edges={false}
          />
          <Block
            size={[0.04, 0.08, 0.04]}
            position={[0, 0.05, 0]}
            colour={PALETTE.ink}
            tones={tones}
            edges={false}
          />
          <Block
            size={[0.6, 0.39, 0.04]}
            position={[0, 0.275, 0]}
            colour={PALETTE.ink}
            tones={tones}
            marked={marked("inbox")}
          />
          <Face size={[0.552, 0.345]} position={[0, 0.275, 0.022]} texture={monitor} />
          <Target
            size={[0.6 * grow, 0.39 * grow, 0.3]}
            position={[0, 0.275, 0.05]}
            onGo={() => onStation("inbox")}
            onHover={hover("inbox")}
          />
        </group>

        {/* Phone, face up, with its lamp */}
        <Buzz
          active={signals.phone !== "off"}
          steady={steady}
          position={[1.25, 0.79, 0.12]}
          rotation={[0, -0.25, 0]}
        >
          <Block
            size={[0.24, 0.025, 0.42]}
            position={[0, 0, 0]}
            colour={PALETTE.ink}
            tones={tones}
            marked={marked("inbox")}
          />
          <Face
            size={[0.2, 0.35]}
            position={[0, 0.014, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            texture={phone}
          />
          <Pulse state={signals.phone} steady={steady} position={[0, 0.03, -0.26]}>
            <mesh>
              <sphereGeometry args={[0.022, 12, 8]} />
              <meshBasicMaterial color={lamp(signals.phone)} toneMapped={false} />
            </mesh>
          </Pulse>
          <Target
            size={[0.24 * grow * 1.6, 0.3, 0.42 * grow * 1.3]}
            position={[0, 0.1, 0]}
            onGo={() => onStation("inbox")}
            onHover={hover("inbox")}
          />
        </Buzz>
      </group>
    </>
  );
}

/** Children of the canvas cannot use the page's hooks for fonts, so this waits out here. */
function useFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all(TEXTURE_FONTS.map((font) => document.fonts.load(font)))
      .catch(() => undefined)
      .then(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

function Lost({ onLost, children }: { onLost: () => void; children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const lost = (e: Event) => {
      e.preventDefault(); // allows the browser to restore it
      timer = window.setTimeout(onLost, 3000);
    };
    const restored = () => window.clearTimeout(timer);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [gl, onLost]);
  return <>{children}</>;
}

export default function Room(props: RoomProps) {
  const { onLost, onReady, ...scene } = props;
  const fontsReady = useFonts();
  const desk = stationOf("desk");
  return (
    <Canvas
      flat
      frameloop={props.steady ? "demand" : "always"}
      dpr={[1, props.compact ? 1.5 : 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 40, near: 0.1, far: 40, position: [...desk.position] }}
      onCreated={({ gl }) => {
        gl.setClearColor(PALETTE.paper2);
        onReady();
      }}
      aria-hidden="true"
    >
      <Lost onLost={onLost}>
        <Scene {...scene} fontsReady={fontsReady} />
      </Lost>
    </Canvas>
  );
}
