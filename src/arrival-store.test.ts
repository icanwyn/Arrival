import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  brandEventId,
  brandIsoInstant,
  brandNonEmpty,
  brandQrToken,
  brandSessionId,
  brandTapId,
  brandTeamId,
  parseRosterCsv,
  type CheckInEvent,
  type Session,
} from "./arrival";
import { libsqlStore } from "./arrival-store";

const TAP_A = "11111111-1111-4111-8111-111111111111";
const TAP_B = "22222222-2222-4222-a222-222222222222";
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("libsqlStore", () => {
  it("keeps a single check-in when a second tap is stale or reuses the tap id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arrival-"));
    dirs.push(dir);
    const client = createClient({ url: `file:${join(dir, "arrival.db")}` });
    try {
      const store = libsqlStore(client);
      const team = { id: brandTeamId("team-hawks"), name: brandNonEmpty("Hawks") };
      await store.insertTeam(team);

      const parsed = parseRosterCsv(
        "first_name,last_name,age,gender,parent_email\nMaya,Chen,11,Girl,maya@example.com",
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const applied = await store.applyRoster(team.id, parsed.rows, 0);
      expect(applied).toMatchObject({
        ok: true,
        roster: [
          {
            firstName: "Maya",
            lastName: "Chen",
            age: 11,
            pin: "0000",
          },
        ],
      });
      if (!applied.ok) return;
      const student = applied.roster[0];

      const session: Session = {
        id: brandSessionId("session-1"),
        teamId: team.id,
        label: brandNonEmpty("2026-10-01"),
        token: brandQrToken("a".repeat(64)),
        status: "open",
      };
      await store.insertSession(session);
      const duplicate: Session = {
        ...session,
        id: brandSessionId("session-2"),
        token: brandQrToken("b".repeat(64)),
      };
      await expect(store.insertSession(duplicate)).rejects.toThrow("team already has an open session");
      expect((await store.listSessions(team.id)).map((item) => item.id)).toEqual(["session-1"]);

      expect(await columnNames(client, "students")).toEqual([
        "id",
        "team_id",
        "first_name",
        "last_name",
        "age",
        "gender",
        "parent_email",
        "pin",
      ]);
      expect(await columnNames(client, "events")).toEqual([
        "id",
        "session_id",
        "student_id",
        "kind",
        "at",
        "tap_id",
        "prev_id",
      ]);

      const checkIn: CheckInEvent = {
        id: brandEventId("evt-in"),
        sessionId: session.id,
        studentId: student.id,
        at: brandIsoInstant("2026-10-01T15:00:00.000Z"),
        tapId: brandTapId(TAP_A),
        kind: "check_in",
        prev: null,
      };
      expect(await store.commitTap(checkIn)).toEqual({
        kind: "appended",
        event: checkIn,
      });

      const stale: CheckInEvent = {
        ...checkIn,
        id: brandEventId("evt-stale"),
        tapId: brandTapId(TAP_B),
      };
      const raced = await store.commitTap(stale);
      expect(raced).toEqual({
        kind: "already",
        pair: { head: checkIn, prev: null },
      });
      expect(await store.commitTap(checkIn)).toEqual({
        kind: "replay",
        event: checkIn,
        pair: { head: checkIn, prev: null },
      });
      expect(await eventCount(client)).toBe(1);
      expect(await store.listHeads(session.id)).toEqual([
        { studentId: student.id, pair: { head: checkIn, prev: null } },
      ]);
    } finally {
      client.close();
    }
  });
});

async function columnNames(client: Client, table: string): Promise<string[]> {
  const result = await client.execute(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`);
  return result.rows.map((row) => String(row.name));
}

async function eventCount(client: Client): Promise<number> {
  const result = await client.execute("SELECT COUNT(*) AS n FROM events");
  const value = result.rows[0]?.n;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  throw new Error("missing count");
}
