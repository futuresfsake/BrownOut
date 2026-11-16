import { useEffect, useRef, type RefObject } from "react";

/**
 * Puts keyboard focus on a screen when it opens. Without this, focus stays on a button that no
 * longer exists and the next Tab starts from wherever the browser guesses. The element needs
 * tabIndex={-1}; it is not a tab stop, so the first Tab lands on the screen's first control.
 */
export function useFocusOnOpen<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
