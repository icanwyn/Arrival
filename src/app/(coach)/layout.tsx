import { coachUnlocked } from "@/server/coach";
import { GateForm } from "./gate-form";

export const dynamic = "force-dynamic";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const unlocked = await coachUnlocked();
  if (!unlocked) return <GateForm />;
  return children;
}
