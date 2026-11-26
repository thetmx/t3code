import * as Schema from "effect/Schema";

import { EnvironmentId } from "./baseSchemas.ts";

/** The Cursor Cloud environment this server runs beside itself, if it has been set up. */
export const CursorCloudEnvironmentState = Schema.Struct({
  environmentId: Schema.NullOr(EnvironmentId),
});
export type CursorCloudEnvironmentState = typeof CursorCloudEnvironmentState.Type;

export const CursorCloudEnvironmentConfigureInput = Schema.Struct({
  enabled: Schema.Boolean,
});
export type CursorCloudEnvironmentConfigureInput = typeof CursorCloudEnvironmentConfigureInput.Type;

/** Turning it on also returns a fresh link the client pairs with. */
export const CursorCloudEnvironmentConfigureResult = Schema.Struct({
  environmentId: Schema.NullOr(EnvironmentId),
  pairingUrl: Schema.NullOr(Schema.String),
});
export type CursorCloudEnvironmentConfigureResult =
  typeof CursorCloudEnvironmentConfigureResult.Type;

export class CursorCloudEnvironmentError extends Schema.TaggedError<CursorCloudEnvironmentError>()(
  "CursorCloudEnvironmentError",
  { detail: Schema.String },
) {
  override get message(): string {
    return this.detail;
  }
}
