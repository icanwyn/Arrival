import { headers } from "next/headers";
import { toDataURL } from "qrcode";

export async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const forwarded = headerList.get("x-forwarded-proto");
  const proto =
    forwarded ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function qrDataUrl(text: string): Promise<string> {
  return toDataURL(text, { margin: 1, width: 280 });
}
