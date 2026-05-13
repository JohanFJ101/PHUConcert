/**
 * Root layout for the Next.js App Router.
 *
 * Wraps every page in `<html>`/`<body>` and loads the global stylesheet.
 * Page-level metadata (title, description) is declared here so it
 * applies to the whole app; individual pages can still override it by
 * exporting their own `metadata`.
 */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHUConcert",
  description: "Festival wristband payment MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
