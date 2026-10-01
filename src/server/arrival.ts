import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { bindArrival, brandIsoInstant, type Arrival, type Entropy } from "@/arrival";
import { libsqlStore } from "@/arrival-store";

let cached: Arrival | undefined;

export function getArrival(): Arrival {
  if (cached) return cached;
  const configured = process.env.TURSO_DATABASE_URL?.trim();
  const url = configured ? configured : "file:data/arrival.db";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (url.startsWith("file:")) ensureFileDirectory(url);
  const client = createClient(
    !url.startsWith("file:") && authToken ? { url, authToken } : { url },
  );
  cached = bindArrival({ store: libsqlStore(client), entropy: nodeEntropy() });
  return cached;
}

function nodeEntropy(): Entropy {
  return {
    id: () => crypto.randomUUID(),
    token: () => {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      let hex = "";
      for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
      return hex;
    },
    pinStart: () => crypto.getRandomValues(new Uint32Array(1))[0] % 10000,
    now: () => brandIsoInstant(new Date().toISOString()),
  };
}

function ensureFileDirectory(url: string): void {
  const path = url.slice("file:".length).replace(/^\/\//, "");
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return;
  mkdirSync(path.slice(0, slash), { recursive: true });
}
