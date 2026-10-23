import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Horizon Internal", template: "%s · Horizon Internal" },
  description: "Horizon platform administration and analytics",
  icons: { icon: "/horizon-orbit-logo-transparent.png" },
  robots: { index: false, follow: false },
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
