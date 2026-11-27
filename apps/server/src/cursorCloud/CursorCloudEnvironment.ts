/**
 * Runs a second T3 server beside this one whose only provider is Cursor, with its agents on
 * Cursor Cloud VMs, so clients can pick Cursor Cloud as an environment of its own.
 *
 * @module cursorCloud/CursorCloudEnvironment
 */
import {
  type CursorCloudEnvironmentConfigureInput,
  CursorCloudEnvironmentError,
  defaultInstanceIdForDriver,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  type ServerSettings as ServerSettingsType,
} from "@t3tools/contracts";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NetService from "@t3tools/shared/Net";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../config.ts";
import * as ProviderCredentialStore from "../provider/ProviderCredentialStore.ts";
import { BUILT_IN_DRIVERS } from "../provider/builtInDrivers.ts";
import { isProcessAlive, readLiveServerRuntimeState } from "../serverRuntimeState.ts";
import * as ServerSettings from "../serverSettings.ts";

const LABEL = "Cursor Cloud";
const CURSOR = ProviderDriverKind.make("cursor");
const CURSOR_INSTANCE = ProviderInstanceId.make("cursor");

const SidecarState = Schema.fromJsonString(Schema.Struct({ port: Schema.Int }));
const SettingsJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown));
const decodeSidecarState = Schema.decodeEffect(SidecarState);
const encodeSidecarState = Schema.encodeEffect(SidecarState);
const decodeSettings = Schema.decodeEffect(SettingsJson);
const encodeSettings = Schema.encodeEffect(SettingsJson);
const decodeInstances = Schema.decodeUnknownEffect(ProviderInstanceConfigMap);
const decodeDescriptorResponse = HttpClientResponse.schemaBodyJson(
  Schema.Struct({ environmentId: Schema.String }),
);

/** Only the Cursor provider, running on Cursor Cloud, so the environment has a single agent. */
export function cursorCloudSettings(
  settings: Readonly<Record<string, unknown>>,
  configured: ProviderInstanceConfigMap,
  host: Pick<ServerSettingsType, "worktreeReuse" | "storageCleanup">,
) {
  const instances = { ...configured };
  for (const driver of BUILT_IN_DRIVERS) {
    if (driver.metadata.hasDefaultInstance === false) continue;
    const instanceId = defaultInstanceIdForDriver(driver.driverKind);
    instances[instanceId] = { ...instances[instanceId], driver: driver.driverKind, enabled: false };
  }
  const cursor = instances[CURSOR_INSTANCE];
  instances[CURSOR_INSTANCE] = {
    ...cursor,
    driver: CURSOR,
    displayName: LABEL,
    enabled: true,
    config: { ...(typeof cursor?.config === "object" ? cursor.config : {}), runtime: "cloud" },
  };
  return {
    ...settings,
    // Its threads use worktrees too, so they follow this machine's reuse and cleanup rules.
    worktreeReuse: host.worktreeReuse,
    storageCleanup: host.storageCleanup,
    providerInstances: instances,
    defaultModelSelection: settings.defaultModelSelection ?? {
      instanceId: CURSOR_INSTANCE,
      model: "auto",
    },
  };
}

export class CursorCloudEnvironment extends Context.Service<
  CursorCloudEnvironment,
  {
    readonly read: Effect.Effect<{ readonly environmentId: EnvironmentId | null }>;
    readonly configure: (input: CursorCloudEnvironmentConfigureInput) => Effect.Effect<
      {
        readonly environmentId: EnvironmentId | null;
        readonly pairingUrl: string | null;
      },
      CursorCloudEnvironmentError
    >;
  }
>()("t3/cursorCloud/CursorCloudEnvironment") {}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const net = yield* NetService.NetService;
  const httpClient = yield* HttpClient.HttpClient;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const hostEnvironment = yield* HostProcess.Environment;
  const command = yield* HostProcess.ExecutablePath;
  const isExecutable = yield* HostProcess.IsExecutable;
  const scope = yield* Effect.scope;
  // Setup runs later, from a request; it uses the services this layer was built with.
  const context = yield* Effect.context<
    | ChildProcessSpawner.ChildProcessSpawner
    | FileSystem.FileSystem
    | Effect.Services<ReturnType<typeof ProviderCredentialStore.make>>
  >();
  const credentials = (instanceId: ProviderInstanceId) =>
    ProviderCredentialStore.make("cursor", instanceId);

  const baseDir = path.join(config.baseDir, "cursor-cloud");
  const paths = yield* ServerConfig.deriveServerPaths(baseDir, undefined);
  const statePath = path.join(baseDir, "cursor-cloud.json");
  // In a bundle import.meta.url is bin.mjs; development and tests use this source module.
  const entry = yield* path
    .fromFileUrl(
      new URL(import.meta.url.endsWith(".ts") ? "../bin.ts" : "./bin.mjs", import.meta.url),
    )
    .pipe(Effect.orDie);
  const self = (args: ReadonlyArray<string>, output: "pipe" | "ignore" = "ignore") =>
    ChildProcess.make(command, [...(isExecutable ? [] : [entry]), ...args, "--base-dir", baseDir], {
      // The child is a server of its own: this one's port, home, dev URL and bootstrap fd are not its.
      env: {
        ...Object.fromEntries(
          Object.keys(hostEnvironment)
            .filter((key) => key.startsWith("T3CODE_") || key.startsWith("VITE_"))
            .map((key) => [key, undefined]),
        ),
        T3CODE_ENVIRONMENT_LABEL: LABEL,
        // Agents work on Cursor's VMs, so a worktree per thread would only cost disk.
        T3CODE_THREADS_IN_PROJECT_FOLDER: "1",
      },
      extendEnv: true,
      stdin: "ignore",
      ...(output === "pipe" ? {} : { stdout: "ignore", stderr: "ignore" }),
    });

  const failWith = (detail: string) => (cause: unknown) =>
    Effect.logWarning("cursor-cloud.setup-failed", { detail, cause }).pipe(
      Effect.andThen(Effect.fail(new CursorCloudEnvironmentError({ detail }))),
    );

  const readPort = fileSystem.readFileString(statePath).pipe(
    Effect.flatMap(decodeSidecarState),
    Effect.map((state) => state.port),
    Effect.option,
  );
  const readEnvironmentId = fileSystem.readFileString(paths.environmentIdPath).pipe(
    Effect.map((id) => EnvironmentId.make(id.trim())),
    Effect.orElseSucceed(() => null),
  );

  const servesThisEnvironment = (origin: string) =>
    Effect.all([
      httpClient
        .get(`${origin}/.well-known/t3/environment`)
        .pipe(Effect.flatMap(decodeDescriptorResponse)),
      readEnvironmentId,
    ]).pipe(
      Effect.map(([descriptor, environmentId]) => descriptor.environmentId === environmentId),
      Effect.timeout("3 seconds"),
      Effect.orElseSucceed(() => false),
    );

  const sidecar = yield* Ref.make<Fiber.Fiber<never> | undefined>(undefined);
  const runSidecarOnce = Effect.fn("CursorCloudEnvironment.runSidecar")(
    function* (port: number) {
      // A server left behind by a crashed parent is stopped so the one below is supervised. Its
      // record's address must answer as this environment, so a reused pid is never signalled.
      const live = yield* readLiveServerRuntimeState(paths.serverRuntimeStatePath).pipe(
        Effect.orElseSucceed(() => Option.none()),
      );
      if (Option.isSome(live) && (yield* servesThisEnvironment(live.value.origin))) {
        const { pid } = live.value;
        // It may have exited since the record was read.
        yield* Effect.try({ try: () => process.kill(pid, "SIGTERM"), catch: () => pid }).pipe(
          Effect.ignore,
        );
        yield* Effect.sync(() => isProcessAlive(pid)).pipe(
          Effect.repeat({ until: (alive) => !alive, schedule: Schedule.spaced("200 millis") }),
          Effect.timeout("10 seconds"),
          Effect.ignore,
        );
      }
      const child = yield* spawner.spawn(
        self(["serve", "--host", "127.0.0.1", "--port", String(port)]),
      );
      const exitCode = yield* child.exitCode;
      yield* Effect.logWarning("cursor-cloud.server-exited", { exitCode });
      yield* Effect.sleep("5 seconds");
    },
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.logWarning("cursor-cloud.server-failed", { cause }).pipe(
        Effect.andThen(Effect.sleep("5 seconds")),
      ),
    ),
  );
  const runSidecar = (port: number) => Effect.forever(runSidecarOnce(port));
  const start = (port: number) =>
    Ref.get(sidecar).pipe(
      Effect.flatMap((running) =>
        running !== undefined
          ? Effect.void
          : Effect.forkIn(runSidecar(port), scope).pipe(
              Effect.flatMap((fiber) => Ref.set(sidecar, fiber)),
            ),
      ),
    );

  const seedSettings = Effect.gen(function* () {
    const settings = (yield* fileSystem.exists(paths.settingsPath))
      ? yield* decodeSettings(yield* fileSystem.readFileString(paths.settingsPath))
      : {};
    const instances = yield* decodeInstances(settings.providerInstances ?? {});
    const host = yield* serverSettings.getSettings;
    yield* fileSystem.makeDirectory(paths.stateDir, { recursive: true });
    yield* fileSystem.writeFileString(
      paths.settingsPath,
      yield* encodeSettings(cursorCloudSettings(settings, instances, host)),
    );
  });

  // Reuse this machine's current Cursor sign-in so the new environment needs no second one.
  const copySignIn = Effect.gen(function* () {
    const target = yield* credentials(CURSOR_INSTANCE);
    const targetPath = path.join(paths.secretsDir, `${target.binding.key}.bin`);
    const { providerInstances } = yield* serverSettings.getSettings;
    // The default instance is absent from settings until someone edits it.
    const instanceIds = new Set([
      CURSOR_INSTANCE,
      ...Object.entries(providerInstances)
        .filter(([, instance]) => instance.driver === CURSOR)
        .map(([instanceId]) => ProviderInstanceId.make(instanceId)),
    ]);
    for (const instanceId of instanceIds) {
      const stored = yield* (yield* credentials(instanceId)).get;
      if (Option.isNone(stored)) continue;
      yield* fileSystem.makeDirectory(paths.secretsDir, { recursive: true, mode: 0o700 });
      yield* fileSystem.writeFile(targetPath, stored.value, { mode: 0o600 });
      return;
    }
  });

  const mintPairingLink = spawnAndCollect(command, self(["pair", "--label", LABEL], "pipe")).pipe(
    Effect.flatMap((result) => {
      const pairingUrl = result.stdout.match(/^Pairing URL: (\S+)$/m)?.[1];
      return pairingUrl === undefined
        ? Effect.fail(
            new CursorCloudEnvironmentError({ detail: `t3 pair exited with ${result.code}.` }),
          )
        : Effect.succeed(pairingUrl);
    }),
    // The server needs a few seconds to start; pair refuses until it answers.
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 60 }),
  );

  const portOnBoot = yield* readPort;
  if (Option.isSome(portOnBoot)) yield* start(portOnBoot.value);

  return CursorCloudEnvironment.of({
    read: readPort.pipe(
      Effect.flatMap((port) =>
        Option.isNone(port)
          ? Effect.succeed({ environmentId: null })
          : readEnvironmentId.pipe(Effect.map((environmentId) => ({ environmentId }))),
      ),
    ),
    configure: Effect.fn("CursorCloudEnvironment.configure")(function* ({ enabled }) {
      if (!enabled) {
        const running = yield* Ref.getAndSet(sidecar, undefined);
        if (running !== undefined) yield* Fiber.interrupt(running);
        yield* fileSystem
          .remove(statePath, { force: true })
          .pipe(Effect.catch(failWith("Could not turn off Cursor Cloud.")));
        return { environmentId: null, pairingUrl: null };
      }
      yield* seedSettings.pipe(Effect.catch(failWith("Could not set up Cursor Cloud's settings.")));
      yield* copySignIn.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("cursor-cloud.sign-in-not-copied", { cause }),
        ),
      );
      const port =
        Option.getOrUndefined(yield* readPort) ??
        (yield* net
          .reserveLoopbackPort()
          .pipe(Effect.catch(failWith("Could not find a free port for Cursor Cloud."))));
      yield* encodeSidecarState({ port }).pipe(
        Effect.flatMap((state) => fileSystem.writeFileString(statePath, state)),
        Effect.catch(failWith("Could not save Cursor Cloud's settings.")),
      );
      yield* start(port);
      const pairingUrl = yield* mintPairingLink.pipe(
        Effect.catch(failWith("Cursor Cloud's server did not start.")),
      );
      return { environmentId: yield* readEnvironmentId, pairingUrl };
    }, Effect.provide(context)),
  });
});

export const layer = Layer.effect(CursorCloudEnvironment, make);
