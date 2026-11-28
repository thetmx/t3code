/**
 * Links the pull requests Cursor Cloud agents open. They run on Cursor's VMs and cannot reach
 * T3's link_pull_request, but Cursor's own tooling subscribes each agent to the PR it opened.
 *
 * @module cursorCloud/CursorCloudPullRequestLinker
 */
import { CommandId, type OrchestrationV2DomainEvent } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Predicate from "effect/Predicate";
import * as Stream from "effect/Stream";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { forkParked } from "../serverActivation.ts";
import { sourceControlDefinitions } from "../sourceControl/sourceControlDefinitions.ts";
import {
  normalizeThreadPullRequestKey,
  threadPullRequestKeyOf,
} from "../sourceControl/threadPullRequests.ts";

const SUBSCRIBE_TOOL = "mcp__cursor-subscriptions__subscribe_github_pr";

export function cursorCloudPullRequestLink(event: OrchestrationV2DomainEvent) {
  if (event.type !== "turn-item.updated") return undefined;
  const item = event.payload;
  if (item.type !== "dynamic_tool" || item.toolName !== SUBSCRIBE_TOOL) return undefined;
  if (item.status !== "completed") return undefined;
  const options = Predicate.hasProperty(item.input, "options") ? item.input.options : undefined;
  const url = Predicate.hasProperty(options, "prUrl") ? options.prUrl : undefined;
  if (typeof url !== "string") return undefined;
  const parsed = sourceControlDefinitions.parseChangeRequestUrl(url.trim());
  if (parsed === null) return undefined;
  const key = normalizeThreadPullRequestKey(parsed.link);
  return {
    type: "thread.pull-request.link" as const,
    // Stable per tool call, so a repeated update cannot relink one the user unlinked.
    commandId: CommandId.make(
      `server:cursor-cloud-pr-link:${event.threadId}:${item.id}:${threadPullRequestKeyOf(key)}`,
    ),
    threadId: event.threadId,
    ...key,
    url: url.trim(),
    source: "created" as const,
  };
}

const isFailure = <E>(cause: Cause.Cause<E>) => !Cause.hasInterruptsOnly(cause);

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* Orchestrator.OrchestratorV2;
    yield* forkParked(
      Stream.runForEach(engine.streamDomainEvents, (event) => {
        const command = cursorCloudPullRequestLink(event);
        return command === undefined
          ? Effect.void
          : engine.dispatch(command).pipe(
              Effect.catchCauseIf(isFailure, (cause) =>
                Effect.logWarning("linking a Cursor Cloud pull request failed", {
                  threadId: command.threadId,
                  cause,
                }),
              ),
            );
      }).pipe(
        Effect.catchCauseIf(isFailure, (cause) =>
          Effect.logWarning("Cursor Cloud pull request link stream failed", { cause }),
        ),
      ),
    );
  }),
);
