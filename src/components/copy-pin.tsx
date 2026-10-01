"use client";

import { useState } from "react";

export function CopyPin({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 text-base font-semibold"
      onClick={() => {
        void navigator.clipboard.writeText(pin).then(
          () => {
            setCopied(true);
          },
          () => {
            setCopied(false);
          },
        );
      }}
    >
      {copied ? "Copied" : "Copy PIN"}
    </button>
  );
}
