// Tiny theme controller. Persists the user's choice in localStorage and
// applies it to the root element. Defaults to awm-dark.

export type Scheme = "awm-dark" | "awm-light";

const STORAGE_KEY = "awm.scheme";

const TRANSITION_CLASS = "scheme-transitioning";
const TRANSITION_MS = 280;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyScheme(scheme: Scheme): void {
  const root = document.documentElement;
  const current = root.dataset.scheme;
  // No-op if already on this scheme — avoids a redundant transition flash.
  if (current === scheme) return;
  // Skip the animation on first paint (when the dataset isn't set yet) so
  // the initial render lands instantly in the user's preferred scheme.
  const animate = Boolean(current);
  if (animate) {
    root.classList.add(TRANSITION_CLASS);
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.classList.remove(TRANSITION_CLASS);
      transitionTimer = null;
    }, TRANSITION_MS + 20);
  }
  root.dataset.scheme = scheme;
}

export function getStoredScheme(): Scheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "awm-light" || v === "awm-dark") return v;
  } catch {
    // SSR / sandboxed contexts — fall through.
  }
  return "awm-dark";
}

export function setStoredScheme(scheme: Scheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    // Best-effort; theme still applies in-session.
  }
  applyScheme(scheme);
}

/** Read the current scheme from the DOM. */
export function currentScheme(): Scheme {
  const v = document.documentElement.dataset.scheme;
  return v === "awm-light" ? "awm-light" : "awm-dark";
}
