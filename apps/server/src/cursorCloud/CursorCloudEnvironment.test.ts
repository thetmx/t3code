import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cursorCloudSettings } from "./CursorCloudEnvironment.ts";

describe("cursorCloudSettings", () => {
  it("leaves Cursor on Cursor Cloud as the only provider and keeps the rest", () => {
    const settings = cursorCloudSettings(
      { theme: "dark", defaultModelSelection: { instanceId: "cursor", model: "composer-2.5" } },
      {
        [ProviderInstanceId.make("cursor")]: {
          driver: ProviderDriverKind.make("cursor"),
          config: { customModels: ["x"] },
        },
      },
    );
    const instances = Object.entries(settings.providerInstances);
    expect(instances.filter(([, instance]) => instance.enabled !== false)).toEqual([
      [
        "cursor",
        {
          driver: "cursor",
          displayName: "Cursor Cloud",
          enabled: true,
          config: { customModels: ["x"], runtime: "cloud" },
        },
      ],
    ]);
    expect(instances.length).toBeGreaterThan(1);
    expect(settings).toMatchObject({
      theme: "dark",
      defaultModelSelection: { instanceId: "cursor", model: "composer-2.5" },
    });
  });
});
