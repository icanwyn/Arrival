"use client";

import { useEffect, useState } from "react";

type BoardRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
} & (
  | { status: "not_yet_arrived" }
  | { status: "checked_in"; checkInAt: string }
  | { status: "checked_out"; checkInAt: string; checkOutAt: string }
);

type BoardPayload = {
  ok: true;
  label: string;
  status: "open" | "closed";
  rows: BoardRow[];
};

const rank = {
  checked_in: 0,
  not_yet_arrived: 1,
  checked_out: 2,
} as const;

export function BoardLive({ sessionId, initial }: { sessionId: string; initial: BoardPayload }) {
  const [board, setBoard] = useState(initial);

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(() => {
      void fetch(`/session/${sessionId}/board`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: BoardPayload | null) => {
          if (!stopped && body?.ok) setBoard(body);
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const rows = [...board.rows].sort((a, b) => {
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.lastName < b.lastName) return -1;
    if (a.lastName > b.lastName) return 1;
    if (a.firstName < b.firstName) return -1;
    if (a.firstName > b.firstName) return 1;
    return 0;
  });
  const stillHere = rows.filter((row) => row.status === "checked_in").length;
  const pickedUp = rows.filter((row) => row.status === "checked_out").length;
  const notHere = rows.filter((row) => row.status === "not_yet_arrived").length;

  return (
    <div className="grid gap-4">
      <h1 className="text-3xl font-semibold">{board.label}</h1>
      {board.status === "closed" ? <p className="text-lg">Practice is closed</p> : null}
      <div className="grid grid-cols-3 gap-2 text-center">
        <p className="rounded-lg bg-zinc-100 px-2 py-3">
          <span className="block text-3xl font-semibold">{stillHere}</span>
          <span className="text-sm">Still here</span>
        </p>
        <p className="rounded-lg bg-zinc-100 px-2 py-3">
          <span className="block text-3xl font-semibold">{pickedUp}</span>
          <span className="text-sm">Picked up</span>
        </p>
        <p className="rounded-lg bg-zinc-100 px-2 py-3">
          <span className="block text-3xl font-semibold">{notHere}</span>
          <span className="text-sm">Not here yet</span>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Age</th>
              <th className="py-2 pr-3 font-semibold">Gender</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">In</th>
              <th className="py-2 font-semibold">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.studentId} className={`border-b border-zinc-200 ${rowTone(row.status)}`}>
                <td className="py-3 pr-3">
                  {row.firstName} {row.lastName}
                </td>
                <td className="py-3 pr-3">{row.age}</td>
                <td className="py-3 pr-3">{row.gender}</td>
                <td className="py-3 pr-3">{statusText(row.status)}</td>
                <td className="py-3 pr-3">{row.status === "not_yet_arrived" ? "" : clock(row.checkInAt)}</td>
                <td className="py-3">{row.status === "checked_out" ? clock(row.checkOutAt) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusText(status: BoardRow["status"]): string {
  if (status === "checked_in") return "Checked in";
  if (status === "checked_out") return "Checked out";
  return "Not yet arrived";
}

function rowTone(status: BoardRow["status"]): string {
  if (status === "checked_in") return "bg-emerald-50";
  if (status === "checked_out") return "text-zinc-500";
  return "";
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
