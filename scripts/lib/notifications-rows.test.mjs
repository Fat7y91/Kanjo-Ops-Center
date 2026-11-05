import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { loadTsModule, projectRoot } from "./load-ts.mjs";

const rows = loadTsModule(
  path.join(projectRoot, "src/lib/notifications/rows.ts"),
);

const { mapNotificationRows, sortByRecency, toNotification } = rows;

const CANONICAL = {
  id: "2f0f1a3c-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
  user_id: "7f1e2d3c-4b5a-4968-8776-655443322110",
  title: "تم اعتماد العميل",
  body: "العميل الجديد أصبح نشطاً.",
  icon: "check",
  color: "green",
  kind: "task",
  task_id: "T-91",
  link: "/merchants",
  is_read: false,
  read_at: null,
  occurred_at: "2026-11-04T09:30:00.000Z",
  created_at: "2026-11-04T09:31:00.000Z",
};

const noAcks = new Map();

test("a canonical row maps every field", () => {
  const notification = toNotification(CANONICAL, noAcks);

  assert.equal(notification.id, CANONICAL.id);
  assert.equal(notification.userId, CANONICAL.user_id);
  assert.equal(notification.title, "تم اعتماد العميل");
  assert.equal(notification.kind, "task");
  assert.equal(notification.taskId, "T-91");
  assert.equal(notification.link, "/merchants");
  assert.equal(notification.isRead, false);
  assert.equal(notification.readAt, null);
  assert.equal(notification.occurredAt, "2026-11-04T09:30:00.000Z");
});

test("a hand-made table without optional columns still renders", () => {
  const notification = toNotification(
    {
      id: "5c3b2a19-8f7e-4d6c-9b5a-1f2e3d4c5b6a",
      user_id: null,
      title: "إعلان",
      is_read: false,
    },
    noAcks,
  );

  assert.equal(notification.body, "");
  assert.equal(notification.icon, "");
  assert.equal(notification.color, "");
  assert.equal(notification.kind, "system");
  assert.equal(notification.taskId, null);
  assert.equal(notification.link, "");
  assert.equal(notification.isRead, false);
  assert.equal(Number.isNaN(Date.parse(notification.occurredAt)), false);
  assert.equal(notification.createdAt, notification.occurredAt);
});

test("occurred_at falls back to created_at when the column is absent", () => {
  const notification = toNotification(
    {
      id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      title: "مهمة",
      created_at: "2026-10-01T12:00:00.000Z",
    },
    noAcks,
  );

  assert.equal(notification.occurredAt, "2026-10-01T12:00:00.000Z");
});

test("a broadcast is read only for the viewer holding an acknowledgement", () => {
  const broadcast = toNotification(
    { ...CANONICAL, user_id: null, is_read: true, read_at: null },
    noAcks,
  );
  assert.equal(broadcast.isRead, false, "row-level is_read never covers a broadcast");

  const ackAt = "2026-11-05T07:00:00.000Z";
  const acknowledged = toNotification(
    { ...CANONICAL, user_id: null, is_read: false },
    new Map([[CANONICAL.id, ackAt]]),
  );
  assert.equal(acknowledged.isRead, true);
  assert.equal(acknowledged.readAt, ackAt);
});

test("string and numeric truthiness are normalised", () => {
  const fromString = toNotification({ ...CANONICAL, is_read: "true" }, noAcks);
  assert.equal(fromString.isRead, true);

  const fromTimestamp = toNotification(
    { ...CANONICAL, is_read: false, read_at: "2026-11-04T10:00:00.000Z" },
    noAcks,
  );
  assert.equal(fromTimestamp.isRead, true);
});

test("rows without an id are dropped, never keyed by an empty string", () => {
  const mapped = mapNotificationRows(
    [{ title: "بلا معرّف" }, CANONICAL, { id: "" }],
    noAcks,
  );

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].id, CANONICAL.id);
});

test("recency sort is newest first and does not mutate its input", () => {
  const older = toNotification(
    { ...CANONICAL, id: "id-older", occurred_at: "2026-11-01T00:00:00.000Z" },
    noAcks,
  );
  const newer = toNotification(
    { ...CANONICAL, id: "id-newer", occurred_at: "2026-11-05T00:00:00.000Z" },
    noAcks,
  );

  const input = [older, newer];
  const sorted = sortByRecency(input);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["id-newer", "id-older"],
  );
  assert.deepEqual(
    input.map((item) => item.id),
    ["id-older", "id-newer"],
  );
});
