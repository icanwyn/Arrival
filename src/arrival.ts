declare const brand: unique symbol;

export type TeamId = string & { readonly [brand]: "TeamId" };
export type StudentId = string & { readonly [brand]: "StudentId" };
export type SessionId = string & { readonly [brand]: "SessionId" };
export type EventId = string & { readonly [brand]: "EventId" };
export type TapId = string & { readonly [brand]: "TapId" };
export type QrToken = string & { readonly [brand]: "QrToken" };
export type Pin = string & { readonly [brand]: "Pin" };
export type IsoInstant = string & { readonly [brand]: "IsoInstant" };
export type NonEmpty = string & { readonly [brand]: "NonEmpty" };
export type Email = string & { readonly [brand]: "Email" };
export type Age = number & { readonly [brand]: "Age" };

export function brandTeamId(value: string): TeamId {
  return value as TeamId;
}

export function brandStudentId(value: string): StudentId {
  return value as StudentId;
}

export function brandSessionId(value: string): SessionId {
  return value as SessionId;
}

export function brandEventId(value: string): EventId {
  return value as EventId;
}

export function brandTapId(value: string): TapId {
  return value as TapId;
}

export function brandQrToken(value: string): QrToken {
  return value as QrToken;
}

export function brandIsoInstant(value: string): IsoInstant {
  return value as IsoInstant;
}

export function brandPin(value: string): Pin {
  if (!/^\d{4}$/.test(value)) {
    throw new Error("bad pin");
  }
  return value as Pin;
}

export function brandNonEmpty(value: string): NonEmpty {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("empty");
  }
  return trimmed as NonEmpty;
}

export function brandEmail(value: string): Email {
  const parsed = parseEmail(value);
  if (!parsed) {
    throw new Error("bad email");
  }
  return parsed;
}

export function brandAge(value: number): Age {
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw new Error("bad age");
  }
  return value as Age;
}

export type Team = {
  readonly id: TeamId;
  readonly name: NonEmpty;
};

export type Student = {
  readonly id: StudentId;
  readonly teamId: TeamId;
  readonly firstName: NonEmpty;
  readonly lastName: NonEmpty;
  readonly age: Age;
  readonly gender: NonEmpty;
  readonly parentEmail: Email;
  readonly pin: Pin;
};

export type Session = {
  readonly id: SessionId;
  readonly teamId: TeamId;
  readonly label: NonEmpty;
  readonly token: QrToken;
  readonly status: "open" | "closed";
};

export type EventDraft = {
  readonly id: EventId;
  readonly sessionId: SessionId;
  readonly studentId: StudentId;
  readonly at: IsoInstant;
  readonly tapId: TapId;
};

export type EventStamp = {
  readonly id: EventId;
  readonly at: IsoInstant;
};

export type CheckInEvent = EventDraft & {
  readonly kind: "check_in";
  readonly prev: null | { readonly id: EventId; readonly kind: "check_out" };
};

export type CheckOutEvent = EventDraft & {
  readonly kind: "check_out";
  readonly prev: { readonly id: EventId; readonly kind: "check_in" };
};

export type AttendanceEvent = CheckInEvent | CheckOutEvent;

export type HeadPair =
  | { readonly head: CheckInEvent; readonly prev: CheckOutEvent | null }
  | { readonly head: CheckOutEvent; readonly prev: CheckInEvent };

export type Presence =
  | { readonly kind: "not_yet_arrived" }
  | { readonly kind: "checked_in"; readonly since: EventStamp }
  | {
      readonly kind: "checked_out";
      readonly arrived: EventStamp;
      readonly left: EventStamp;
    };

export type HeadSnapshot =
  | {
      readonly kind: "recorded";
      readonly session: "open" | "closed";
      readonly tap: AttendanceEvent;
      readonly pair: HeadPair;
    }
  | {
      readonly kind: "current";
      readonly session: "open" | "closed" | "missing";
      readonly pair: HeadPair | null;
    };

export type TapCommit =
  | { readonly kind: "appended"; readonly event: AttendanceEvent }
  | { readonly kind: "replay"; readonly event: AttendanceEvent; readonly pair: HeadPair }
  | { readonly kind: "already"; readonly pair: HeadPair }
  | { readonly kind: "closed" }
  | { readonly kind: "rejected" };

export type TapDecision =
  | { readonly action: "none"; readonly commit: TapCommit }
  | { readonly action: "insert"; readonly event: AttendanceEvent; readonly commit: TapCommit };

export type CsvError = {
  readonly line: number;
  readonly message: string;
};

export type RosterDraft = {
  readonly line: number;
  readonly firstName: NonEmpty;
  readonly lastName: NonEmpty;
  readonly age: Age;
  readonly gender: NonEmpty;
  readonly parentEmail: Email;
};

export type CsvParse =
  | { readonly ok: true; readonly rows: readonly RosterDraft[] }
  | { readonly ok: false; readonly errors: readonly CsvError[] };

export type ProfileUpdate = {
  readonly id: StudentId;
  readonly age: Age;
  readonly gender: NonEmpty;
  readonly parentEmail: Email;
};

export type RosterFailure =
  | { readonly ok: false; readonly reason: "pin_space_exhausted" }
  | { readonly ok: false; readonly reason: "invalid"; readonly errors: readonly CsvError[] };

export type RosterPlan =
  | {
      readonly ok: true;
      readonly insert: readonly Student[];
      readonly update: readonly ProfileUpdate[];
      readonly roster: readonly Student[];
    }
  | RosterFailure;

export type RosterApply = { readonly ok: true; readonly roster: readonly Student[] } | RosterFailure;

export type HeadLink = {
  readonly studentId: StudentId;
  readonly pair: HeadPair;
};

export class OpenSessionConflict extends Error {
  constructor() {
    super("team already has an open session");
    this.name = "OpenSessionConflict";
  }
}

export interface ArrivalStore {
  insertTeam(team: Team): Promise<void>;
  listTeams(): Promise<readonly Team[]>;
  getTeam(id: TeamId): Promise<Team | null>;
  listStudents(teamId: TeamId): Promise<readonly Student[]>;
  applyRoster(
    teamId: TeamId,
    rows: readonly RosterDraft[],
    pinStart: number,
  ): Promise<RosterApply>;
  insertSession(session: Session): Promise<void>;
  listSessions(teamId: TeamId): Promise<readonly Session[]>;
  getSession(id: SessionId): Promise<Session | null>;
  findSessionByToken(token: QrToken): Promise<Session | null>;
  closeSession(id: SessionId): Promise<Session | null>;
  findStudentByPin(teamId: TeamId, pin: Pin): Promise<Student | null>;
  peekHead(sessionId: SessionId, studentId: StudentId, tapId: TapId): Promise<HeadSnapshot>;
  commitTap(proposed: AttendanceEvent): Promise<TapCommit>;
  listHeads(sessionId: SessionId): Promise<readonly HeadLink[]>;
}

export type Entropy = {
  id(): string;
  token(): string;
  pinStart(): number;
  now(): IsoInstant;
};

export type Deps = {
  readonly store: ArrivalStore;
  readonly entropy: Entropy;
};

export type TeamListItem = {
  readonly id: string;
  readonly name: string;
};

export type RosterRow = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly age: number;
  readonly gender: string;
  readonly parentEmail: string;
  readonly pin: string;
};

export type CoachSessionItem = {
  readonly id: string;
  readonly label: string;
  readonly status: "open" | "closed";
  readonly token: string;
};

export type CreateTeamResult =
  | { readonly ok: true; readonly id: string; readonly name: string }
  | { readonly ok: false; readonly reason: "invalid_name" };

export type CoachDeskResult =
  | {
      readonly ok: true;
      readonly team: { readonly id: string; readonly name: string };
      readonly roster: readonly RosterRow[];
      readonly sessions: readonly CoachSessionItem[];
    }
  | { readonly ok: false; readonly reason: "unknown_team" };

export type ImportRosterResult =
  | { readonly ok: true; readonly students: readonly RosterRow[] }
  | { readonly ok: false; readonly reason: "unknown_team" }
  | { readonly ok: false; readonly reason: "pin_space_exhausted" }
  | { readonly ok: false; readonly reason: "invalid_csv"; readonly errors: readonly CsvError[] };

export type OpenSessionResult =
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly label: string;
      readonly token: string;
      readonly status: "open";
    }
  | { readonly ok: false; readonly reason: "unknown_team" | "invalid_label" };

export type CloseSessionResult =
  | { readonly ok: true; readonly sessionId: string; readonly status: "closed" }
  | { readonly ok: false; readonly reason: "unknown_session" };

export type ResolveSessionResult =
  | {
      readonly ok: true;
      readonly teamName: string;
      readonly label: string;
      readonly status: "open" | "closed";
    }
  | { readonly ok: false; readonly reason: "unknown_token" };

export type PresentResult =
  | {
      readonly ok: false;
      readonly reason:
        | "unknown_token"
        | "session_closed"
        | "malformed_pin"
        | "unknown_pin"
        | "malformed_tap";
    }
  | {
      readonly ok: true;
      readonly firstName: string;
      readonly lastName: string;
      readonly status: "checked_in" | "checked_out";
      readonly at: string;
    };

export type BoardRow = {
  readonly studentId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly age: number;
  readonly gender: string;
} & (
  | { readonly status: "not_yet_arrived" }
  | { readonly status: "checked_in"; readonly checkInAt: string }
  | { readonly status: "checked_out"; readonly checkInAt: string; readonly checkOutAt: string }
);

export type BoardResult =
  | { readonly ok: false; readonly reason: "unknown_session" }
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly label: string;
      readonly status: "open" | "closed";
      readonly rows: readonly BoardRow[];
    };

const REQUIRED_COLUMNS = ["first_name", "last_name", "age", "gender", "parent_email"] as const;
const TAP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRosterCsv(text: string): CsvParse {
  const source = text.replace(/^\uFEFF/, "");
  const lines = source.split("\n");
  if (lines.length === 0 || lines[0].replace(/\r$/, "").trim() === "") {
    return { ok: false, errors: [{ line: 1, message: "Header is required" }] };
  }

  const header = splitCsvLine(lines[0].replace(/\r$/, ""));
  const index = new Map<string, number>();
  header.forEach((field, position) => {
    const name = field.trim().toLowerCase();
    if (!index.has(name)) index.set(name, position);
  });

  const errors: CsvError[] = [];
  for (const column of REQUIRED_COLUMNS) {
    if (!index.has(column)) {
      errors.push({ line: 1, message: `Missing column ${column}` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const rows: RosterDraft[] = [];
  let dataRows = 0;
  for (let lineNumber = 2; lineNumber <= lines.length; lineNumber += 1) {
    const raw = lines[lineNumber - 1].replace(/\r$/, "");
    if (raw.trim() === "") continue;
    dataRows += 1;
    if (dataRows > 200) {
      errors.push({ line: lineNumber, message: "More than 200 kids" });
      break;
    }
    const fields = splitCsvLine(raw);
    const read = (column: (typeof REQUIRED_COLUMNS)[number]) => {
      const position = index.get(column);
      return position === undefined ? "" : (fields[position] ?? "");
    };
    const draft = readRosterFields(lineNumber, read, errors);
    if (draft) rows.push(draft);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, rows };
}

export function allocatePin(used: ReadonlySet<Pin>, start: number): Pin | null {
  const origin = mod10000(start);
  for (let step = 0; step < 10000; step += 1) {
    const candidate = String((origin + step) % 10000).padStart(4, "0");
    if (!used.has(candidate as Pin)) return candidate as Pin;
  }
  return null;
}

export function planRoster(
  teamId: TeamId,
  existing: readonly Student[],
  rows: readonly RosterDraft[],
  pinStart: number,
  mintId: () => StudentId,
): RosterPlan {
  const errors: CsvError[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = matchKey(row.firstName, row.lastName, row.parentEmail);
    if (seen.has(key)) {
      errors.push({ line: row.line, message: "Duplicate kid" });
    } else {
      seen.set(key, row.line);
    }
  }

  const existingByKey = new Map<string, Student[]>();
  const used = new Set<Pin>();
  for (const student of existing) {
    const key = matchKey(student.firstName, student.lastName, student.parentEmail);
    const group = existingByKey.get(key);
    if (group) group.push(student);
    else existingByKey.set(key, [student]);
    if (used.has(student.pin)) {
      errors.push({ line: 0, message: "Duplicate PIN" });
    }
    used.add(student.pin);
  }
  for (const group of existingByKey.values()) {
    if (group.length > 1) {
      errors.push({ line: 0, message: "Two saved kids share a name and email" });
    }
  }
  if (errors.length > 0) return { ok: false, reason: "invalid", errors };

  const updates: ProfileUpdate[] = [];
  const inserts: Student[] = [];
  const kept = new Map<StudentId, Student>(existing.map((student) => [student.id, student]));

  for (const row of rows) {
    const key = matchKey(row.firstName, row.lastName, row.parentEmail);
    const matches = existingByKey.get(key) ?? [];
    if (matches.length === 1) {
      const student = matches[0];
      const update: ProfileUpdate = {
        id: student.id,
        age: row.age,
        gender: row.gender,
        parentEmail: row.parentEmail,
      };
      updates.push(update);
      kept.set(student.id, { ...student, ...update });
      continue;
    }

    const pin = allocatePin(used, pinStart);
    if (!pin) return { ok: false, reason: "pin_space_exhausted" };
    used.add(pin);
    const student: Student = {
      id: mintId(),
      teamId,
      firstName: row.firstName,
      lastName: row.lastName,
      age: row.age,
      gender: row.gender,
      parentEmail: row.parentEmail,
      pin,
    };
    inserts.push(student);
    kept.set(student.id, student);
  }

  const roster = [...kept.values()].sort(byLastThenFirst);
  return { ok: true, insert: inserts, update: updates, roster };
}

export function presenceFromHead(pair: HeadPair | null): Presence {
  if (pair === null) return { kind: "not_yet_arrived" };
  if (isCheckInPair(pair)) {
    return { kind: "checked_in", since: { id: pair.head.id, at: pair.head.at } };
  }
  return {
    kind: "checked_out",
    arrived: { id: pair.prev.id, at: pair.prev.at },
    left: { id: pair.head.id, at: pair.head.at },
  };
}

function isCheckInPair(
  pair: HeadPair,
): pair is { readonly head: CheckInEvent; readonly prev: CheckOutEvent | null } {
  return pair.head.kind === "check_in";
}

export function nextAttendance(presence: Presence, draft: EventDraft): AttendanceEvent {
  if (presence.kind === "checked_in") {
    const event: CheckOutEvent = {
      id: draft.id,
      sessionId: draft.sessionId,
      studentId: draft.studentId,
      at: draft.at,
      tapId: draft.tapId,
      kind: "check_out",
      prev: { id: presence.since.id, kind: "check_in" },
    };
    return event;
  }
  if (presence.kind === "checked_out") {
    const event: CheckInEvent = {
      id: draft.id,
      sessionId: draft.sessionId,
      studentId: draft.studentId,
      at: draft.at,
      tapId: draft.tapId,
      kind: "check_in",
      prev: { id: presence.left.id, kind: "check_out" },
    };
    return event;
  }
  const event: CheckInEvent = {
    id: draft.id,
    sessionId: draft.sessionId,
    studentId: draft.studentId,
    at: draft.at,
    tapId: draft.tapId,
    kind: "check_in",
    prev: null,
  };
  return event;
}

export function decideTap(snap: HeadSnapshot, proposed: AttendanceEvent): TapDecision {
  if (snap.kind === "recorded" && snap.tap.tapId === proposed.tapId) {
    return {
      action: "none",
      commit: { kind: "replay", event: snap.tap, pair: snap.pair },
    };
  }

  if (snap.session !== "open") {
    return { action: "none", commit: { kind: "closed" } };
  }

  const pair = snap.pair;
  const expected = proposed.prev?.id ?? null;
  const actual = pair?.head.id ?? null;
  if (expected !== actual) {
    if (pair === null) {
      return { action: "none", commit: { kind: "rejected" } };
    }
    return { action: "none", commit: { kind: "already", pair } };
  }

  return {
    action: "insert",
    event: proposed,
    commit: { kind: "appended", event: proposed },
  };
}

export function linkHead(head: AttendanceEvent, prev: AttendanceEvent | null): HeadPair {
  if (head.kind === "check_out") {
    if (prev === null || prev.kind !== "check_in" || head.prev.id !== prev.id) {
      throw new Error("corrupt attendance head");
    }
    return { head, prev };
  }
  if (head.prev === null) {
    if (prev !== null) throw new Error("corrupt attendance head");
    return { head, prev: null };
  }
  if (prev === null || prev.kind !== "check_out" || head.prev.id !== prev.id) {
    throw new Error("corrupt attendance head");
  }
  return { head, prev };
}

export function boardRows(
  students: readonly Student[],
  heads: readonly HeadLink[],
): readonly BoardRow[] {
  const byStudent = new Map<StudentId, HeadLink>();
  for (const link of heads) byStudent.set(link.studentId, link);

  const rows = students.map((student) => {
    const link = byStudent.get(student.id);
    return toBoardRow(student, presenceFromHead(link ? link.pair : null));
  });
  rows.sort(byLastThenFirst);
  return rows;
}

export interface Arrival {
  createTeam(input: { name: string }): Promise<CreateTeamResult>;
  listTeams(): Promise<readonly TeamListItem[]>;
  coachDesk(input: { teamId: string }): Promise<CoachDeskResult>;
  importRoster(input: { teamId: string; csvText: string }): Promise<ImportRosterResult>;
  openSession(input: { teamId: string; label: string }): Promise<OpenSessionResult>;
  closeSession(input: { sessionId: string }): Promise<CloseSessionResult>;
  resolveSession(input: { token: string }): Promise<ResolveSessionResult>;
  presentPin(input: { token: string; pin: string; tapId: string }): Promise<PresentResult>;
  sessionBoard(input: { sessionId: string }): Promise<BoardResult>;
}

export function bindArrival(deps: Deps): Arrival {
  const { store, entropy } = deps;

  return {
    async createTeam(input) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 80) return { ok: false, reason: "invalid_name" };
      const team: Team = { id: brandTeamId(entropy.id()), name: brandNonEmpty(name) };
      await store.insertTeam(team);
      return { ok: true, id: team.id, name: team.name };
    },

    async listTeams() {
      const teams = await store.listTeams();
      return teams.map((team) => ({ id: team.id, name: team.name }));
    },

    async coachDesk(input) {
      const team = await store.getTeam(brandTeamId(input.teamId));
      if (!team) return { ok: false, reason: "unknown_team" };
      const [students, sessions] = await Promise.all([
        store.listStudents(team.id),
        store.listSessions(team.id),
      ]);
      const roster = students.map(toRosterRow).sort(byLastThenFirst);
      return {
        ok: true,
        team: { id: team.id, name: team.name },
        roster,
        sessions: sessions.map((session) => ({
          id: session.id,
          label: session.label,
          status: session.status,
          token: session.token,
        })),
      };
    },

    async importRoster(input) {
      const parsed = parseRosterCsv(input.csvText);
      if (!parsed.ok) return { ok: false, reason: "invalid_csv", errors: parsed.errors };
      const team = await store.getTeam(brandTeamId(input.teamId));
      if (!team) return { ok: false, reason: "unknown_team" };
      const applied = await store.applyRoster(team.id, parsed.rows, entropy.pinStart());
      if (!applied.ok) {
        if (applied.reason === "pin_space_exhausted") {
          return { ok: false, reason: "pin_space_exhausted" };
        }
        return { ok: false, reason: "invalid_csv", errors: applied.errors };
      }
      return { ok: true, students: applied.roster.map(toRosterRow) };
    },

    async openSession(input) {
      const label = input.label.trim();
      if (label.length < 1 || label.length > 80) return { ok: false, reason: "invalid_label" };
      const team = await store.getTeam(brandTeamId(input.teamId));
      if (!team) return { ok: false, reason: "unknown_team" };
      const open = await findOpenSession(store, team.id);
      if (open) return openSessionResult(open);
      const session: Session = {
        id: brandSessionId(entropy.id()),
        teamId: team.id,
        label: brandNonEmpty(label),
        token: brandQrToken(entropy.token()),
        status: "open",
      };
      try {
        await store.insertSession(session);
      } catch (error) {
        if (!(error instanceof OpenSessionConflict)) throw error;
        const winner = await findOpenSession(store, team.id);
        if (!winner) throw error;
        return openSessionResult(winner);
      }
      return openSessionResult(session);
    },

    async closeSession(input) {
      const session = await store.closeSession(brandSessionId(input.sessionId));
      if (!session) return { ok: false, reason: "unknown_session" };
      return { ok: true, sessionId: session.id, status: "closed" };
    },

    async resolveSession(input) {
      const token = input.token.trim();
      if (!token) return { ok: false, reason: "unknown_token" };
      const session = await store.findSessionByToken(brandQrToken(token));
      if (!session) return { ok: false, reason: "unknown_token" };
      const team = await store.getTeam(session.teamId);
      if (!team) return { ok: false, reason: "unknown_token" };
      return {
        ok: true,
        teamName: team.name,
        label: session.label,
        status: session.status,
      };
    },

    async presentPin(input) {
      const pin = parsePin(input.pin);
      if (!pin) return { ok: false, reason: "malformed_pin" };
      const tapId = parseTapId(input.tapId);
      if (!tapId) return { ok: false, reason: "malformed_tap" };
      const token = input.token.trim();
      if (!token) return { ok: false, reason: "unknown_token" };
      const session = await store.findSessionByToken(brandQrToken(token));
      if (!session) return { ok: false, reason: "unknown_token" };
      const student = await store.findStudentByPin(session.teamId, pin);
      if (!student) return { ok: false, reason: "unknown_pin" };

      const snap = await store.peekHead(session.id, student.id, tapId);
      if (snap.kind === "current" && snap.session !== "open") {
        return { ok: false, reason: "session_closed" };
      }

      const proposed = nextAttendance(presenceFromHead(snap.pair), {
        id: brandEventId(entropy.id()),
        sessionId: session.id,
        studentId: student.id,
        at: entropy.now(),
        tapId,
      });
      const commit = await store.commitTap(proposed);
      return confirmPresent(student, commit);
    },

    async sessionBoard(input) {
      const session = await store.getSession(brandSessionId(input.sessionId));
      if (!session) return { ok: false, reason: "unknown_session" };
      const [students, heads] = await Promise.all([
        store.listStudents(session.teamId),
        store.listHeads(session.id),
      ]);
      return {
        ok: true,
        sessionId: session.id,
        label: session.label,
        status: session.status,
        rows: boardRows(students, heads),
      };
    },
  };
}

function confirmPresent(student: Student, commit: TapCommit): PresentResult {
  if (commit.kind === "closed") return { ok: false, reason: "session_closed" };
  if (commit.kind === "rejected") throw new Error("corrupt attendance head");
  if (commit.kind === "appended") {
    return {
      ok: true,
      firstName: student.firstName,
      lastName: student.lastName,
      status: commit.event.kind === "check_in" ? "checked_in" : "checked_out",
      at: commit.event.at,
    };
  }
  const presence = presenceFromHead(commit.pair);
  if (presence.kind === "checked_in") {
    return {
      ok: true,
      firstName: student.firstName,
      lastName: student.lastName,
      status: "checked_in",
      at: presence.since.at,
    };
  }
  if (presence.kind === "checked_out") {
    return {
      ok: true,
      firstName: student.firstName,
      lastName: student.lastName,
      status: "checked_out",
      at: presence.left.at,
    };
  }
  throw new Error("corrupt attendance head");
}

function openSessionResult(session: Session): OpenSessionResult {
  return {
    ok: true,
    sessionId: session.id,
    label: session.label,
    token: session.token,
    status: "open",
  };
}

async function findOpenSession(store: ArrivalStore, teamId: TeamId): Promise<Session | null> {
  const sessions = await store.listSessions(teamId);
  return sessions.find((session) => session.status === "open") ?? null;
}

function toRosterRow(student: Student): RosterRow {
  return {
    id: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    age: student.age,
    gender: student.gender,
    parentEmail: student.parentEmail,
    pin: student.pin,
  };
}

function toBoardRow(student: Student, presence: Presence): BoardRow {
  const base = {
    studentId: student.id,
    firstName: student.firstName,
    lastName: student.lastName,
    age: student.age,
    gender: student.gender,
  };
  if (presence.kind === "not_yet_arrived") {
    return { ...base, status: "not_yet_arrived" };
  }
  if (presence.kind === "checked_in") {
    return { ...base, status: "checked_in", checkInAt: presence.since.at };
  }
  return {
    ...base,
    status: "checked_out",
    checkInAt: presence.arrived.at,
    checkOutAt: presence.left.at,
  };
}

function readRosterFields(
  line: number,
  read: (column: (typeof REQUIRED_COLUMNS)[number]) => string,
  errors: CsvError[],
): RosterDraft | null {
  const before = errors.length;
  const firstName = parsePersonName(read("first_name"));
  const lastName = parsePersonName(read("last_name"));
  const age = parseAge(read("age"));
  const gender = parsePersonName(read("gender"));
  const parentEmail = parseEmail(read("parent_email"));
  if (!firstName) errors.push({ line, message: "First name is required" });
  if (!lastName) errors.push({ line, message: "Last name is required" });
  if (!age) errors.push({ line, message: "Age must be an integer from 1 through 99" });
  if (!gender) errors.push({ line, message: "Gender is required" });
  if (!parentEmail) errors.push({ line, message: "Parent email is invalid" });
  if (errors.length > before || !firstName || !lastName || !age || !gender || !parentEmail) {
    return null;
  }
  return { line, firstName, lastName, age, gender, parentEmail };
}

function parsePersonName(raw: string): NonEmpty | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed as NonEmpty;
}

function parseAge(raw: string): Age | null {
  const trimmed = raw.trim();
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < 1 || value > 99) return null;
  return value as Age;
}

function parseEmail(raw: string): Email | null {
  const trimmed = raw.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) return null;
  return trimmed as Email;
}

export function parsePin(raw: string): Pin | null {
  if (!/^\d{4}$/.test(raw)) return null;
  return raw as Pin;
}

export function parseTapId(raw: string): TapId | null {
  if (!TAP_ID.test(raw)) return null;
  return raw as TapId;
}

function matchKey(firstName: string, lastName: string, email: string): string {
  return `${firstName.trim().toLowerCase()}\n${lastName.trim().toLowerCase()}\n${email.trim().toLowerCase()}`;
}

function byLastThenFirst(
  a: { readonly lastName: string; readonly firstName: string },
  b: { readonly lastName: string; readonly firstName: string },
): number {
  if (a.lastName < b.lastName) return -1;
  if (a.lastName > b.lastName) return 1;
  if (a.firstName < b.firstName) return -1;
  if (a.firstName > b.firstName) return 1;
  return 0;
}

function mod10000(start: number): number {
  if (!Number.isFinite(start)) return 0;
  return ((Math.trunc(start) % 10000) + 10000) % 10000;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}
