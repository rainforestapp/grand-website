import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grand",
  description:
    "Grace is a gentle AI companion for older people and quiet reassurance for their family.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
