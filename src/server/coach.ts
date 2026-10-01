import { cookies } from "next/headers";

export const COACH_COOKIE = "arrival_coach";

export function expectedCoachCode(): string {
  const configured = process.env.COACH_CODE?.trim();
  return configured ? configured : "practice";
}

export async function coachUnlocked(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(COACH_COOKIE)?.value === expectedCoachCode();
}
