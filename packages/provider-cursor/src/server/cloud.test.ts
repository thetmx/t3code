import type { AgentOptions, RunResult } from "@cursor/sdk";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderSessionId, ThreadId } from "@t3tools/contracts";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import { describe, expect, it } from "vite-plus/test";

import type * as CursorAgentSdk from "./CursorAgentSdk.ts";
import { cursorCloudAgentOptions, cursorCloudRepoUrl, cursorCloudRunner } from "./cloud.ts";

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
  it("drops local-only options and never opens a PR", () => {
    expect(
      cursorCloudAgentOptions(
        {
          model: { id: "composer-2.5" },
          mode: "agent",
          local: { cwd: "/repo" },
          mcpServers: { t3: { type: "http", url: "http://127.0.0.1:1/mcp" } },
        },
        { url: "https://github.com/acme/app", startingRef: "main" },
      ),
    ).toEqual({
      model: { id: "composer-2.5" },
      mode: "agent",
      cloud: {
        repos: [{ url: "https://github.com/acme/app", startingRef: "main" }],
        autoCreatePR: false,
      },
    });
  });
});

describe("cursorCloudRunner", () => {
  it("starts from the pushed branch and fast-forwards to the agent's branch after a run", async () =>
    await Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "cursor-cloud-" });
      const origin = path.join(root, "origin.git");
      const workspace = path.join(root, "workspace");
      const agentClone = path.join(root, "agent");
      yield* git(root, "init", "-q", "--bare", "-b", "main", origin);
      yield* git(root, "clone", "-q", origin, workspace);
      yield* fileSystem.writeFileString(path.join(workspace, "base"), "");
      yield* git(workspace, "add", "base");
      yield* git(workspace, "commit", "-qm", "base");
      yield* git(workspace, "push", "-q", "origin", "HEAD:main");
      // Cursor's VM pushes its work to a branch of its own.
      yield* git(root, "clone", "-q", origin, agentClone);
      yield* git(agentClone, "checkout", "-qb", "cursor/feature");
      yield* fileSystem.writeFileString(path.join(agentClone, "feature"), "");
      yield* git(agentClone, "add", "feature");
      yield* git(agentClone, "commit", "-qm", "feature");
      yield* git(agentClone, "push", "-q", "origin", "cursor/feature");

      const opened: Array<AgentOptions> = [];
      const sent: Array<unknown> = [];
      const result: RunResult = {
        id: "run-1",
        status: "finished",
        git: { branches: [{ repoUrl: origin, branch: "cursor/feature" }] },
      };
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
        options: { mode: "agent", mcpServers: {} },
      });
      yield* run.wait;

      expect(opened[0]?.cloud?.repos).toEqual([
        { url: cursorCloudRepoUrl(origin), startingRef: "main" },
      ]);
      expect(sent).toEqual([{ mode: "agent" }]);
      expect(yield* git(workspace, "log", "-1", "--format=%s")).toBe("feature");
    }).pipe(
      Effect.scoped,
      Effect.provide([NodeServices.layer, FetchHttpClient.layer]),
      Effect.runPromise,
    ));
});
