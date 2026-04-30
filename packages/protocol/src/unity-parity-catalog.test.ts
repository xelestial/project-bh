import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const REPO_ROOT = new URL("../../../", import.meta.url);
const CATALOG_FILE = new URL("docs/fixtures/unity-parity/asset-catalog.v1.json", REPO_ROOT);

interface UnityParityAssetCatalog {
  readonly catalogId: string;
  readonly version: 1;
  readonly generatedFor: "unity-parity";
  readonly assets: readonly {
    readonly id: string;
    readonly kind: string;
    readonly path: string;
    readonly consumer: readonly string[];
  }[];
}

test("Unity parity asset catalog references checked-in fixture files", () => {
  const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as UnityParityAssetCatalog;

  assert.equal(catalog.catalogId, "project-bh.unity-parity.asset-catalog.v1");
  assert.equal(catalog.version, 1);
  assert.equal(catalog.generatedFor, "unity-parity");
  assert.ok(catalog.assets.length >= 19);

  const requiredAssetIds = new Set([
    "scenario.auction-special-card-flow",
    "scenario.flame-bomb-removes-fence",
    "scenario.recovery-potion-clears-status",
    "scenario.jump-hook-mobility",
    "projection.charged-inventory-hud",
    "protocol.snapshot-sample",
    "protocol.server-rejection-catalog",
    "security.reconnect-token-contract",
    "runtime.redis-command-stream",
    "runtime.redis-event-stream"
  ]);

  const ids = new Set<string>();

  for (const asset of catalog.assets) {
    assert.equal(ids.has(asset.id), false, `Duplicate Unity parity asset id: ${asset.id}`);
    ids.add(asset.id);
    assert.ok(asset.path.startsWith("docs/fixtures/"), `Unexpected parity fixture path: ${asset.path}`);
    assert.ok(asset.consumer.length > 0, `Asset ${asset.id} needs at least one consumer.`);
    assert.equal(existsSync(new URL(asset.path, REPO_ROOT)), true, `Missing fixture file: ${asset.path}`);
    requiredAssetIds.delete(asset.id);
  }

  assert.deepEqual([...requiredAssetIds], []);
});
