import { mkdirSync } from "node:fs";
import { createClient as createLibsql } from "@libsql/client";
import { createClient } from "@supabase/supabase-js";
import { bindArrival, brandIsoInstant, type Arrival, type Entropy } from "@/arrival";
import { libsqlStore } from "@/arrival-store";
import { supabaseStore } from "@/supabase-store";

let cached: Arrival | undefined;

export function getArrival(): Arrival {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cached = bindArrival({ store: supabaseStore(client), entropy: nodeEntropy() });
    return cached;
  }
  if (process.env.VERCEL) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  const file = "file:data/arrival.db";
  ensureFileDirectory(file);
  cached = bindArrival({ store: libsqlStore(createLibsql({ url: file })), entropy: nodeEntropy() });
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
