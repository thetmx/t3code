/**
 * Cursor Cloud: the Cursor adapter with its agents running on Cursor's VMs. The thread's local
 * checkout only names the repository; the agent's work arrives as a pull request.
 *
 * @module provider-cursor/server/cloud
 */
import type { AgentOptions, ModelSelection, SendOptions } from "@cursor/sdk";
import type {
  OrchestrationV2ProviderCapabilities,
  OrchestrationV2ProviderSession,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Stream from "effect/Stream";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";

import * as CursorAgentSdk from "./CursorAgentSdk.ts";

/** Cursor wants the URL its forge shows; SSH remotes and credentials name the same repository. */
export function cursorCloudRepoUrl(remote: string): string {
  const ssh = remote.match(/^(?:ssh:\/\/)?[^@/]+@([^:/]+)[:/](.+?)(?:\.git)?\/?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  try {
    const url = new URL(remote);
    url.username = "";
    url.password = "";
    return url.toString().replace(/(?:\.git)?\/?$/, "");
  } catch {
    return remote;
  }
}

// The cloud API rejects the local-only `maxMode` key; the model's params pick the variant.
function cursorCloudModel(model: ModelSelection | undefined) {
  if (model === undefined) return {};
  const { maxMode: _maxMode, ...cloudModel } = model;
  return { model: cloudModel };
}

export function cursorCloudAgentOptions(
  options: AgentOptions,
  repo: { readonly url: string; readonly startingRef?: string } | undefined,
): AgentOptions {
  // Local workspace settings and T3's loopback MCP servers mean nothing on Cursor's VM.
  const { local: _local, mcpServers: _mcpServers, model, ...shared } = options;
  // The VM's work never reaches the local checkout, so a pull request is how it comes back.
  return {
    ...shared,
    ...cursorCloudModel(model),
    cloud: { ...(repo ? { repos: [repo] } : {}), autoCreatePR: true },
  };
}

function cursorCloudSendOptions(options: Omit<SendOptions, "onDelta"> | undefined) {
  if (options === undefined) return undefined;
  const { local: _local, mcpServers: _mcpServers, model, ...shared } = options;
  return { ...shared, ...cursorCloudModel(model) };
}

function cursorCloudCapabilities(
  capabilities: OrchestrationV2ProviderCapabilities,
): OrchestrationV2ProviderCapabilities {
  // Cursor keeps cloud conversations server-side: no message history, rewind, resume or summary.
  return {
    ...capabilities,
    threads: { ...capabilities.threads, canReadThreadSnapshot: false, canRollbackThread: false },
    turns: {
      ...capabilities.turns,
      supportsNativeResume: false,
      supportsActiveSteering: false,
      supportsSteeringByInterruptRestart: false,
    },
    tools: { ...capabilities.tools, supportsBackgroundWait: false },
    context: { ...capabilities.context, canGenerateSummaries: false },
    checkpointing: {
      ...capabilities.checkpointing,
      providerCanRollbackConversation: false,
      providerRollbackReturnsSnapshot: false,
      providerCanReadConversationSnapshot: false,
    },
  };
}

const withCloudCapabilities = (session: OrchestrationV2ProviderSession) => ({
  ...session,
  capabilities: cursorCloudCapabilities(session.capabilities),
});

export const makeCursorCloudRunner = Effect.fn("makeCursorCloudRunner")(function* (
  local: CursorAgentSdk.CursorAgentSdkRunner["Service"],
) {
  // The in-process runner passes cloud options straight to the SDK; the worker is for local agents.
  return yield* cursorCloudRunner(
    local,
    yield* CursorAgentSdk.makeCursorAgentSdkRunner(() => undefined),
  );
});

export const cursorCloudRunner = Effect.fn("cursorCloudRunner")(function* (
  local: CursorAgentSdk.CursorAgentSdkRunner["Service"],
  cloud: CursorAgentSdk.CursorAgentSdkRunner["Service"],
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const httpClient = yield* HttpClient.HttpClient;
  const git = (cwd: string, args: ReadonlyArray<string>) =>
    spawnAndCollect("git", ChildProcess.make("git", [...args], { cwd })).pipe(
      Effect.timeout("30 seconds"),
      Effect.map((result) => (result.code === 0 ? result.stdout.trim() : undefined)),
      Effect.orElseSucceed(() => undefined),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

  const resolveRepo = Effect.fn("CursorCloudRunner.resolveRepo")(function* (cwd: string) {
    const remote = yield* git(cwd, ["remote", "get-url", "origin"]);
    if (!remote) return undefined;
    const url = cursorCloudRepoUrl(remote);
    const branch = yield* git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    // An unpushed branch does not exist for Cursor, so the agent starts from the default branch.
    const pushed =
      branch && branch !== "HEAD"
        ? yield* git(cwd, ["ls-remote", "--heads", "origin", branch])
        : undefined;
    return pushed && branch ? { url, startingRef: branch } : { url };
  });

  return CursorAgentSdk.CursorAgentSdkRunner.of({
    ...local,
    assertComplete: cloud.assertComplete,
    open: Effect.fn("CursorCloudRunner.open")(function* (input) {
      const cwd = input.options.local?.cwd;
      const workspace = typeof cwd === "string" ? cwd : cwd?.[0];
      const repo =
        input.operation === "create" && workspace !== undefined
          ? yield* resolveRepo(workspace)
          : undefined;
      const apiKey = input.options.apiKey;
      // SDK 1.5.0 posts cancel with no body, which Cursor rejects with 415.
      const cancelRun = (run: CursorAgentSdk.CursorAgentSdkRun) =>
        apiKey === undefined
          ? run.cancel
          : httpClient
              .execute(
                HttpClientRequest.post(
                  `https://api.cursor.com/v1/agents/${run.agentId}/runs/${run.runId}/cancel`,
                ).pipe(HttpClientRequest.bearerToken(apiKey), HttpClientRequest.bodyJsonUnsafe({})),
              )
              .pipe(
                // 409 means the run already ended.
                Effect.filterOrFail(
                  (response) => response.status < 300 || response.status === 409,
                  (response) => new Error(`Cursor Cloud cancel failed (HTTP ${response.status}).`),
                ),
                Effect.asVoid,
                Effect.mapError(
                  (cause) =>
                    new CursorAgentSdk.CursorAgentSdkRunnerError({ method: "run.cancel", cause }),
                ),
              );
      // No storeCwd: the in-process runner would open a local store for it.
      const session = yield* cloud.open({
        operation: input.operation,
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        options: cursorCloudAgentOptions(input.options, repo),
        threadId: input.threadId,
        providerSessionId: input.providerSessionId,
      });
      return {
        agentId: session.agentId,
        close: session.close,
        listMessages: Effect.succeed([]),
        send: (sendInput) => {
          const options = cursorCloudSendOptions(sendInput.options);
          const { options: _options, ...rest } = sendInput;
          return session
            .send(options === undefined ? rest : { ...rest, options })
            .pipe(Effect.map((run) => ({ ...run, cancel: cancelRun(run) })));
        },
      } satisfies CursorAgentSdk.CursorAgentSdkSession;
    }),
  });
});

export const forRuntime =
  (runtime: "local" | "cloud" | undefined) =>
  <E, R>(
    makeAdapter: Effect.Effect<ProviderAdapter.ProviderAdapterV2["Service"], E, R>,
  ): Effect.Effect<
    ProviderAdapter.ProviderAdapterV2["Service"],
    E,
    R | McpProviderSessions.McpProviderSessions
  > =>
    runtime !== "cloud"
      ? makeAdapter
      : makeAdapter.pipe(
          // The thread's T3 MCP server listens on this machine, which Cursor's VM cannot reach.
          Effect.provideServiceEffect(
            McpProviderSessions.McpProviderSessions,
            Effect.map(McpProviderSessions.McpProviderSessions, (sessions) => ({
              ...sessions,
              read: () => Effect.undefined,
            })),
          ),
          Effect.map((adapter) => ({
            ...adapter,
            getCapabilities: () =>
              adapter.getCapabilities().pipe(Effect.map(cursorCloudCapabilities)),
            // Orchestration reads the capabilities each session record carries.
            openSession: (input) =>
              adapter.openSession(input).pipe(
                Effect.map((runtime) => ({
                  ...runtime,
                  providerSession: withCloudCapabilities(runtime.providerSession),
                  events: runtime.events.pipe(
                    Stream.map((event) =>
                      event.type === "provider_session.updated"
                        ? {
                            ...event,
                            providerSession: withCloudCapabilities(event.providerSession),
                          }
                        : event,
                    ),
                  ),
                })),
              ),
          })),
        );
