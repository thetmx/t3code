import {
  mapAtomCommandResult,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { PreviewSessionSnapshot, ScopedThreadRef } from "@t3tools/contracts";

import type { BrowserSettingsReadError, OpenPreviewMutation } from "~/browser/openFileInPreview";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

import { openPreviewSession } from "./openPreviewSession";

export async function addBrowserSurface<E>(input: {
  readonly threadRef: ScopedThreadRef;
  /** The surface group that receives the tab. Defaults to the thread's side panel. */
  readonly groupRef?: ScopedThreadRef | undefined;
  readonly openPreview: OpenPreviewMutation<E>;
  readonly profileId?: string | undefined;
  readonly duplicateFrom?: PreviewSessionSnapshot;
}): Promise<AtomCommandResult<void, E | BrowserSettingsReadError>> {
  const source = input.duplicateFrom;
  const result = await openPreviewSession({
    openPreview: input.openPreview,
    threadRef: input.threadRef,
    ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
    ...(source === undefined
      ? {}
      : {
          ...(source.navStatus._tag === "Idle" ? {} : { url: source.navStatus.url }),
          ...(source.profileId === undefined ? {} : { profileId: source.profileId }),
          ...(source.viewport === undefined ? {} : { viewport: source.viewport }),
          ...(source.zoomFactor === undefined ? {} : { zoomFactor: source.zoomFactor }),
          ...(source.colorScheme === undefined ? {} : { colorScheme: source.colorScheme }),
          runtime: source.runtime ?? "desktop",
        }),
  });
  return mapAtomCommandResult(result, (snapshot) => {
    const groupRef = input.groupRef ?? input.threadRef;
    useRightPanelStore.getState().openBrowser(groupRef, snapshot.tabId);
    if (source) {
      const panels = useRightPanelStore.getState();
      const { surfaces } = selectThreadRightPanelState(panels.byThreadKey, groupRef);
      const sourceIndex = surfaces.findIndex(
        (surface) => surface.kind === "preview" && surface.resourceId === source.tabId,
      );
      const duplicate = surfaces.find(
        (surface) => surface.kind === "preview" && surface.resourceId === snapshot.tabId,
      );
      if (sourceIndex >= 0 && duplicate) {
        panels.moveSurface(groupRef, duplicate.id, sourceIndex + 1);
      }
    }
  });
}
