// The 3D war room: a card-stock model of an operations room. Everything is built here from
// boxes, planes and circles; no model files are loaded (DL-20). This file is a separate chunk
// that loads while the player reads the briefing.
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { RoomSignals } from "../signals/room.js";
import { brightnessAt, brightnessOf, FADE_MS } from "./light.js";
import { paceStep, startPace, type FrameCost } from "./meter.js";
import { ease, fieldOfView, mix, MOVE_MS, stationOf, type StationId } from "./stations.js";
import {
  BOARD_SIZE,
  CLOCK_SIZE,
  drawBoard,
  drawClock,
  drawLogbook,
  drawMonitor,
  drawPhone,
  drawTelevision,
  LOGBOOK_SIZE,
  MONITOR_SIZE,
  PALETTE,
  PHONE_SIZE,
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
}: {
  station: StationId;
  steady: boolean;
  compact: boolean;
}) {
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
  const fade = useRef({ from: brightnessOf(level), to: brightnessOf(level), start: -Infinity });

  useLayoutEffect(() => {
    const current = fade.current;
    const now = performance.now();
    const at = brightnessAt(current.from, current.to, now - current.start);
    fade.current = { from: at, to: brightnessOf(level), start: steady ? -Infinity : now };
    invalidate();
  }, [level, steady, invalidate]);

  useFrame(() => {
    const { from, to, start } = fade.current;
    const elapsed = performance.now() - start;
    const b = brightnessAt(from, to, elapsed, steady);
    if (ambient.current) ambient.current.intensity = 2.25 * b;
    if (ceiling.current) ceiling.current.intensity = 1.5 * b;
    if (elapsed < FADE_MS) invalidate();
  });

  return (
    <>
      <ambientLight ref={ambient} color="#fff4e2" />
      <directionalLight ref={ceiling} color="#fff4e2" position={[1.5, 6, 3.5]} />
      {/* The emergency strip throws a low amber light across the room. */}
      <pointLight
        color="#c8651b"
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
        <meshToonMaterial color={PALETTE.paper2} gradientMap={tones} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, BACK]}>
        <planeGeometry args={[ROOM.width, ROOM.height]} />
        <meshToonMaterial color={PALETTE.paper0} gradientMap={tones} />
      </mesh>
      <mesh position={[-half, ROOM.height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshToonMaterial color={PALETTE.paper1} gradientMap={tones} />
      </mesh>
      <mesh position={[half, ROOM.height / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM.depth, ROOM.height]} />
        <meshToonMaterial color={PALETTE.paper1} gradientMap={tones} />
      </mesh>
      <mesh position={[0, ROOM.height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshToonMaterial color={PALETTE.paper1} gradientMap={tones} />
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
}: {
  level: 0 | 1 | 2;
  strip: boolean;
  tones: THREE.DataTexture;
}) {
  const glow = useMemo(() => {
    const b = brightnessOf(level);
    return new THREE.Color("#fff6e6").multiplyScalar(0.35 + 0.65 * b);
  }, [level]);
  return (
    <group>
      {[-2.3, 2.3].map((x) => (
        <group key={x} position={[x, ROOM.height - 0.04, -1.7]}>
          <Block
            size={[2.2, 0.06, 1.1]}
            position={[0, 0, 0]}
            colour={PALETTE.paper2}
            tones={tones}
          />
          <mesh position={[0, -0.035, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.0, 0.9]} />
            <meshBasicMaterial color={glow} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group position={[0, ROOM.height - 0.05, BACK + 0.5]}>
        <Block size={[5.2, 0.07, 0.14]} position={[0, 0, 0]} colour={PALETTE.ink2} tones={tones} />
        <mesh position={[0, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.0, 0.09]} />
          <meshBasicMaterial color={strip ? "#d9731f" : PALETTE.ink2} toneMapped={false} />
        </mesh>
      </group>
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
      <Rig station={station} steady={steady} compact={compact} />
      <Lights level={signals.level} strip={signals.emergencyStrip} steady={steady} />
      <Meter onFrame={onFrame} onSlow={onSlow} />
      <Shell tones={tones} />
      <Ceiling level={signals.level} strip={signals.emergencyStrip} tones={tones} />

      {/* Wall board */}
      <group position={[-1.9, 1.78, BACK]}>
        <Block
          size={[3.56, 1.86, 0.08]}
          position={[0, 0, 0.04]}
          colour={PALETTE.ink2}
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
        <mesh position={[0.92, -0.69, 0.06]}>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color={lamp(signals.tv.waiting)} toneMapped={false} />
        </mesh>
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
        <Block
          size={[1.7, 0.06, 0.9]}
          position={[0, 0.74, 0]}
          colour={PALETTE.paper1}
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
          colour={PALETTE.paper1}
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
        <group position={[1.25, 0.79, 0.12]} rotation={[0, -0.25, 0]}>
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
          <mesh position={[0, 0.03, -0.26]}>
            <sphereGeometry args={[0.022, 12, 8]} />
            <meshBasicMaterial color={lamp(signals.phone)} toneMapped={false} />
          </mesh>
          <Target
            size={[0.24 * grow * 1.6, 0.3, 0.42 * grow * 1.3]}
            position={[0, 0.1, 0]}
            onGo={() => onStation("inbox")}
            onHover={hover("inbox")}
          />
        </group>
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
      frameloop="demand"
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
