/** Minimal event bus so panels can request layout/navigation changes without prop-drilling. */
import type { AppMode } from "../store/ui";

// ── Panel focus (used by Custom mode's flexlayout) ───────────────────────────

type FocusPanelListener = (panelId: string) => void;
let focusListener: FocusPanelListener | null = null;

export function onFocusPanel(cb: FocusPanelListener) {
  focusListener = cb;
}

export function focusPanel(panelId: string) {
  focusListener?.(panelId);
}

// ── Mode navigation ───────────────────────────────────────────────────────────

type NavigateModeListener = (mode: AppMode, taskId?: string) => void;
let navigateListener: NavigateModeListener | null = null;

export function onNavigateMode(cb: NavigateModeListener) {
  navigateListener = cb;
}

export function navigateMode(mode: AppMode, taskId?: string) {
  navigateListener?.(mode, taskId);
}
