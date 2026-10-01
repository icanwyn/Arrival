import {
  LibsqlError,
  type Client,
  type InStatement,
  type ResultSet,
  type Row,
  type Transaction,
} from "@libsql/client";
import {
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
  OpenSessionConflict,
  planRoster,
  type ArrivalStore,
  type AttendanceEvent,
  type HeadPair,
  type HeadSnapshot,
  type Session,
  type Student,
  type StudentId,
  type TapCommit,
  type Team,
  type TeamId,
} from "./arrival";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  parent_email TEXT NOT NULL,
  pin TEXT NOT NULL,
  UNIQUE (team_id, pin)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open
  ON sessions (team_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('check_in', 'check_out')),
  at TEXT NOT NULL,
  tap_id TEXT NOT NULL,
  prev_id TEXT,
  CHECK (kind = 'check_in' OR prev_id IS NOT NULL),
  UNIQUE (session_id, student_id, tap_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS events_genesis
  ON events (session_id, student_id) WHERE prev_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS events_child
  ON events (prev_id) WHERE prev_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_by_student
  ON events (session_id, student_id);
`;

const EVENT_COLUMNS = "id, session_id, student_id, kind, at, tap_id, prev_id";

type Runner = {
  execute(stmt: InStatement): Promise<ResultSet>;
};

const schemas = new WeakMap<Client, Promise<void>>();

export function libsqlStore(client: Client): ArrivalStore {
  const ready = () => ensureSchema(client);

  return {
    async insertTeam(team) {
      await ready();
      await client.execute({
        sql: "INSERT INTO teams (id, name) VALUES (?, ?)",
        args: [team.id, team.name],
      });
    },

    async listTeams() {
      await ready();
      const rows = await many(client, "SELECT id, name FROM teams ORDER BY rowid");
      return rows.map(teamFrom);
    },

    async getTeam(id) {
      await ready();
      const row = await one(client, "SELECT id, name FROM teams WHERE id = ?", [id]);
      return row ? teamFrom(row) : null;
    },

    async listStudents(teamId) {
      await ready();
      return readStudents(client, teamId);
    },

    async applyRoster(teamId, drafts, pinStart) {
      await ready();
      return write(client, async (tx) => {
        const existing = await readStudents(tx, teamId);
        const plan = planRoster(teamId, existing, drafts, pinStart, mintStudentId);
        if (!plan.ok) return plan;
        for (const student of plan.insert) {
          await tx.execute({
            sql: `INSERT INTO students (
              id, team_id, first_name, last_name, age, gender, parent_email, pin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              student.id,
              student.teamId,
              student.firstName,
              student.lastName,
              student.age,
              student.gender,
              student.parentEmail,
              student.pin,
            ],
          });
        }
        for (const update of plan.update) {
          await tx.execute({
            sql: `UPDATE students
              SET age = ?, gender = ?, parent_email = ?
              WHERE id = ? AND team_id = ?`,
            args: [update.age, update.gender, update.parentEmail, update.id, teamId],
          });
        }
        return { ok: true as const, roster: await readStudents(tx, teamId) };
      });
    },

    async insertSession(session) {
      await ready();
      try {
        await client.execute({
          sql: `INSERT INTO sessions (id, team_id, label, token, status)
            VALUES (?, ?, ?, ?, ?)`,
          args: [session.id, session.teamId, session.label, session.token, session.status],
        });
      } catch (error) {
        if (session.status === "open" && isOpenSessionConflict(error)) {
          throw new OpenSessionConflict();
        }
        throw error;
      }
    },

    async listSessions(teamId) {
      await ready();
      const rows = await many(
        client,
        `SELECT id, team_id, label, token, status
         FROM sessions WHERE team_id = ? ORDER BY rowid DESC`,
        [teamId],
      );
      return rows.map(sessionFrom);
    },

    async getSession(id) {
      await ready();
      const row = await one(
        client,
        "SELECT id, team_id, label, token, status FROM sessions WHERE id = ?",
        [id],
      );
      return row ? sessionFrom(row) : null;
    },

    async findSessionByToken(token) {
      await ready();
      const row = await one(
        client,
        "SELECT id, team_id, label, token, status FROM sessions WHERE token = ?",
        [token],
      );
      return row ? sessionFrom(row) : null;
    },

    async closeSession(id) {
      await ready();
      await client.execute({
        sql: "UPDATE sessions SET status = 'closed' WHERE id = ?",
        args: [id],
      });
      const row = await one(
        client,
        "SELECT id, team_id, label, token, status FROM sessions WHERE id = ?",
        [id],
      );
      return row ? sessionFrom(row) : null;
    },

    async findStudentByPin(teamId, pin) {
      await ready();
      const row = await one(
        client,
        `SELECT id, team_id, first_name, last_name, age, gender, parent_email, pin
         FROM students WHERE team_id = ? AND pin = ?`,
        [teamId, pin],
      );
      return row ? studentFrom(row) : null;
    },

    async peekHead(sessionId, studentId, tapId) {
      await ready();
      return loadSnapshot(client, sessionId, studentId, tapId);
    },

    async commitTap(proposed) {
      await ready();
      try {
        return await write(client, async (tx) => {
          const snap = await loadSnapshot(tx, proposed.sessionId, proposed.studentId, proposed.tapId);
          const decision = decideTap(snap, proposed);
          if (decision.action !== "insert") return decision.commit;
          await insertEvent(tx, decision.event);
          return decision.commit;
        });
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error;
        const snap = await loadSnapshot(client, proposed.sessionId, proposed.studentId, proposed.tapId);
        return commitAfterConflict(snap, proposed);
      }
    },

    async listHeads(sessionId) {
      await ready();
      const rows = await many(
        client,
        `SELECT ${EVENT_COLUMNS}
         FROM events e
         WHERE e.session_id = ?
           AND NOT EXISTS (SELECT 1 FROM events child WHERE child.prev_id = e.id)`,
        [sessionId],
      );
      const links = [];
      for (const row of rows) {
        const head = eventFromRow(row);
        const prev = await loadPrevEvent(client, head);
        links.push({ studentId: head.studentId, pair: linkHead(head, prev) });
      }
      return links;
    },
  };
}

function ensureSchema(client: Client): Promise<void> {
  const existing = schemas.get(client);
  if (existing) return existing;
  const pending = client.executeMultiple(SCHEMA).catch((error: unknown) => {
    schemas.delete(client);
    throw error;
  });
  schemas.set(client, pending);
  return pending;
}

async function write<T>(client: Client, run: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = await client.transaction("write");
  try {
    const value = await run(tx);
    await tx.commit();
    return value;
  } catch (error) {
    if (!tx.closed) {
      try {
        await tx.rollback();
      } catch {
        // Keep the error from the write.
      }
    }
    throw error;
  }
}

function commitAfterConflict(snap: HeadSnapshot, proposed: AttendanceEvent): TapCommit {
  const decision = decideTap(snap, proposed);
  if (decision.action === "none") return decision.commit;
  if (snap.pair) return { kind: "already", pair: snap.pair };
  return { kind: "rejected" };
}

async function loadSnapshot(
  runner: Runner,
  sessionId: string,
  studentId: string,
  tapId: string,
): Promise<HeadSnapshot> {
  const session = await one(runner, "SELECT status FROM sessions WHERE id = ?", [sessionId]);
  const sessionState = session ? sessionStateFrom(session.status) : "missing";
  const pair = await loadPair(runner, sessionId, studentId);
  const tapRow = await one(
    runner,
    `SELECT ${EVENT_COLUMNS} FROM events
     WHERE session_id = ? AND student_id = ? AND tap_id = ?`,
    [sessionId, studentId, tapId],
  );
  if (!tapRow) {
    return { kind: "current", session: sessionState, pair };
  }
  if (!pair || sessionState === "missing") throw new Error("corrupt attendance head");
  return {
    kind: "recorded",
    session: sessionState,
    tap: eventFromRow(tapRow),
    pair,
  };
}

async function loadPair(
  runner: Runner,
  sessionId: string,
  studentId: string,
): Promise<HeadPair | null> {
  const rows = await many(
    runner,
    `SELECT ${EVENT_COLUMNS}
     FROM events e
     WHERE e.session_id = ? AND e.student_id = ?
       AND NOT EXISTS (SELECT 1 FROM events child WHERE child.prev_id = e.id)`,
    [sessionId, studentId],
  );
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error("corrupt attendance head");
  const head = eventFromRow(rows[0]);
  const prev = await loadPrevEvent(runner, head);
  return linkHead(head, prev);
}

async function loadPrevEvent(runner: Runner, head: AttendanceEvent): Promise<AttendanceEvent | null> {
  if (head.prev === null) return null;
  const row = await one(runner, `SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?`, [head.prev.id]);
  if (!row) return null;
  return eventFromRow(row);
}

async function insertEvent(runner: Runner, event: AttendanceEvent): Promise<void> {
  await runner.execute({
    sql: `INSERT INTO events (id, session_id, student_id, kind, at, tap_id, prev_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.id,
      event.sessionId,
      event.studentId,
      event.kind,
      event.at,
      event.tapId,
      event.prev?.id ?? null,
    ],
  });
}

async function readStudents(runner: Runner, teamId: TeamId): Promise<Student[]> {
  const rows = await many(
    runner,
    `SELECT id, team_id, first_name, last_name, age, gender, parent_email, pin
     FROM students WHERE team_id = ?
     ORDER BY last_name, first_name, id`,
    [teamId],
  );
  return rows.map(studentFrom);
}

function mintStudentId(): StudentId {
  return brandStudentId(crypto.randomUUID());
}

async function one(
  runner: Runner,
  sql: string,
  args: readonly (string | number | null)[] = [],
): Promise<Row | null> {
  const result = await runner.execute({ sql, args: [...args] });
  return result.rows[0] ?? null;
}

async function many(runner: Runner, sql: string, args: readonly (string | number | null)[] = []): Promise<Row[]> {
  const result = await runner.execute({ sql, args: [...args] });
  return result.rows;
}

function teamFrom(row: Row): Team {
  return { id: brandTeamId(text(row, "id")), name: brandNonEmpty(text(row, "name")) };
}

function studentFrom(row: Row): Student {
  return {
    id: brandStudentId(text(row, "id")),
    teamId: brandTeamId(text(row, "team_id")),
    firstName: brandNonEmpty(text(row, "first_name")),
    lastName: brandNonEmpty(text(row, "last_name")),
    age: brandAge(intValue(row, "age")),
    gender: brandNonEmpty(text(row, "gender")),
    parentEmail: brandEmail(text(row, "parent_email")),
    pin: brandPin(text(row, "pin")),
  };
}

function sessionFrom(row: Row): Session {
  return {
    id: brandSessionId(text(row, "id")),
    teamId: brandTeamId(text(row, "team_id")),
    label: brandNonEmpty(text(row, "label")),
    token: brandQrToken(text(row, "token")),
    status: sessionStateFrom(row.status),
  };
}

function sessionStateFrom(value: unknown): "open" | "closed" {
  if (value === "open" || value === "closed") return value;
  throw new Error("corrupt session");
}

function eventFromRow(row: Row): AttendanceEvent {
  const base = {
    id: brandEventId(text(row, "id")),
    sessionId: brandSessionId(text(row, "session_id")),
    studentId: brandStudentId(text(row, "student_id")),
    at: brandIsoInstant(text(row, "at")),
    tapId: brandTapId(text(row, "tap_id")),
  };
  const kind = text(row, "kind");
  const prevId = nullableText(row, "prev_id");
  if (kind === "check_in") {
    if (prevId === null) return { ...base, kind: "check_in", prev: null };
    return {
      ...base,
      kind: "check_in",
      prev: { id: brandEventId(prevId), kind: "check_out" },
    };
  }
  if (kind !== "check_out" || prevId === null) throw new Error("corrupt attendance head");
  return {
    ...base,
    kind: "check_out",
    prev: { id: brandEventId(prevId), kind: "check_in" },
  };
}

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`corrupt ${key}`);
  return value;
}

function nullableText(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`corrupt ${key}`);
  return value;
}

function intValue(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "number") throw new Error(`corrupt ${key}`);
  return value;
}

function isUniqueConstraint(error: unknown): boolean {
  if (error instanceof LibsqlError) return error.code.startsWith("SQLITE_CONSTRAINT");
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function isOpenSessionConflict(error: unknown): boolean {
  if (!isUniqueConstraint(error) || !(error instanceof Error)) return false;
  return error.message.includes("sessions.team_id") || error.message.includes("sessions_one_open");
}
