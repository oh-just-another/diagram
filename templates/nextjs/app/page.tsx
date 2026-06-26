"use client";

import dynamic from "next/dynamic";

// Load the editor only in the browser — it depends on canvas / WASM / workers,
// which have no server-side equivalent. `ssr: false` keeps it out of the
// server render entirely, and is only allowed from a Client Component (hence
// the directive above).
const Diagram = dynamic(() => import("../components/Diagram"), { ssr: false });

export default function Page() {
  return <Diagram />;
}
