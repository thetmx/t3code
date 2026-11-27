import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useGT } from "gt-react";
import { useState } from "react";
import { m } from "~/i18n/messages";

import { environmentCatalog } from "../../connection/catalog";
import { connectPairing } from "../../connection/onboarding";
import { cursorCloudConfigure, cursorCloudRead } from "../../state/cursorCloud";
import { useEnvironment } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SettingsRow } from "./settingsLayout";

// Runs a second server on this computer whose agents run on Cursor's VMs, then pairs with it.
export function CursorCloudEnvironmentSetting({
  hostEnvironmentId,
}: {
  readonly hostEnvironmentId: EnvironmentId;
}) {
  const gt = useGT();
  const stateAtom = cursorCloudRead({ environmentId: hostEnvironmentId, input: {} });
  const state = useAtomValue(stateAtom);
  const refresh = useAtomRefresh(stateAtom);
  const configure = useAtomCommand(cursorCloudConfigure, { reportFailure: false });
  const pair = useAtomCommand(connectPairing, { reportFailure: false });
  const removeEnvironment = useAtomCommand(environmentCatalog.remove, { reportFailure: false });
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cloudEnvironmentId = AsyncResult.isSuccess(state) ? state.value.environmentId : null;
  const connected = useEnvironment(cloudEnvironmentId) !== null;
  if (!AsyncResult.isSuccess(state)) return null;

  const failureMessage = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
    const cause = squashAtomCommandFailure(result);
    return cause instanceof Error
      ? (thrownErrorMessage(cause, m) ?? cause.message)
      : gt("Couldn't change this setting.");
  };

  const turnOn = async () => {
    setIsUpdating(true);
    setError(null);
    const configured = await configure({
      environmentId: hostEnvironmentId,
      input: { enabled: true },
    });
    if (configured._tag === "Success" && configured.value.pairingUrl !== null) {
      const paired = await pair({
        pairingUrl: configured.value.pairingUrl,
        ...(configured.value.environmentId === null
          ? {}
          : { expectedEnvironmentId: configured.value.environmentId }),
      });
      if (paired._tag === "Failure" && !isAtomCommandInterrupted(paired)) {
        setError(failureMessage(paired));
      }
    } else if (configured._tag === "Failure" && !isAtomCommandInterrupted(configured)) {
      setError(failureMessage(configured));
    }
    refresh();
    setIsUpdating(false);
  };

  const turnOff = async () => {
    setIsUpdating(true);
    setError(null);
    if (cloudEnvironmentId !== null && connected) {
      const removed = await removeEnvironment(cloudEnvironmentId);
      if (removed._tag === "Failure" && !isAtomCommandInterrupted(removed)) {
        setError(failureMessage(removed));
        setIsUpdating(false);
        return;
      }
    }
    const configured = await configure({
      environmentId: hostEnvironmentId,
      input: { enabled: false },
    });
    if (configured._tag === "Failure" && !isAtomCommandInterrupted(configured)) {
      setError(failureMessage(configured));
    }
    refresh();
    setIsUpdating(false);
  };

  const enabled = cloudEnvironmentId !== null;
  return (
    <SettingsRow
      title={gt("Cursor Cloud")}
      description={
        enabled
          ? connected
            ? gt("Cursor Cloud is an environment of its own. Its agents run on Cursor's VMs.")
            : gt("Cursor Cloud is running on this computer but this app isn't connected to it.")
          : gt(
              "Add an environment whose agents run on Cursor's VMs. It runs beside this computer's server and uses your Cursor sign-in.",
            )
      }
      status={error ? <span className="block text-destructive">{error}</span> : null}
      control={
        <div className="flex items-center gap-2">
          {enabled && !connected ? (
            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => void turnOn()}>
              {gt("Connect")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdating}
            onClick={() => void (enabled ? turnOff() : turnOn())}
          >
            {isUpdating ? <Spinner size="sm" /> : null}
            {enabled ? gt("Remove") : gt("Set up")}
          </Button>
        </div>
      }
    />
  );
}
