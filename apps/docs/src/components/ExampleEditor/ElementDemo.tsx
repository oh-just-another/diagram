import { useEffect, useRef, useState, type ReactNode } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

/**
 * Live `<oja-diagram>` demo. The custom element is framework-agnostic, so it
 * runs inside this React docs site exactly as it would in any page: importing
 * `@oh-just-another/diagram` auto-defines the tag, and the attributes below
 * are the element's real public surface. Browser-only, so the import lives in
 * an effect (never runs during the static build).
 */
export default function ElementDemo({ height = "780px" }: { height?: string }): ReactNode {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneUrl = useBaseUrl("/scenes/edges-straight-ortho.json");

  useEffect(() => {
    let alive = true;
    void Promise.all([
      import("@oh-just-another/diagram"),
      import("@oh-just-another/serialization"),
      fetch(sceneUrl).then((r) => r.text()),
    ]).then(([, ser, sceneJson]) => {
      if (!alive || !hostRef.current) return;
      // Created imperatively so the static build never sees the unknown tag.
      const el = document.createElement("oja-diagram") as HTMLElement & { scene: unknown };
      el.setAttribute("theme", "system");
      el.setAttribute("grid", "");
      el.setAttribute("snap", "");
      el.style.display = "block";
      el.style.height = "100%";
      // The `scene` property queues until the element is ready — set it up
      // front so the demo opens with content instead of a blank canvas.
      el.scene = ser.parseScene(sceneJson);
      hostRef.current.appendChild(el);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        border: "1px solid var(--ifm-color-emphasis-300)",
        marginBottom: "1rem",
      }}
    >
      {!ready && (
        <div
          style={{
            height: "100%",
            display: "grid",
            placeItems: "center",
            color: "var(--ifm-color-emphasis-600)",
          }}
        >
          Loading the element…
        </div>
      )}
    </div>
  );
}
