// TEMPORARY: CI-only probe to find which layer or effect carries `any`. Removed before merge.
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";

import type * as ServiceLauncherClient from "./cloud/serviceLauncherClient.ts";
import type * as GitManager from "./git/GitManager.ts";
import type * as GitWorkflowService from "./git/GitWorkflowService.ts";
import type * as WorktreeManager from "./git/WorktreeManager.ts";
import type * as EffectWorker from "./orchestration-v2/EffectWorker.ts";
import type * as ThreadManagement from "./orchestration-v2/ThreadManagementService.ts";
import type * as Startup from "./serverRuntimeStartup.ts";
import type * as GitVcsDriver from "./vcs/GitVcsDriver.ts";
import type * as RestoreMissingWorktree from "./workspace/restoreMissingWorktree.ts";
import type * as TaskFolders from "./workspace/TaskFolders.ts";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Channels<T> =
  T extends Layer.Layer<infer _A, infer E, infer R>
    ? { e: E; r: R }
    : T extends Effect.Effect<infer _A, infer E, infer R>
      ? { e: E; r: R }
      : { e: "not-effect"; r: "not-effect" };
type Probe<T> = [IsAny<Channels<T>["r"]>, IsAny<Channels<T>["e"]>];

export const probeStartupLayer: Probe<ReturnType<typeof Startup.layerWithOptions>> = [false, false];
export const probeAutoPull: Probe<ReturnType<typeof Startup.autoPullProjects>> = [false, false];
export const probeMaybeOpenBrowser: Probe<ReturnType<typeof Startup.maybeOpenBrowser>> = [
  false,
  false,
];
export const probeStartWorker: Probe<ReturnType<typeof Startup.startEffectWorkerWithRelay>> = [
  false,
  false,
];
export const probeCommandGate: Probe<typeof Startup.makeCommandGate> = [false, false];
export const probeRunDaemon: Probe<typeof EffectWorker.runDaemon> = [false, false];
export const probeLauncher: Probe<typeof ServiceLauncherClient.layer> = [false, false];
export const probeRestore: Probe<typeof RestoreMissingWorktree.layerThreadWorktreeRestore> = [
  false,
  false,
];
export const probeTaskFolders: Probe<typeof TaskFolders.layer> = [false, false];
export const probeWorktreeManager: Probe<typeof WorktreeManager.layer> = [false, false];
export const probeThreadManagement: Probe<typeof ThreadManagement.layer> = [false, false];
export const probeGitVcsDriver: Probe<typeof GitVcsDriver.layer> = [false, false];
export const probeGitWorkflow: Probe<typeof GitWorkflowService.layer> = [false, false];
export const probeGitManager: Probe<typeof GitManager.layer> = [false, false];
