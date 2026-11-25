import type { ScopedThreadRef } from "@t3tools/contracts";

import { selectThreadRightPanelState, threadTabsRef, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { focusTerminal, type TerminalFocusOwner } from "./terminalFocus";

export function cycleThreadTerminal(
  threadRef: ScopedThreadRef,
  owner: TerminalFocusOwner,
  direction: "previous" | "next",
): boolean {
  const drawer = useTerminalUiStateStore.getState();
  const panels = useRightPanelStore.getState();
  const drawerState = selectThreadTerminalUiState(drawer.terminalUiStateByThreadKey, threadRef);
  const groupRef = owner === "tab" ? threadTabsRef(threadRef) : threadRef;
  const panelState = selectThreadRightPanelState(panels.byThreadKey, groupRef);
  const activeSurface = panelState.surfaces.find(
    (surface) => surface.id === panelState.activeSurfaceId,
  );
  const terminalOrder = new Map(drawerState.terminalIds.map((id, index) => [id, index]));
  const groupRank = (ids: readonly string[]) =>
    Math.min(...ids.map((id) => terminalOrder.get(id) ?? Number.POSITIVE_INFINITY));
  const terminalIds =
    owner === "drawer"
      ? drawerState.terminalGroups
          .toSorted((left, right) => groupRank(left.terminalIds) - groupRank(right.terminalIds))
          .flatMap((group) => group.terminalIds)
      : panelState.surfaces.flatMap((surface) =>
          surface.kind === "terminal" ? surface.terminalIds : [],
        );
  const activeTerminalId =
    owner === "drawer"
      ? drawerState.activeTerminalId
      : activeSurface?.kind === "terminal"
        ? activeSurface.activeTerminalId
        : null;
  const index = activeTerminalId === null ? -1 : terminalIds.indexOf(activeTerminalId);
  if (index === -1 || (owner === "drawer" ? !drawerState.terminalOpen : !panelState.isOpen))
    return false;
  const offset = direction === "next" ? 1 : -1;
  const terminalId = terminalIds[(index + offset + terminalIds.length) % terminalIds.length];
  if (terminalId === undefined) return false;
  if (owner === "drawer") {
    drawer.setActiveTerminal(threadRef, terminalId);
  } else {
    const surface = panelState.surfaces.find(
      (surface) => surface.kind === "terminal" && surface.terminalIds.includes(terminalId),
    );
    if (!surface) return false;
    panels.activateTerminal(groupRef, surface.id, terminalId);
    panels.activateSurface(groupRef, surface.id);
  }
  focusTerminal(threadRef, terminalId);
  return true;
}
