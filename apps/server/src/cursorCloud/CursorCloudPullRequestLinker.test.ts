import { assert, describe, it } from "@effect/vitest";
import {
  EventId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ServerCommand,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { cursorCloudPullRequestLink, layer } from "./CursorCloudPullRequestLinker.ts";

const THREAD = ThreadId.make("cloud-thread");
const PR_URL = "https://github.com/acme/app/pull/6500";

function toolItem(
  overrides: {
    readonly toolName?: string;
    readonly status?: "running" | "completed" | "failed";
    readonly input?: unknown;
  } = {},
): OrchestrationV2DomainEvent {
  const at = DateTime.makeUnsafe("2026-11-28T10:43:16.852Z");
  const runId = RunId.make("run:cloud-thread:1");
  return {
    type: "turn-item.updated",
    id: EventId.make("event:cloud-thread:subscribe"),
    threadId: THREAD,
    runId,
    occurredAt: at,
    payload: {
      id: TurnItemId.make("turn-item:subscribe"),
      threadId: THREAD,
      runId,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: 1,
      status: overrides.status ?? "completed",
      title: "subscribe github pr",
      startedAt: at,
      completedAt: at,
      updatedAt: at,
      type: "dynamic_tool",
      toolName: overrides.toolName ?? "mcp__cursor-subscriptions__subscribe_github_pr",
      input: overrides.input ?? { options: { scope: "pr", prUrl: PR_URL } },
    },
  };
}

describe("cursorCloudPullRequestLink", () => {
  it("links the pull request a Cursor Cloud agent subscribed to", () => {
    const command = cursorCloudPullRequestLink(toolItem());
    assert.deepInclude(command, {
      type: "thread.pull-request.link",
      threadId: THREAD,
      host: "github.com",
      repository: "acme/app",
      number: 6500,
      url: PR_URL,
      source: "created",
    });
    assert.strictEqual(cursorCloudPullRequestLink(toolItem())?.commandId, command?.commandId);
  });

  it.each([
    ["a running call", toolItem({ status: "running" })],
    ["a failed call", toolItem({ status: "failed" })],
    ["another tool", toolItem({ toolName: "mcp__cursor-subscriptions__subscribe_github_ci" })],
    [
      "a URL that is not a pull request",
      toolItem({ input: { options: { prUrl: "https://x.y" } } }),
    ],
    ["no URL", toolItem({ input: { options: { scope: "pr" } } })],
  ])("ignores %s", (_name, event) => {
    assert.isUndefined(cursorCloudPullRequestLink(event));
  });
});

describe("layer", () => {
  it.effect("dispatches the link for each subscribe event the orchestrator streams", () =>
    Effect.gen(function* () {
      const dispatched = yield* Deferred.make<OrchestrationV2ServerCommand>();
      yield* Layer.build(layer).pipe(
        Effect.provide(
          Layer.mock(Orchestrator.OrchestratorV2)({
            streamDomainEvents: Stream.make(toolItem({ status: "running" }), toolItem()),
            dispatch: (command) =>
              Deferred.succeed(dispatched, command).pipe(
                Effect.as({ sequence: 1, storedEvents: [] }),
              ),
          }),
        ),
      );
      const command = yield* Deferred.await(dispatched);
      assert.deepStrictEqual(command, cursorCloudPullRequestLink(toolItem()));
    }).pipe(Effect.scoped),
  );
});
