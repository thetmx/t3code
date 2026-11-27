/**
 * An environment whose agents work on another machine, such as Cursor Cloud, runs every new
 * thread in its project folder: a worktree per thread would only cost disk.
 *
 * @module cursorCloud/projectFolderThreads
 */
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";

export const threadsInProjectFolder = Effect.gen(function* () {
  return (yield* HostProcess.Environment).T3CODE_THREADS_IN_PROJECT_FOLDER === "1";
});

/** A request for a new worktree becomes the project folder; an existing workspace stays. */
export const inProjectFolder = <Strategy extends { readonly type: string }>(
  strategy: Strategy,
): Strategy | { readonly type: "root" } =>
  strategy.type === "worktree" ? { type: "root" } : strategy;
