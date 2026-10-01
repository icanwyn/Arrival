"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { PresentResult } from "@/arrival";
import { submitPin } from "./actions";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinPad({ token, tapId }: { token: string; tapId: string }) {
  const [pin, setPin] = useState("");
  const [state, action] = useActionState(submitPin, null);

  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <p className="text-4xl font-semibold">
          {state.firstName} {state.lastName}
        </p>
        <p className="text-3xl">{state.status === "checked_in" ? "Checked in" : "Checked out"}</p>
        <a
          className="inline-flex min-h-14 w-full items-center justify-center rounded-lg border border-zinc-300 text-lg font-semibold"
          href={`/s/${token}`}
        >
          Another kid
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="tapId" value={tapId} />
      <input type="hidden" name="pin" value={pin} />
      <p className="min-h-16 text-center font-mono text-5xl tracking-[0.3em]" aria-live="polite">
        {pin.padEnd(4, "·")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {digits.map((digit) => (
          <Digit key={digit} digit={digit} setPin={setPin} />
        ))}
        <button
          type="button"
          className="min-h-20 rounded-lg bg-zinc-100 text-xl font-semibold"
          onClick={() => setPin((current) => current.slice(0, -1))}
        >
          Back
        </button>
        <Digit digit="0" setPin={setPin} />
        <span />
      </div>
      {state ? <p className="text-lg text-red-700">{pinMessage(state)}</p> : null}
      <SubmitButton />
    </form>
  );
}

function Digit({ digit, setPin }: { digit: string; setPin: (value: string | ((current: string) => string)) => void }) {
  return (
    <button
      type="button"
      className="min-h-20 rounded-lg bg-zinc-100 text-3xl font-semibold"
      onClick={() => setPin((current) => (current.length < 4 ? `${current}${digit}` : current))}
    >
      {digit}
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-16 w-full items-center justify-center rounded-lg bg-zinc-950 text-xl font-semibold text-white disabled:opacity-60"
    >
      Submit
    </button>
  );
}

function pinMessage(result: PresentResult): string {
  if (result.ok) return "";
  if (result.reason === "unknown_pin") return "No kid has that PIN";
  if (result.reason === "malformed_pin") return "Enter 4 digits";
  if (result.reason === "session_closed") return "Practice is closed";
  if (result.reason === "unknown_token") return "That practice link is not valid.";
  return "Try again.";
}
