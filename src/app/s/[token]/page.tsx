import { getArrival } from "@/server/arrival";
import { PinPad } from "./pin-pad";

function ParentPad({ token }: { token: string }) {
  const tapId = crypto.randomUUID();
  return <PinPad key={tapId} token={token} tapId={tapId} />;
}

export const dynamic = "force-dynamic";

export default async function ParentPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const session = await getArrival().resolveSession({ token });
  if (!session.ok) return <p className="text-lg">That practice link is not valid.</p>;

  return (
    <div className="grid gap-4">
      <h1 className="text-3xl font-semibold">{session.teamName}</h1>
      <p className="text-xl">{session.label}</p>
      {session.status === "closed" ? (
        <p className="text-2xl">Practice is closed</p>
      ) : (
        <ParentPad token={token} />
      )}
    </div>
  );
}
