"use server";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ImportRosterResult } from "@/arrival";
import { getArrival } from "@/server/arrival";
import { COACH_COOKIE, expectedCoachCode } from "@/server/coach";

export async function unlockCoach(
  _previous: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const code = String(formData.get("code") ?? "").trim();
  if (code !== expectedCoachCode()) return { error: "Wrong code" };
  const headerList = await headers();
  const jar = await cookies();
  jar.set(COACH_COOKIE, expectedCoachCode(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: headerList.get("x-forwarded-proto") === "https",
  });
  redirect(nextPath(headerList.get("referer")));
}

export async function createTeam(formData: FormData) {
  const result = await getArrival().createTeam({ name: String(formData.get("name") ?? "") });
  if (!result.ok) redirect("/?notice=Enter a team name.");
  revalidatePath("/");
  redirect("/");
}

export async function uploadRoster(formData: FormData) {
  const file = formData.get("roster");
  if (!(file instanceof File) || file.size === 0) redirect("/?notice=Choose a CSV file.");
  if (file.size > 100_000) redirect("/?notice=That file is too large.");
  await finishImport(await file.text());
}

export async function useSample() {
  const text = await readFile(join(process.cwd(), "samples", "hawks.csv"), "utf8");
  await finishImport(text);
}

export async function openPractice(formData: FormData) {
  const team = await firstTeam();
  if (!team) redirect("/?notice=Create a team first.");
  const result = await getArrival().openSession({
    teamId: team.id,
    label: String(formData.get("label") ?? ""),
  });
  if (!result.ok) {
    const notice = result.reason === "invalid_label" ? "Enter a practice name." : "Create a team first.";
    redirect(`/?notice=${encodeURIComponent(notice)}`);
  }
  revalidatePath("/");
  redirect("/");
}

export async function closePractice(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  await getArrival().closeSession({ sessionId });
  revalidatePath("/");
  revalidatePath(`/session/${sessionId}`);
  redirect("/");
}

async function finishImport(csvText: string) {
  const team = await firstTeam();
  if (!team) redirect("/?notice=Create a team first.");
  const result = await getArrival().importRoster({ teamId: team.id, csvText });
  if (!result.ok) redirect(`/?notice=${encodeURIComponent(importNotice(result))}`);
  revalidatePath("/");
  redirect("/");
}

async function firstTeam() {
  const teams = await getArrival().listTeams();
  return teams[0] ?? null;
}

function importNotice(result: Exclude<ImportRosterResult, { ok: true }>): string {
  if (result.reason === "unknown_team") return "Create a team first.";
  if (result.reason === "pin_space_exhausted") return "No PINs left.";
  return result.errors
    .slice(0, 4)
    .map((error) => `Line ${error.line}: ${error.message}`)
    .join(" ");
}

function nextPath(referer: string | null): string {
  if (!referer) return "/";
  try {
    const url = new URL(referer);
    if (url.pathname.startsWith("/s/")) return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}
