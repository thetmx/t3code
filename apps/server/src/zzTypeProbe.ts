// TEMPORARY: CI-only probe to find which CLI command carries `any`. Removed before merge.
import type * as Effect from "effect/Effect";
import type * as Command from "effect/cli/Command";

import type * as Cli_acpMcpBridge from "./cli/acpMcpBridge.ts";
import type * as Cli_app from "./cli/app.ts";
import type * as Cli_auth from "./cli/auth.ts";
import type * as Cli_browser from "./cli/browser.ts";
import type * as Cli_claudeHistory from "./cli/claudeHistory.ts";
import type * as Cli_doctor from "./cli/doctor.ts";
import type * as Cli_environment from "./cli/environment.ts";
import type * as Cli_install from "./cli/install.ts";
import type * as Cli_pair from "./cli/pair.ts";
import type * as Cli_policy from "./cli/policy.ts";
import type * as Cli_portspace from "./cli/portspace.ts";
import type * as Cli_portspaceRelay from "./cli/portspaceRelay.ts";
import type * as Cli_project from "./cli/project.ts";
import type * as Cli_server from "./cli/server.ts";
import type * as Cli_service from "./cli/service.ts";
import type * as Cli_servicePreflight from "./cli/servicePreflight.ts";
import type * as Cli_speechWorker from "./cli/speechWorker.ts";
import type * as Cli_sshHelper from "./cli/sshHelper.ts";
import type * as Cli_theme from "./cli/theme.ts";
import type * as Cli_thread from "./cli/thread.ts";
import type * as Cli_trace from "./cli/trace.ts";
import type * as Cli_triage from "./cli/triage.ts";
import type * as Cli_uninstall from "./cli/uninstall.ts";
import type * as Cli_up from "./cli/up.ts";
import type * as Cli_update from "./cli/update.ts";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Channels<T> =
  T extends Command.Command<infer _N, infer _I, infer _C, infer E, infer R>
    ? { e: E; r: R }
    : { e: "not-command"; r: "not-command" };
type Probe<T> = [IsAny<Channels<T>["r"]>, IsAny<Channels<T>["e"]>];

export const probe_acpMcpBridgeCommand: Probe<typeof Cli_acpMcpBridge.acpMcpBridgeCommand> = [false, false];
export const probe_acpMcpCallCommand: Probe<typeof Cli_acpMcpBridge.acpMcpCallCommand> = [false, false];
export const probe_authCommand: Probe<typeof Cli_auth.authCommand> = [false, false];
export const probe_environmentCommand: Probe<typeof Cli_environment.environmentCommand> = [false, false];
export const probe_appCommand: Probe<typeof Cli_app.appCommand> = [false, false];
export const probe_browserCommand: Probe<typeof Cli_browser.browserCommand> = [false, false];
export const probe_pairCommand: Probe<typeof Cli_pair.pairCommand> = [false, false];
export const probe_portspaceCommand: Probe<typeof Cli_portspace.portspaceCommand> = [false, false];
export const probe_portspaceRelayCommand: Probe<typeof Cli_portspaceRelay.portspaceRelayCommand> = [false, false];
export const probe_projectCommand: Probe<typeof Cli_project.projectCommand> = [false, false];
export const probe_threadCommand: Probe<typeof Cli_thread.threadCommand> = [false, false];
export const probe_startCommand: Probe<typeof Cli_server.startCommand> = [false, false];
export const probe_serveCommand: Probe<typeof Cli_server.serveCommand> = [false, false];
export const probe_updateCommand: Probe<typeof Cli_update.updateCommand> = [false, false];
export const probe_installCommand: Probe<typeof Cli_install.installCommand> = [false, false];
export const probe_uninstallCommand: Probe<typeof Cli_uninstall.uninstallCommand> = [false, false];
export const probe_speechWorkerCommand: Probe<typeof Cli_speechWorker.speechWorkerCommand> = [false, false];
export const probe_claudeHistoryCommand: Probe<typeof Cli_claudeHistory.claudeHistoryCommand> = [false, false];
export const probe_sshHelperCommand: Probe<typeof Cli_sshHelper.sshHelperCommand> = [false, false];
export const probe_serviceCommand: Probe<typeof Cli_service.serviceCommand> = [false, false];
export const probe_servicePreflightCommand: Probe<typeof Cli_servicePreflight.servicePreflightCommand> = [false, false];
export const probe_themeCommand: Probe<typeof Cli_theme.themeCommand> = [false, false];
export const probe_traceCommand: Probe<typeof Cli_trace.traceCommand> = [false, false];
export const probe_triageCommand: Probe<typeof Cli_triage.triageCommand> = [false, false];
export const probe_connectCommand: Probe<typeof Cli_up.connectCommand> = [false, false];
export const probe_statusCommand: Probe<typeof Cli_up.statusCommand> = [false, false];
export const probe_upCommand: Probe<typeof Cli_up.upCommand> = [false, false];
export const probe_doctorCommand: Probe<typeof Cli_doctor.doctorCommand> = [false, false];
export const probe_policyCommand: Probe<typeof Cli_policy.policyCommand> = [false, false];
type EffectProbe<T> =
  T extends Effect.Effect<infer _A, infer E, infer R> ? [IsAny<R>, IsAny<E>] : ["not-effect"];
export const probe_runDefault: EffectProbe<ReturnType<typeof Cli_server.runDefaultServerCommand>> = [
  false,
  false,
];
