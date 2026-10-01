import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arrival",
  description: "Check kids in and out of practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-white text-zinc-950">
        <main className="mx-auto min-h-full w-full max-w-md px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
