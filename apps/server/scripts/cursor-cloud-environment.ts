// Seeds a T3 home whose only provider is Cursor, running its agents on Cursor Cloud.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/cli";

import { BUILT_IN_DRIVERS } from "../src/provider/builtInDrivers.ts";

const SettingsJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeSettings = Schema.decodeEffect(SettingsJson);
const encodeSettings = Schema.encodeEffect(SettingsJson);
const decodeInstances = Schema.decodeUnknownEffect(ProviderInstanceConfigMap);
const CURSOR = ProviderInstanceId.make("cursor");

const command = Command.make("cursor-cloud-environment", {
  baseDir: Argument.String("base-dir"),
}).pipe(
  Command.withDescription("Seed a T3 Code data directory whose only provider is Cursor Cloud."),
  Command.withHandler(
    Effect.fn(function* ({ baseDir }) {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const settingsPath = path.join(path.resolve(baseDir), "userdata", "settings.json");
      const settings = (yield* fileSystem.exists(settingsPath))
        ? yield* decodeSettings(yield* fileSystem.readFileString(settingsPath))
        : {};
      const instances = { ...(yield* decodeInstances(settings.providerInstances ?? {})) };
      for (const driver of BUILT_IN_DRIVERS) {
        if (driver.metadata.hasDefaultInstance === false) continue;
        const instanceId = defaultInstanceIdForDriver(driver.driverKind);
        instances[instanceId] = {
          ...instances[instanceId],
          driver: driver.driverKind,
          enabled: false,
        };
      }
      const cursor = instances[CURSOR];
      instances[CURSOR] = {
        ...cursor,
        driver: ProviderDriverKind.make("cursor"),
        displayName: "Cursor Cloud",
        enabled: true,
        config: {
          ...(typeof cursor?.config === "object" ? cursor.config : {}),
          runtime: "cloud",
        },
      };
      yield* fileSystem.makeDirectory(path.dirname(settingsPath), { recursive: true });
      yield* fileSystem.writeFileString(
        settingsPath,
        yield* encodeSettings({
          ...settings,
          providerInstances: instances,
          defaultModelSelection: settings.defaultModelSelection ?? {
            instanceId: CURSOR,
            model: "auto",
          },
        }),
      );
      yield* Console.log(`Wrote ${settingsPath}`);
      yield* Console.log(
        `Start it with: T3CODE_ENVIRONMENT_LABEL="Cursor Cloud" t3 serve --base-dir ${baseDir} --port 3780`,
      );
    }),
  ),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
