import { getArrival } from "@/server/arrival";
import { BoardLive } from "./board-live";

export const dynamic = "force-dynamic";

export default async function BoardPage({ params }: PageProps<"/session/[id]">) {
  const { id } = await params;
  const board = await getArrival().sessionBoard({ sessionId: id });
  if (!board.ok) return <p className="text-lg">That practice was not found.</p>;

  return (
    <BoardLive
      sessionId={id}
      initial={{
        ok: true,
        label: board.label,
        status: board.status,
        rows: board.rows.map((row) => ({ ...row })),
      }}
    />
  );
}
