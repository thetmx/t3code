import type { AgentOptions, RunResult } from "@cursor/sdk";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, ProviderSessionId, ThreadId } from "@t3tools/contracts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import { describe, expect, it } from "vite-plus/test";

import { makeCursorAdapterV2 } from "./adapter.ts";
import * as CursorAgentSdk from "./CursorAgentSdk.ts";
import {
  cursorCloudAgentOptions,
  cursorCloudRepoUrl,
  cursorCloudRunner,
  forRuntime,
} from "./cloud.ts";

const git = Effect.fn(function* (cwd: string, ...args: Array<string>) {
  const result = yield* spawnAndCollect(
    "git",
    ChildProcess.make(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
      { cwd },
    ),
  );
  expect(result.code, result.stderr).toBe(0);
  return result.stdout.trim();
});

describe("cursorCloudRepoUrl", () => {
  it.each([
    ["git@github.com:acme/app.git", "https://github.com/acme/app"],
    ["ssh://git@gitlab.example.com/acme/app.git", "https://gitlab.example.com/acme/app"],
    ["https://user:token@github.com/acme/app.git", "https://github.com/acme/app"],
    ["https://github.com/acme/app", "https://github.com/acme/app"],
  ])("%s", (remote, url) => {
    expect(cursorCloudRepoUrl(remote)).toBe(url);
  });
});

describe("cursorCloudAgentOptions", () => {
  it("drops local-only options and opens a PR for the agent's work", () => {
    expect(
      cursorCloudAgentOptions(
        {
          model: { id: "composer-2.5", params: [{ id: "context", value: "1m" }], maxMode: true },
          mode: "agent",
          local: { cwd: "/repo" },
          mcpServers: { t3: { type: "http", url: "http://127.0.0.1:1/mcp" } },
        },
        { url: "https://github.com/acme/app", startingRef: "main" },
      ),
    ).toEqual({
      model: { id: "composer-2.5", params: [{ id: "context", value: "1m" }] },
      mode: "agent",
      cloud: {
        repos: [{ url: "https://github.com/acme/app", startingRef: "main" }],
        autoCreatePR: true,
      },
    });
  });
});

describe("cursorCloudRunner", () => {
  it("starts the agent from the checkout's pushed branch", async () =>
    await Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "cursor-cloud-" });
      const origin = path.join(root, "origin.git");
      const workspace = path.join(root, "workspace");
      yield* git(root, "init", "-q", "--bare", "-b", "main", origin);
      yield* git(root, "clone", "-q", origin, workspace);
      yield* fileSystem.writeFileString(path.join(workspace, "base"), "");
      yield* git(workspace, "add", "base");
      yield* git(workspace, "commit", "-qm", "base");
      yield* git(workspace, "push", "-q", "origin", "HEAD:main");

      const opened: Array<AgentOptions> = [];
      const sent: Array<unknown> = [];
      const result: RunResult = { id: "run-1", status: "finished" };
      const fake = {
        assertComplete: Effect.void,
        open: (input) =>
          Effect.sync(() => {
            opened.push(input.options);
            return {
              agentId: "bc-1",
              close: Effect.void,
              listMessages: Effect.succeed([]),
              send: (sendInput) =>
                Effect.sync(() => {
                  sent.push(sendInput.options);
                  return {
                    runId: "run-1",
                    agentId: "bc-1",
                    wait: Effect.succeed(result),
                    cancel: Effect.void,
                  };
                }),
            };
          }),
      } satisfies CursorAgentSdk.CursorAgentSdkRunner["Service"];

      const runner = yield* cursorCloudRunner(fake, fake);
      const session = yield* runner.open({
        operation: "create",
        options: { local: { cwd: workspace }, mcpServers: {} },
        threadId: ThreadId.make("thread-1"),
        providerSessionId: ProviderSessionId.make("session-1"),
      });
      const run = yield* session.send({
        message: "go",
        options: { model: { id: "claude-opus-5-5", maxMode: true }, mode: "agent", mcpServers: {} },
      });
      yield* run.wait;

      expect(opened[0]?.cloud?.repos).toEqual([
        { url: cursorCloudRepoUrl(origin), startingRef: "main" },
      ]);
      expect(sent).toEqual([{ model: { id: "claude-opus-5-5" }, mode: "agent" }]);
    }).pipe(
      Effect.scoped,
      Effect.provide([NodeServices.layer, FetchHttpClient.layer]),
      Effect.runPromise,
    ));
});

describe("forRuntime", () => {
  it("puts cloud capabilities on the session record orchestration reads", async () =>
    await Effect.gen(function* () {
      const workspace = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
        prefix: "cursor-cloud-session-",
      });
      const instanceId = ProviderInstanceId.make("cursor");
      const adapter = yield* makeCursorAdapterV2({ instanceId, environment: {} }).pipe(
        forRuntime("cloud"),
        Effect.provideService(CursorAgentSdk.CursorAgentSdkRunner, {
          assertComplete: Effect.void,
          open: () => Effect.die("unused"),
        }),
        Effect.provide(TestProviderHost.layer({ cwd: workspace })),
      );
      const runtime = yield* adapter.openSession({
        threadId: ThreadId.make("thread-1"),
        providerSessionId: ProviderSessionId.make("session-1"),
        modelSelection: { instanceId, model: "composer-2.5" },
        runtimePolicy: ProviderAdapter.ProviderAdapterV2RuntimePolicy.make({
          runtimeMode: "full-access",
          interactionMode: "default",
          cwd: workspace,
        }),
      });
      const { threads, turns } = runtime.providerSession.capabilities;
      expect([threads.canRollbackThread, turns.supportsSteeringByInterruptRestart]).toEqual([
        false,
        false,
      ]);
      expect(yield* adapter.getCapabilities()).toEqual(runtime.providerSession.capabilities);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, IdAllocator.layer, McpProviderSessions.layer),
      ),
      Effect.runPromise,
    ));
});
