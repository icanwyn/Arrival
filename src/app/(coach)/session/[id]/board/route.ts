import { getArrival } from "@/server/arrival";
import { coachUnlocked } from "@/server/coach";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await coachUnlocked())) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const board = await getArrival().sessionBoard({ sessionId: id });
  return Response.json(board, { headers: { "Cache-Control": "no-store" } });
}
