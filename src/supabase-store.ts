import type { SupabaseClient } from "@supabase/supabase-js";
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

type DbError = {
  message: string;
  code?: string;
  details?: string | null;
};

type TeamRow = { id: string; name: string };

type StudentRow = {
  id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  parent_email: string;
  pin: string;
};

type SessionRow = {
  id: string;
  team_id: string;
  label: string;
  token: string;
  status: string;
};

type EventRow = {
  id: string;
  session_id: string;
  student_id: string;
  kind: string;
  at: string;
  tap_id: string;
  prev_id: string | null;
};

const STUDENT_COLUMNS = "id, team_id, first_name, last_name, age, gender, parent_email, pin";
const SESSION_COLUMNS = "id, team_id, label, token, status";
const EVENT_COLUMNS = "id, session_id, student_id, kind, at, tap_id, prev_id";

export function supabaseStore(client: SupabaseClient): ArrivalStore {
  return {
    async insertTeam(team) {
      const { error } = await client.from("teams").insert({ id: team.id, name: team.name });
      if (error) fail(error);
    },

    async listTeams() {
      const { data, error } = await client.from("teams").select("id, name").order("name");
      if (error) fail(error);
      return (data as TeamRow[]).map(teamFrom);
    },

    async getTeam(id) {
      const row = await one<TeamRow>(client, "teams", "id, name", "id", id);
      return row ? teamFrom(row) : null;
    },

    async listStudents(teamId) {
      return readStudents(client, teamId);
    },

    async applyRoster(teamId, drafts, pinStart) {
      const existing = await readStudents(client, teamId);
      const plan = planRoster(teamId, existing, drafts, pinStart, mintStudentId);
      if (!plan.ok) return plan;
      if (plan.insert.length > 0) {
        const { error } = await client.from("students").insert(plan.insert.map(studentToRow));
        if (error) fail(error);
      }
      for (const update of plan.update) {
        const { error } = await client
          .from("students")
          .update({
            age: update.age,
            gender: update.gender,
            parent_email: update.parentEmail,
          })
          .eq("id", update.id)
          .eq("team_id", teamId);
        if (error) fail(error);
      }
      return { ok: true as const, roster: await readStudents(client, teamId) };
    },

    async insertSession(session) {
      const { error } = await client.from("sessions").insert({
        id: session.id,
        team_id: session.teamId,
        label: session.label,
        token: session.token,
        status: session.status,
      });
      if (!error) return;
      if (session.status === "open" && isOpenSessionConflict(error)) throw new OpenSessionConflict();
      fail(error);
    },

    async listSessions(teamId) {
      const { data, error } = await client
        .from("sessions")
        .select(SESSION_COLUMNS)
        .eq("team_id", teamId)
        .order("label", { ascending: false });
      if (error) fail(error);
      return (data as SessionRow[]).map(sessionFrom);
    },

    async getSession(id) {
      const row = await one<SessionRow>(client, "sessions", SESSION_COLUMNS, "id", id);
      return row ? sessionFrom(row) : null;
    },

    async findSessionByToken(token) {
      const row = await one<SessionRow>(client, "sessions", SESSION_COLUMNS, "token", token);
      return row ? sessionFrom(row) : null;
    },

    async closeSession(id) {
      const { error } = await client.from("sessions").update({ status: "closed" }).eq("id", id);
      if (error) fail(error);
      const row = await one<SessionRow>(client, "sessions", SESSION_COLUMNS, "id", id);
      return row ? sessionFrom(row) : null;
    },

    async findStudentByPin(teamId, pin) {
      const { data, error } = await client
        .from("students")
        .select(STUDENT_COLUMNS)
        .eq("team_id", teamId)
        .eq("pin", pin)
        .maybeSingle();
      if (error) fail(error);
      return data ? studentFrom(data as StudentRow) : null;
    },

    async peekHead(sessionId, studentId, tapId) {
      return loadSnapshot(client, sessionId, studentId, tapId);
    },

    async commitTap(proposed) {
      const snap = await loadSnapshot(client, proposed.sessionId, proposed.studentId, proposed.tapId);
      const decision = decideTap(snap, proposed);
      if (decision.action !== "insert") return decision.commit;
      const { error } = await client.from("events").insert(eventToRow(decision.event));
      if (!error) return decision.commit;
      if (!isUnique(error)) fail(error);
      const after = await loadSnapshot(client, proposed.sessionId, proposed.studentId, proposed.tapId);
      return commitAfterConflict(after, proposed);
    },

    async listHeads(sessionId) {
      const rows = await eventsFor(client, sessionId);
      const byStudent = new Map<string, EventRow[]>();
      for (const row of rows) {
        const group = byStudent.get(row.student_id) ?? [];
        group.push(row);
        byStudent.set(row.student_id, group);
      }
      const links = [];
      for (const [studentId, group] of byStudent) {
        const pair = pairFrom(group);
        if (!pair) continue;
        links.push({ studentId: brandStudentId(studentId), pair });
      }
      return links;
    },
  };
}

function commitAfterConflict(snap: HeadSnapshot, proposed: AttendanceEvent): TapCommit {
  const decision = decideTap(snap, proposed);
  if (decision.action === "none") return decision.commit;
  if (snap.pair) return { kind: "already", pair: snap.pair };
  return { kind: "rejected" };
}

async function loadSnapshot(
  client: SupabaseClient,
  sessionId: string,
  studentId: string,
  tapId: string,
): Promise<HeadSnapshot> {
  const session = await one<Pick<SessionRow, "status">>(client, "sessions", "status", "id", sessionId);
  const sessionState = session ? sessionStateFrom(session.status) : "missing";
  const rows = await eventsFor(client, sessionId, studentId);
  const pair = pairFrom(rows);
  const tapRow = rows.find((row) => row.tap_id === tapId);
  if (!tapRow) return { kind: "current", session: sessionState, pair };
  if (!pair || sessionState === "missing") throw new Error("corrupt attendance head");
  return { kind: "recorded", session: sessionState, tap: eventFromRow(tapRow), pair };
}

async function eventsFor(client: SupabaseClient, sessionId: string, studentId?: string): Promise<EventRow[]> {
  let query = client.from("events").select(EVENT_COLUMNS).eq("session_id", sessionId);
  if (studentId) query = query.eq("student_id", studentId);
  const { data, error } = await query;
  if (error) fail(error);
  return data as EventRow[];
}

function pairFrom(rows: readonly EventRow[]): HeadPair | null {
  const events = rows.map(eventFromRow);
  const pointed = new Set(events.flatMap((event) => (event.prev ? [event.prev.id] : [])));
  const heads = events.filter((event) => !pointed.has(event.id));
  if (heads.length === 0) return null;
  if (heads.length > 1) throw new Error("corrupt attendance head");
  const head = heads[0];
  const prev = head.prev === null ? null : (events.find((event) => event.id === head.prev?.id) ?? null);
  return linkHead(head, prev);
}

async function readStudents(client: SupabaseClient, teamId: TeamId): Promise<Student[]> {
  const { data, error } = await client
    .from("students")
    .select(STUDENT_COLUMNS)
    .eq("team_id", teamId)
    .order("last_name")
    .order("first_name")
    .order("id");
  if (error) fail(error);
  return (data as StudentRow[]).map(studentFrom);
}

async function one<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  value: string,
): Promise<T | null> {
  const { data, error } = await client.from(table).select(columns).eq(column, value).maybeSingle();
  if (error) fail(error);
  return (data as T | null) ?? null;
}

function mintStudentId(): StudentId {
  return brandStudentId(crypto.randomUUID());
}

function studentToRow(student: Student): StudentRow {
  return {
    id: student.id,
    team_id: student.teamId,
    first_name: student.firstName,
    last_name: student.lastName,
    age: student.age,
    gender: student.gender,
    parent_email: student.parentEmail,
    pin: student.pin,
  };
}

function eventToRow(event: AttendanceEvent): EventRow {
  return {
    id: event.id,
    session_id: event.sessionId,
    student_id: event.studentId,
    kind: event.kind,
    at: event.at,
    tap_id: event.tapId,
    prev_id: event.prev?.id ?? null,
  };
}

function teamFrom(row: TeamRow): Team {
  return { id: brandTeamId(row.id), name: brandNonEmpty(row.name) };
}

function studentFrom(row: StudentRow): Student {
  return {
    id: brandStudentId(row.id),
    teamId: brandTeamId(row.team_id),
    firstName: brandNonEmpty(row.first_name),
    lastName: brandNonEmpty(row.last_name),
    age: brandAge(Number(row.age)),
    gender: brandNonEmpty(row.gender),
    parentEmail: brandEmail(row.parent_email),
    pin: brandPin(row.pin),
  };
}

function sessionFrom(row: SessionRow): Session {
  return {
    id: brandSessionId(row.id),
    teamId: brandTeamId(row.team_id),
    label: brandNonEmpty(row.label),
    token: brandQrToken(row.token),
    status: sessionStateFrom(row.status),
  };
}

function sessionStateFrom(value: string): "open" | "closed" {
  if (value === "open" || value === "closed") return value;
  throw new Error("corrupt session");
}

function eventFromRow(row: EventRow): AttendanceEvent {
  const base = {
    id: brandEventId(row.id),
    sessionId: brandSessionId(row.session_id),
    studentId: brandStudentId(row.student_id),
    at: brandIsoInstant(row.at),
    tapId: brandTapId(row.tap_id),
  };
  if (row.kind === "check_in") {
    if (row.prev_id === null) return { ...base, kind: "check_in", prev: null };
    return { ...base, kind: "check_in", prev: { id: brandEventId(row.prev_id), kind: "check_out" } };
  }
  if (row.kind !== "check_out" || row.prev_id === null) throw new Error("corrupt attendance head");
  return { ...base, kind: "check_out", prev: { id: brandEventId(row.prev_id), kind: "check_in" } };
}

function fail(error: DbError): never {
  throw new Error(error.message);
}

function isUnique(error: DbError): boolean {
  return error.code === "23505" || error.message.includes("duplicate key");
}

function isOpenSessionConflict(error: DbError): boolean {
  if (!isUnique(error)) return false;
  const text = `${error.message} ${error.details ?? ""}`;
  return text.includes("sessions_one_open");
}
