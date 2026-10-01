"use client";

import { useActionState } from "react";
import { unlockCoach } from "./actions";

export function GateForm() {
  const [state, action] = useActionState(unlockCoach, { error: "" });

  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 text-lg font-semibold" htmlFor="practice-code">
        Practice code
        <input
          id="practice-code"
          name="code"
          type="text"
          autoComplete="off"
          autoFocus
          className="min-h-14 w-full rounded-lg border border-zinc-300 bg-white px-3 text-lg font-normal"
        />
      </label>
      {state.error ? <p className="text-lg text-red-700">{state.error}</p> : null}
      <button
        type="submit"
        className="inline-flex min-h-14 w-full items-center justify-center rounded-lg bg-zinc-950 px-4 text-lg font-semibold text-white"
      >
        Continue
      </button>
    </form>
  );
}
