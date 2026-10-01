import { describe, expect, it } from "vitest";
import {
  allocatePin,
  bindArrival,
  boardRows,
  brandAge,
  brandEmail,
  brandEventId,
  brandIsoInstant,
  brandNonEmpty,
  brandPin,
  brandQrToken,
  brandSessionId,
  brandStudentId,
  brandTapId,
  brandTeamId,
  decideTap,
  linkHead,
  nextAttendance,
  OpenSessionConflict,
  parseRosterCsv,
  planRoster,
  presenceFromHead,
  type ArrivalStore,
  type AttendanceEvent,
  type CheckInEvent,
  type CheckOutEvent,
  type Entropy,
  type HeadPair,
  type HeadSnapshot,
  type IsoInstant,
  type Pin,
  type Session,
  type Student,
  type StudentId,
  type TeamId,
} from "./arrival";

const TEAM = brandTeamId("team-hawks");
const AT_IN = brandIsoInstant("2026-10-01T15:00:00.000Z");
const AT_OUT = brandIsoInstant("2026-10-01T17:30:00.000Z");
const TAP_A = "11111111-1111-4111-8111-111111111111";
const TAP_B = "22222222-2222-4222-a222-222222222222";

function kid(input: {
  id: string;
  first: string;
  last: string;
  age?: number;
  gender?: string;
  email?: string;
  pin: string;
  teamId?: TeamId;
}): Student {
  return {
    id: brandStudentId(input.id),
    teamId: input.teamId ?? TEAM,
    firstName: brandNonEmpty(input.first),
    lastName: brandNonEmpty(input.last),
    age: brandAge(input.age ?? 11),
    gender: brandNonEmpty(input.gender ?? "Girl"),
    parentEmail: brandEmail(input.email ?? `${input.first}.${input.last}@example.com`.toLowerCase()),
    pin: brandPin(input.pin),
  };
}

function draft(id: string, tap: string, at: IsoInstant = AT_IN) {
  return {
    id: brandEventId(id),
    sessionId: brandSessionId("session-1"),
    studentId: brandStudentId("stu-maya"),
    at,
    tapId: brandTapId(tap),
  };
}

function checkIn(
  id: string,
  tap: string,
  prev: CheckInEvent["prev"] = null,
  at: IsoInstant = AT_IN,
): CheckInEvent {
  return { ...draft(id, tap, at), kind: "check_in", prev };
}

function checkOut(id: string, tap: string, prevId: string, at: IsoInstant = AT_OUT): CheckOutEvent {
  return {
    ...draft(id, tap, at),
    kind: "check_out",
    prev: { id: brandEventId(prevId), kind: "check_in" },
  };
}

function ids(values: string[]): () => StudentId {
  let index = 0;
  return () => brandStudentId(values[index++] ?? `stu-extra-${index}`);
}

function csv(body: string): string {
  return `first_name,last_name,age,gender,parent_email\n${body}`;
}

describe("parseRosterCsv", () => {
  it("reads one data row", () => {
    const parsed = parseRosterCsv(
      csv("Maya,Chen,11,Girl,maya@example.com"),
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          firstName: "Maya",
          lastName: "Chen",
          age: 11,
          gender: "Girl",
          parentEmail: "maya@example.com",
        },
      ],
    });
  });

  it("trims fields, ignores a BOM, extra columns, and blank lines", () => {
    const parsed = parseRosterCsv(
      `\uFEFFfirst_name,last_name,age,gender,parent_email,note\r\n\r\n  Maya , Chen , 11 , Girl , maya@example.com , captain\r\n`,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      {
        line: 3,
        firstName: "Maya",
        lastName: "Chen",
        age: 11,
        gender: "Girl",
        parentEmail: "maya@example.com",
      },
    ]);
  });

  it("keeps a quoted comma inside a name", () => {
    const parsed = parseRosterCsv(csv('"Chen, Jr",Maya,11,Girl,maya@example.com'));
    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          firstName: "Chen, Jr",
          lastName: "Maya",
          age: 11,
          gender: "Girl",
          parentEmail: "maya@example.com",
        },
      ],
    });
  });

  it("accepts a header-only file and ages 1 and 99", () => {
    expect(parseRosterCsv("first_name,last_name,age,gender,parent_email\n")).toEqual({
      ok: true,
      rows: [],
    });
    const parsed = parseRosterCsv(
      csv("Ada,Lovelace,1,Girl,ada@example.com\nGrace,Hopper,99,Girl,grace@example.com"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((row) => row.age)).toEqual([1, 99]);
  });

  it("rejects an empty name, a bad age, and a missing column", () => {
    expect(parseRosterCsv(csv(",Chen,11,Girl,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "First name is required" }],
    });
    expect(parseRosterCsv(csv("Maya,,11,Girl,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Last name is required" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11,,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Gender is required" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,0,Girl,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Age must be an integer from 1 through 99" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,100,Girl,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Age must be an integer from 1 through 99" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11.5,Girl,maya@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Age must be an integer from 1 through 99" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11,Girl,maya"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Parent email is invalid" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11,Girl,@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Parent email is invalid" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11,Girl,maya@"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Parent email is invalid" }],
    });
    expect(parseRosterCsv(csv("Maya,Chen,11,Girl,maya@@example.com"))).toEqual({
      ok: false,
      errors: [{ line: 2, message: "Parent email is invalid" }],
    });
    expect(parseRosterCsv("first_name,last_name,gender,parent_email\nMaya,Chen,Girl,maya@example.com")).toEqual({
      ok: false,
      errors: [{ line: 1, message: "Missing column age" }],
    });
    expect(parseRosterCsv("")).toEqual({
      ok: false,
      errors: [{ line: 1, message: "Header is required" }],
    });
  });

  it("rejects the 201st data row", () => {
    const lines = ["first_name,last_name,age,gender,parent_email"];
    for (let index = 1; index <= 201; index += 1) {
      lines.push(`Kid${index},Last,10,Girl,kid${index}@example.com`);
    }
    const parsed = parseRosterCsv(lines.join("\n"));
    expect(parsed).toEqual({
      ok: false,
      errors: [{ line: 202, message: "More than 200 kids" }],
    });

    const okLines = lines.slice(0, 201);
    const accepted = parseRosterCsv(okLines.join("\n"));
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.rows).toHaveLength(200);
    expect(accepted.rows[0]).toMatchObject({ firstName: "Kid1", age: 10 });
    expect(accepted.rows[199]).toMatchObject({ firstName: "Kid200", line: 201 });
  });
});

describe("allocatePin", () => {
  it("starts at start modulo 10000 and skips used pins", () => {
    expect(allocatePin(new Set(), 0)).toBe("0000");
    expect(allocatePin(new Set([brandPin("0000")]), 0)).toBe("0001");
    expect(allocatePin(new Set([brandPin("9998"), brandPin("9999"), brandPin("0000")]), 9998)).toBe(
      "0001",
    );
    expect(allocatePin(new Set(), -1)).toBe("9999");
  });

  it("returns null only when every pin is used", () => {
    const used = new Set<Pin>();
    for (let index = 0; index < 10000; index += 1) {
      used.add(brandPin(String(index).padStart(4, "0")));
    }
    expect(allocatePin(used, 1234)).toBeNull();
    used.delete(brandPin("4242"));
    expect(allocatePin(used, 4240)).toBe("4242");
  });
});

describe("planRoster", () => {
  it("gives two new students different 4 digit pins and sorts by last name", () => {
    const parsed = parseRosterCsv(
      csv("Ada,Lovelace,12,Girl,ada@example.com\nGrace,Hopper,13,Girl,grace@example.com"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planRoster(TEAM, [], parsed.rows, 7, ids(["stu-ada", "stu-grace"]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.insert.map((student) => student.pin)).toEqual(["0007", "0008"]);
    expect(plan.insert[0].pin).toMatch(/^\d{4}$/);
    expect(plan.insert[1].pin).toMatch(/^\d{4}$/);
    expect(plan.insert[0].pin).not.toBe(plan.insert[1].pin);
    expect(plan.roster.map((student) => [student.lastName, student.firstName, student.pin])).toEqual([
      ["Hopper", "Grace", "0008"],
      ["Lovelace", "Ada", "0007"],
    ]);
    expect(plan.roster[0]).toMatchObject({
      id: "stu-grace",
      teamId: "team-hawks",
      age: 13,
      gender: "Girl",
      parentEmail: "grace@example.com",
    });
  });

  it("plans one student from one parsed row", () => {
    const parsed = parseRosterCsv(csv("Maya,Chen,11,Girl,maya@example.com"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planRoster(TEAM, [], parsed.rows, 0, ids(["stu-maya"]));
    expect(plan).toEqual({
      ok: true,
      insert: [
        {
          id: "stu-maya",
          teamId: "team-hawks",
          firstName: "Maya",
          lastName: "Chen",
          age: 11,
          gender: "Girl",
          parentEmail: "maya@example.com",
          pin: "0000",
        },
      ],
      update: [],
      roster: [
        {
          id: "stu-maya",
          teamId: "team-hawks",
          firstName: "Maya",
          lastName: "Chen",
          age: 11,
          gender: "Girl",
          parentEmail: "maya@example.com",
          pin: "0000",
        },
      ],
    });
    if (!plan.ok) return;
    expect(plan.roster[0].pin).toMatch(/^\d{4}$/);
  });

  it("keeps id and PIN on a match, updates age gender and email, and keeps omitted kids", () => {
    const existing = [
      kid({
        id: "stu-maya",
        first: "Maya",
        last: "Chen",
        age: 10,
        email: "MAYA@example.com",
        pin: "1111",
      }),
      kid({ id: "stu-zoe", first: "Zoe", last: "Adams", age: 9, email: "zoe@example.com", pin: "2222" }),
    ];
    const parsed = parseRosterCsv(csv("maya,chen,12,Nonbinary,maya@example.com"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planRoster(TEAM, existing, parsed.rows, 0, ids(["unused"]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      {
        id: "stu-maya",
        age: 12,
        gender: "Nonbinary",
        parentEmail: "maya@example.com",
      },
    ]);
    expect(plan.roster).toEqual([
      kid({ id: "stu-zoe", first: "Zoe", last: "Adams", age: 9, email: "zoe@example.com", pin: "2222" }),
      kid({
        id: "stu-maya",
        first: "Maya",
        last: "Chen",
        age: 12,
        gender: "Nonbinary",
        email: "maya@example.com",
        pin: "1111",
      }),
    ]);
  });

  it("does not give a new kid a PIN already on the team", () => {
    const existing = [
      kid({ id: "stu-zoe", first: "Zoe", last: "Adams", email: "zoe@example.com", pin: "0000" }),
    ];
    const parsed = parseRosterCsv(csv("Maya,Chen,11,Girl,maya@example.com"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const plan = planRoster(TEAM, existing, parsed.rows, 0, ids(["stu-maya"]));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.insert.map((student) => student.pin)).toEqual(["0001"]);
  });

  it("fails two CSV rows that share a name and email", () => {
    const parsed = parseRosterCsv(
      csv("Maya,Chen,11,Girl,maya@example.com\nmaya,chen,12,Girl,MAYA@example.com"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(planRoster(TEAM, [], parsed.rows, 0, ids(["stu-1", "stu-2"]))).toEqual({
      ok: false,
      reason: "invalid",
      errors: [{ line: 3, message: "Duplicate kid" }],
    });
  });

  it("fails a duplicate PIN in the occupied set and two saved kids with one key", () => {
    const duplicatePin = [
      kid({ id: "stu-a", first: "Ada", last: "Lovelace", email: "ada@example.com", pin: "0001" }),
      kid({ id: "stu-b", first: "Grace", last: "Hopper", email: "grace@example.com", pin: "0001" }),
    ];
    const parsed = parseRosterCsv(csv("Maya,Chen,11,Girl,maya@example.com"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(planRoster(TEAM, duplicatePin, parsed.rows, 0, ids(["stu-maya"]))).toEqual({
      ok: false,
      reason: "invalid",
      errors: [{ line: 0, message: "Duplicate PIN" }],
    });

    const duplicateKey = [
      kid({ id: "stu-a", first: "Maya", last: "Chen", email: "maya@example.com", pin: "0001" }),
      kid({ id: "stu-b", first: "maya", last: "chen", email: "MAYA@example.com", pin: "0002" }),
    ];
    expect(planRoster(TEAM, duplicateKey, [], 0, ids([]))).toEqual({
      ok: false,
      reason: "invalid",
      errors: [{ line: 0, message: "Two saved kids share a name and email" }],
    });
  });

  it("returns pin_space_exhausted when a new row needs a pin and none remain", () => {
    const existing: Student[] = [];
    for (let index = 0; index < 10000; index += 1) {
      existing.push(
        kid({
          id: `stu-${index}`,
          first: `Kid${index}`,
          last: "Roster",
          email: `kid${index}@example.com`,
          pin: String(index).padStart(4, "0"),
        }),
      );
    }
    const parsed = parseRosterCsv(csv("New,Kid,9,Girl,new@example.com"));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(planRoster(TEAM, existing, parsed.rows, 0, ids(["stu-new"]))).toEqual({
      ok: false,
      reason: "pin_space_exhausted",
    });
  });
});

describe("presenceFromHead", () => {
  it("maps null to not yet arrived", () => {
    expect(presenceFromHead(null)).toEqual({ kind: "not_yet_arrived" });
  });

  it("maps a check-in head to checked in", () => {
    const head = checkIn("evt-in", TAP_A);
    expect(presenceFromHead({ head, prev: null })).toEqual({
      kind: "checked_in",
      since: { id: "evt-in", at: "2026-10-01T15:00:00.000Z" },
    });
  });

  it("maps a check-out head to checked out with both times", () => {
    const arrived = checkIn("evt-in", TAP_A);
    const left = checkOut("evt-out", TAP_B, "evt-in");
    expect(presenceFromHead({ head: left, prev: arrived })).toEqual({
      kind: "checked_out",
      arrived: { id: "evt-in", at: "2026-10-01T15:00:00.000Z" },
      left: { id: "evt-out", at: "2026-10-01T17:30:00.000Z" },
    });
  });
});

describe("nextAttendance", () => {
  it("checks in from not yet arrived and from checked out, and checks out from checked in", () => {
    const base = draft("evt-next", TAP_B, AT_OUT);
    expect(nextAttendance({ kind: "not_yet_arrived" }, base)).toEqual({
      ...base,
      kind: "check_in",
      prev: null,
    });
    expect(
      nextAttendance(
        { kind: "checked_in", since: { id: brandEventId("evt-in"), at: AT_IN } },
        base,
      ),
    ).toEqual({
      ...base,
      kind: "check_out",
      prev: { id: "evt-in", kind: "check_in" },
    });
    expect(
      nextAttendance(
        {
          kind: "checked_out",
          arrived: { id: brandEventId("evt-in"), at: AT_IN },
          left: { id: brandEventId("evt-out"), at: AT_OUT },
        },
        draft("evt-back", TAP_A, brandIsoInstant("2026-10-01T18:00:00.000Z")),
      ),
    ).toEqual({
      ...draft("evt-back", TAP_A, brandIsoInstant("2026-10-01T18:00:00.000Z")),
      kind: "check_in",
      prev: { id: "evt-out", kind: "check_out" },
    });
  });
});

describe("linkHead", () => {
  it("links a check-in with no prev and a check-out to its check-in", () => {
    const arrived = checkIn("evt-in", TAP_A);
    const left = checkOut("evt-out", TAP_B, "evt-in");
    expect(linkHead(arrived, null)).toEqual({ head: arrived, prev: null });
    expect(linkHead(left, arrived)).toEqual({ head: left, prev: arrived });
  });

  it("rejects a check-out with no check-in prev and a check-in whose prev is a check-in", () => {
    const arrived = checkIn("evt-in", TAP_A);
    const other = checkIn("evt-other", TAP_B);
    const left = checkOut("evt-out", TAP_B, "evt-in");
    const mislinked: CheckInEvent = {
      ...checkIn("evt-bad", TAP_A),
      prev: { id: brandEventId("evt-other"), kind: "check_out" },
    };
    expect(() => linkHead(left, null)).toThrow("corrupt attendance head");
    expect(() => linkHead(mislinked, other)).toThrow("corrupt attendance head");
    expect(() => linkHead(left, { ...arrived, id: brandEventId("evt-nope") })).toThrow(
      "corrupt attendance head",
    );
  });
});

describe("decideTap", () => {
  const arrived = checkIn("evt-in", TAP_A);
  const pair: HeadPair = { head: arrived, prev: null };

  it("inserts when the head matches", () => {
    const proposed = nextAttendance(presenceFromHead(null), draft("evt-in", TAP_A));
    const snap: HeadSnapshot = { kind: "current", session: "open", pair: null };
    expect(decideTap(snap, proposed)).toEqual({
      action: "insert",
      event: proposed,
      commit: { kind: "appended", event: proposed },
    });

    const checkout = nextAttendance(presenceFromHead(pair), draft("evt-out", TAP_B, AT_OUT));
    expect(decideTap({ kind: "current", session: "open", pair }, checkout)).toEqual({
      action: "insert",
      event: checkout,
      commit: { kind: "appended", event: checkout },
    });
  });

  it("returns already on a mismatched head and does not ask for a new kind", () => {
    const stale = checkIn("evt-stale", TAP_B);
    const decision = decideTap({ kind: "current", session: "open", pair }, stale);
    expect(decision).toEqual({
      action: "none",
      commit: { kind: "already", pair },
    });
    expect(decision.action).toBe("none");
    if (decision.commit.kind !== "already") throw new Error("expected already");
    expect(decision.commit.pair.head.kind).toBe("check_in");
    expect(decision.commit.pair.head.id).toBe("evt-in");
  });

  it("returns replay for the same tap id, including after the session closes", () => {
    const proposed = checkOut("evt-other", TAP_A, "evt-in");
    const snap: HeadSnapshot = {
      kind: "recorded",
      session: "closed",
      tap: arrived,
      pair,
    };
    expect(decideTap(snap, proposed)).toEqual({
      action: "none",
      commit: { kind: "replay", event: arrived, pair },
    });
  });

  it("returns closed for a new tap when the session is not open", () => {
    const proposed = checkIn("evt-in", TAP_A);
    expect(
      decideTap({ kind: "current", session: "closed", pair: null }, proposed),
    ).toEqual({ action: "none", commit: { kind: "closed" } });
    expect(
      decideTap({ kind: "current", session: "missing", pair: null }, proposed),
    ).toEqual({ action: "none", commit: { kind: "closed" } });
  });

  it("rejects a proposal that names a prev when the chain is empty", () => {
    const proposed = checkOut("evt-out", TAP_B, "evt-missing");
    expect(decideTap({ kind: "current", session: "open", pair: null }, proposed)).toEqual({
      action: "none",
      commit: { kind: "rejected" },
    });
  });
});

describe("boardRows", () => {
  it("derives status from heads, drops unknown students, and sorts by name", () => {
    const maya = kid({
      id: "stu-maya",
      first: "Maya",
      last: "Chen",
      age: 11,
      gender: "Girl",
      email: "maya@example.com",
      pin: "1111",
    });
    const zoe = kid({
      id: "stu-zoe",
      first: "Zoe",
      last: "Adams",
      age: 9,
      gender: "Girl",
      email: "zoe@example.com",
      pin: "2222",
    });
    const arrived = checkIn("evt-in", TAP_A);
    arrived satisfies AttendanceEvent;
    const rows = boardRows(
      [maya, zoe],
      [
        { studentId: brandStudentId("stu-maya"), pair: { head: arrived, prev: null } },
        {
          studentId: brandStudentId("stu-missing"),
          pair: { head: checkOut("evt-out", TAP_B, "evt-in"), prev: arrived },
        },
      ],
    );
    expect(rows).toEqual([
      {
        studentId: "stu-zoe",
        firstName: "Zoe",
        lastName: "Adams",
        age: 9,
        gender: "Girl",
        status: "not_yet_arrived",
      },
      {
        studentId: "stu-maya",
        firstName: "Maya",
        lastName: "Chen",
        age: 11,
        gender: "Girl",
        status: "checked_in",
        checkInAt: "2026-10-01T15:00:00.000Z",
      },
    ]);
  });

  it("shows this visit's check-in and check-out times", () => {
    const maya = kid({
      id: "stu-maya",
      first: "Maya",
      last: "Chen",
      email: "maya@example.com",
      pin: "1111",
    });
    const arrived = checkIn("evt-in", TAP_A);
    const left = checkOut("evt-out", TAP_B, "evt-in");
    expect(
      boardRows([maya], [{ studentId: maya.id, pair: { head: left, prev: arrived } }]),
    ).toEqual([
      {
        studentId: "stu-maya",
        firstName: "Maya",
        lastName: "Chen",
        age: 11,
        gender: "Girl",
        status: "checked_out",
        checkInAt: "2026-10-01T15:00:00.000Z",
        checkOutAt: "2026-10-01T17:30:00.000Z",
      },
    ]);
  });
});

function entropy(pins = 0): Entropy {
  const sequence = ["id-1", "id-2", "id-3"];
  let index = 0;
  return {
    id: () => sequence[index++] ?? `id-${index}`,
    token: () => "a".repeat(64),
    pinStart: () => pins,
    now: () => AT_OUT,
  };
}

function store(partial: Partial<ArrivalStore>): ArrivalStore {
  const fail = async (): Promise<never> => {
    throw new Error("unexpected store call");
  };
  return {
    insertTeam: fail,
    listTeams: async () => [],
    getTeam: async () => null,
    listStudents: async () => [],
    applyRoster: fail,
    insertSession: fail,
    listSessions: async () => [],
    getSession: async () => null,
    findSessionByToken: async () => null,
    closeSession: async () => null,
    findStudentByPin: async () => null,
    peekHead: fail,
    commitTap: fail,
    listHeads: async () => [],
    ...partial,
  };
}

describe("bindArrival", () => {
  it("rejects a blank team name and stores a trimmed name", async () => {
    let inserted: { id: string; name: string } | null = null;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        insertTeam: async (team) => {
          inserted = { id: team.id, name: team.name };
        },
      }),
    });
    expect(await arrival.createTeam({ name: "   " })).toEqual({
      ok: false,
      reason: "invalid_name",
    });
    expect(inserted).toBeNull();
    expect(await arrival.createTeam({ name: "  Hawks  " })).toEqual({
      ok: true,
      id: "id-1",
      name: "Hawks",
    });
    expect(inserted).toEqual({ id: "id-1", name: "Hawks" });
  });

  it("returns the open session instead of inserting another", async () => {
    const open: Session = {
      id: brandSessionId("session-open"),
      teamId: TEAM,
      label: brandNonEmpty("Wednesday"),
      token: brandQrToken("token-open"),
      status: "open",
    };
    let inserted = 0;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        getTeam: async () => ({ id: TEAM, name: brandNonEmpty("Hawks") }),
        listSessions: async () => [open],
        insertSession: async () => {
          inserted += 1;
        },
      }),
    });
    expect(await arrival.openSession({ teamId: "team-hawks", label: "Thursday" })).toEqual({
      ok: true,
      sessionId: "session-open",
      label: "Wednesday",
      token: "token-open",
      status: "open",
    });
    expect(inserted).toBe(0);
  });

  it("adopts the open session when insert loses the race", async () => {
    const open: Session = {
      id: brandSessionId("session-open"),
      teamId: TEAM,
      label: brandNonEmpty("Wednesday"),
      token: brandQrToken("token-open"),
      status: "open",
    };
    let listed = 0;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        getTeam: async () => ({ id: TEAM, name: brandNonEmpty("Hawks") }),
        listSessions: async () => {
          listed += 1;
          return listed === 1 ? [] : [open];
        },
        insertSession: async () => {
          throw new OpenSessionConflict();
        },
      }),
    });
    expect(await arrival.openSession({ teamId: "team-hawks", label: "Thursday" })).toEqual({
      ok: true,
      sessionId: "session-open",
      label: "Wednesday",
      token: "token-open",
      status: "open",
    });
  });

  it("does not write for a bad csv or an unknown team", async () => {
    let applied = 0;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        getTeam: async () => null,
        applyRoster: async () => {
          applied += 1;
          throw new Error("wrote");
        },
      }),
    });
    expect(
      await arrival.importRoster({ teamId: "missing", csvText: csv("Maya,Chen,11,Girl,maya@example.com") }),
    ).toEqual({ ok: false, reason: "unknown_team" });
    expect(await arrival.importRoster({ teamId: "missing", csvText: "nope" })).toEqual({
      ok: false,
      reason: "invalid_csv",
      errors: [
        { line: 1, message: "Missing column first_name" },
        { line: 1, message: "Missing column last_name" },
        { line: 1, message: "Missing column age" },
        { line: 1, message: "Missing column gender" },
        { line: 1, message: "Missing column parent_email" },
      ],
    });
    expect(applied).toBe(0);
  });

  it("returns before a write for a bad pin, unknown token, unknown pin, and a closed session", async () => {
    const maya = kid({
      id: "stu-maya",
      first: "Maya",
      last: "Chen",
      email: "maya@example.com",
      pin: "1111",
    });
    let commits = 0;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        findSessionByToken: async (token) => {
          if (token !== "token-open") return null;
          return {
            id: brandSessionId("session-1"),
            teamId: TEAM,
            label: brandNonEmpty("Thursday"),
            token,
            status: "open",
          };
        },
        findStudentByPin: async (_teamId, pin) => (pin === "1111" ? maya : null),
        peekHead: async () => ({ kind: "current", session: "closed", pair: null }),
        commitTap: async () => {
          commits += 1;
          throw new Error("wrote");
        },
      }),
    });

    expect(
      await arrival.presentPin({ token: "token-open", pin: "123", tapId: TAP_A }),
    ).toEqual({ ok: false, reason: "malformed_pin" });
    expect(
      await arrival.presentPin({ token: "token-open", pin: "12a4", tapId: TAP_A }),
    ).toEqual({ ok: false, reason: "malformed_pin" });
    expect(
      await arrival.presentPin({ token: "token-open", pin: "1111", tapId: "not-a-tap" }),
    ).toEqual({ ok: false, reason: "malformed_tap" });
    expect(
      await arrival.presentPin({ token: "missing", pin: "1111", tapId: TAP_A }),
    ).toEqual({ ok: false, reason: "unknown_token" });
    expect(
      await arrival.presentPin({ token: "token-open", pin: "9999", tapId: TAP_A }),
    ).toEqual({ ok: false, reason: "unknown_pin" });
    expect(
      await arrival.presentPin({ token: "token-open", pin: "1111", tapId: TAP_A }),
    ).toEqual({ ok: false, reason: "session_closed" });
    expect(commits).toBe(0);
  });

  it("checks out on a new tap id when the child is already checked in", async () => {
    const maya = kid({
      id: "stu-maya",
      first: "Maya",
      last: "Chen",
      email: "maya@example.com",
      pin: "1111",
    });
    const arrived = checkIn("evt-in", TAP_A);
    let proposed: AttendanceEvent | null = null;
    const arrival = bindArrival({
      entropy: entropy(),
      store: store({
        findSessionByToken: async () => ({
          id: brandSessionId("session-1"),
          teamId: TEAM,
          label: brandNonEmpty("Thursday"),
          token: brandQrToken("token-open"),
          status: "open",
        }),
        findStudentByPin: async () => maya,
        peekHead: async () => ({
          kind: "current",
          session: "open",
          pair: { head: arrived, prev: null },
        }),
        commitTap: async (event) => {
          proposed = event;
          return { kind: "appended", event };
        },
      }),
    });
    expect(
      await arrival.presentPin({ token: "token-open", pin: "1111", tapId: TAP_B }),
    ).toEqual({
      ok: true,
      firstName: "Maya",
      lastName: "Chen",
      status: "checked_out",
      at: "2026-10-01T17:30:00.000Z",
    });
    expect(proposed).toEqual({
      id: "id-1",
      sessionId: "session-1",
      studentId: "stu-maya",
      at: "2026-10-01T17:30:00.000Z",
      tapId: TAP_B,
      kind: "check_out",
      prev: { id: "evt-in", kind: "check_in" },
    });
  });
});
