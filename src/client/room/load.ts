// Loading the 3D code, and deciding whether to. Kept apart from Room.tsx so that asking the
// question does not pull three.js into the first download.

/** The 3D room, as a separate chunk. Called early, while the player reads the briefing. */
export const loadRoom = () => import("./Room.js");

let supported: boolean | undefined;

/** Whether this browser can draw the room at all. Asked once; the test context is released. */
export function canDrawRoom(): boolean {
  if (supported !== undefined) return supported;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    supported = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}

export type View = "room" | "flat";

const VIEW_KEY = "brownout.view";

/** The view the player last chose in this tab, if any. */
export function savedView(): View | null {
  try {
    const value = window.sessionStorage.getItem(VIEW_KEY);
    return value === "room" || value === "flat" ? value : null;
  } catch {
    return null;
  }
}

export function saveView(view: View): void {
  try {
    window.sessionStorage.setItem(VIEW_KEY, view);
  } catch {
    // storage can be blocked; the choice then lasts until the page is left
  }
}
