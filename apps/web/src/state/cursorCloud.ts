import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const cursorCloudRead = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:cursor-cloud:read",
  tag: WS_METHODS.cursorCloudRead,
});

export const cursorCloudConfigure = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:cursor-cloud:configure",
  tag: WS_METHODS.cursorCloudConfigure,
});
