import Image from "next/image";
import { CopyPin } from "@/components/copy-pin";
import { getArrival } from "@/server/arrival";
import { qrDataUrl, requestOrigin } from "@/server/qr";
import { closePractice, createTeam, openPractice, uploadRoster, useSample } from "./actions";

export const dynamic = "force-dynamic";

const primary =
  "inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-zinc-950 px-4 text-lg font-semibold text-white";
const secondary =
  "inline-flex min-h-14 w-full items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-lg font-semibold text-zinc-950";
const field = "mt-1 min-h-14 w-full rounded-lg border border-zinc-300 bg-white px-3 text-lg font-normal";

export default async function CoachHome({ searchParams }: PageProps<"/">) {
  const query = await searchParams;
  const notice = typeof query.notice === "string" ? query.notice : "";
  const teams = await getArrival().listTeams();
  const team = teams[0];

  return (
    <div className="grid gap-6">
      {notice ? <p className="text-lg text-red-700">{notice}</p> : null}
      {team ? <TeamDesk teamId={team.id} teamName={team.name} /> : <CreateTeam />}
    </div>
  );
}

function CreateTeam() {
  return (
    <form action={createTeam} className="grid gap-3">
      <label className="grid gap-1 text-lg font-semibold" htmlFor="team-name">
        Team name
        <input id="team-name" name="name" required maxLength={80} className={field} />
      </label>
      <button type="submit" className={primary}>
        Create team
      </button>
    </form>
  );
}

async function TeamDesk({ teamId, teamName }: { teamId: string; teamName: string }) {
  const desk = await getArrival().coachDesk({ teamId });
  if (!desk.ok) return <CreateTeam />;
  const open = desk.sessions.find((session) => session.status === "open");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold">{teamName}</h1>
      <form action={uploadRoster} className="grid gap-3">
        <label className="grid gap-1 text-lg font-semibold" htmlFor="roster-file">
          Roster CSV
          <input
            id="roster-file"
            name="roster"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-1 block w-full text-base font-normal"
          />
        </label>
        <button type="submit" className={secondary}>
          Upload roster
        </button>
      </form>
      <form action={useSample}>
        <button type="submit" className={secondary}>
          Use sample roster
        </button>
      </form>
      {desk.roster.length === 0 ? (
        <p className="text-lg">No kids yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-zinc-300">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Age</th>
                <th className="py-2 pr-3 font-semibold">Gender</th>
                <th className="py-2 pr-3 font-semibold">Parent email</th>
                <th className="py-2 pr-3 font-semibold">PIN</th>
                <th className="py-2 font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {desk.roster.map((student) => {
                const subject = encodeURIComponent("Practice PIN");
                const body = encodeURIComponent(`${student.firstName} ${student.lastName}\n${student.pin}`);
                return (
                  <tr key={student.id} className="border-b border-zinc-200 align-top">
                    <td className="py-3 pr-3">
                      {student.firstName} {student.lastName}
                    </td>
                    <td className="py-3 pr-3">{student.age}</td>
                    <td className="py-3 pr-3">{student.gender}</td>
                    <td className="py-3 pr-3">{student.parentEmail}</td>
                    <td className="py-3 pr-3 font-mono text-xl">{student.pin}</td>
                    <td className="py-3">
                      <div className="flex flex-col gap-2">
                        <CopyPin pin={student.pin} />
                        <a
                          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 px-3 font-semibold"
                          href={`mailto:${student.parentEmail}?subject=${subject}&body=${body}`}
                        >
                          Email PIN
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open ? <OpenPractice sessionId={open.id} label={open.label} token={open.token} /> : <OpenForm today={today} />}
    </div>
  );
}

function OpenForm({ today }: { today: string }) {
  return (
    <form action={openPractice} className="grid gap-3">
      <label className="grid gap-1 text-lg font-semibold" htmlFor="practice-label">
        Label
        <input id="practice-label" name="label" defaultValue={today} maxLength={80} className={field} />
      </label>
      <button type="submit" className={primary}>
        Open practice
      </button>
    </form>
  );
}

async function OpenPractice({
  sessionId,
  label,
  token,
}: {
  sessionId: string;
  label: string;
  token: string;
}) {
  const url = `${await requestOrigin()}/s/${token}`;
  const qr = await qrDataUrl(url);

  return (
    <div className="grid gap-3">
      <h2 className="text-2xl font-semibold">{label}</h2>
      <Image src={qr} alt="Parent link QR code" width={280} height={280} className="h-auto w-full max-w-xs" />
      <a className="break-all text-lg underline" href={url}>
        {url}
      </a>
      <a className={secondary} href={`/session/${sessionId}`}>
        Board
      </a>
      <form action={closePractice}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <button type="submit" className={primary}>
          Close practice
        </button>
      </form>
    </div>
  );
}
