import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ApplyLedger — your application workspace",
  description:
    "A private local job application tracker with timelines and portable backups.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
