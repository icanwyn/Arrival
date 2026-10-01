"use server";

import type { PresentResult } from "@/arrival";
import { getArrival } from "@/server/arrival";

export async function submitPin(
  _previous: PresentResult | null,
  formData: FormData,
): Promise<PresentResult> {
  return getArrival().presentPin({
    token: String(formData.get("token") ?? ""),
    pin: String(formData.get("pin") ?? ""),
    tapId: String(formData.get("tapId") ?? ""),
  });
}
