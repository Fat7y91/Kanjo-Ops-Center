import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const { buildSocialSummary } = loadTsModule(
  path.join(projectRoot, "src/lib/marketing/social/summary.ts"),
);

function row(overrides = {}) {
  return {
    id: "m1",
    platform: "meta",
    accountId: "page-1",
    accountName: "Kanjo",
    followers: 100,
    likes: 0,
    capturedAt: "2026-11-14T09:00:00.000Z",
    ...overrides,
  };
}

test("empty input returns the empty summary", () => {
  const summary = buildSocialSummary([]);
  assert.deepEqual(summary, {
    followers: 0,
    likes: 0,
    capturedAt: null,
    trend: [],
    accounts: [],
  });
});

test("latest snapshot wins and delta is measured from the window start", () => {
  const summary = buildSocialSummary([
    row({ id: "a1", followers: 100, capturedAt: "2026-11-14T09:00:00.000Z" }),
    row({ id: "a2", followers: 140, capturedAt: "2026-11-15T09:00:00.000Z" }),
    row({
      id: "i1",
      platform: "instagram",
      accountId: "ig-1",
      accountName: "kanjo.app.eg",
      followers: 200,
      capturedAt: "2026-11-14T09:00:00.000Z",
    }),
    row({
      id: "i2",
      platform: "instagram",
      accountId: "ig-1",
      accountName: "kanjo.app.eg",
      followers: 250,
      capturedAt: "2026-11-15T09:00:00.000Z",
    }),
  ]);

  assert.equal(summary.followers, 390);
  assert.equal(summary.accounts[0].platform, "instagram");
  assert.equal(summary.accounts[0].followers, 250);
  assert.equal(summary.accounts[0].delta, 50);
  assert.equal(summary.accounts[1].delta, 40);
  assert.equal(summary.capturedAt, "2026-11-15T09:00:00.000Z");
});

test("the trend carries the last known count for each account per day", () => {
  const summary = buildSocialSummary([
    row({ id: "a1", followers: 100, capturedAt: "2026-11-14T09:00:00.000Z" }),
    row({ id: "a2", followers: 120, capturedAt: "2026-11-15T09:00:00.000Z" }),
    row({ id: "a3", followers: 150, capturedAt: "2026-11-16T09:00:00.000Z" }),
    row({
      id: "i1",
      platform: "instagram",
      accountId: "ig-1",
      followers: 200,
      capturedAt: "2026-11-14T09:00:00.000Z",
    }),
    row({
      id: "i2",
      platform: "instagram",
      accountId: "ig-1",
      followers: 220,
      capturedAt: "2026-11-16T09:00:00.000Z",
    }),
  ]);

  assert.deepEqual(summary.trend, [300, 320, 370]);
});

test("two reads on the same day use the later count for that day", () => {
  const summary = buildSocialSummary([
    row({ id: "a1", followers: 100, capturedAt: "2026-11-14T09:00:00.000Z" }),
    row({ id: "a2", followers: 110, capturedAt: "2026-11-14T18:00:00.000Z" }),
  ]);

  assert.deepEqual(summary.trend, [110]);
  assert.equal(summary.followers, 110);
  assert.equal(summary.accounts[0].delta, 0);
});
