# Domain

Arrival records who is at practice. Status is derived from an append-only log. It is not a column.

## Team

A team has an id and a name.

## Student

A student belongs to one team. The fields are id, team id, first name, last name, age, gender, parent email, and a 4 digit PIN. The PIN is unique on that team. Parent email is a roster contact. It is not a login.

## Session

A session belongs to one team. The fields are id, team id, label, QR token, and status open or closed. A team has at most one open session. Close it before opening another label. The token is the parent URL. The same URL checks a child in and out.

## Attendance

An attendance event belongs to one student and one session. The log is append-only. The fields are id, session id, student id, kind, time, tap id, and prev. Kind is check_in or check_out.

A check-in prev is null or a check-out id. A check-out prev is a check-in id. The head is the event with no child. Status comes from the head.

- No events means not yet arrived.
- A check-in head means checked in at that event's time.
- A check-out head means checked out. The child arrived at the previous event and left at the head.

A check-out with no check-in before it is illegal. A check-in whose previous event is a check-in is illegal.

The parent page mints the tap id when it renders. The same tap id retries that press. A new page load mints a new tap id, so the next press takes the next legal step. Two presses that both saw the old head write one event. The slower press leaves the log unchanged and shows the status now.

## Rejected

These are not part of Arrival.

- Stored status on the student
- A global PIN pool
- Parent accounts
- Multi-tenant orgs
- A sportsbook
- Auth beyond the practice code
- Policy inside the SQL adapter
- A second in-memory store
