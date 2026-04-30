import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REPLAY_EXPORT_FORMAT,
  validateReplayExport
} from "./replay-schema.ts";

const replayFixtureUrl = new URL(
  "../../../docs/fixtures/replays/five-round-command-log.v1.json",
  import.meta.url
);

test("replay export schema accepts the durable five-round command log fixture", () => {
  const fixture = JSON.parse(readFileSync(replayFixtureUrl, "utf8"));
  const result = validateReplayExport(fixture);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.value.format, REPLAY_EXPORT_FORMAT);
    assert.equal(result.value.commands.length, 5);
    assert.equal(result.value.events.length, 5);
    assert.equal(result.value.finalRevision, 5);
  }
});

test("replay export schema rejects invalid command payloads", () => {
  const fixture = JSON.parse(readFileSync(replayFixtureUrl, "utf8"));
  fixture.commands[0].payload.type = "match.notReal";

  const result = validateReplayExport(fixture);

  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown command type/);
});
