import type { ReactNode } from "react";

export const metadata = {
  title: "oh-diagram · Next.js",
  description: "Diagram editor in a Next.js App Router app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
