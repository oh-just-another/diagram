import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Live Vue demo — no microfrontend involved: a REAL Vue app is created at
 * runtime (`createApp`) and mounted into a plain div this React page owns,
 * rendering the actual `@oh-just-another/diagram-vue` wrapper. The two
 * frameworks coexist because the wrapper is a thin shell over the
 * `<oja-diagram>` custom element. Cleaned up with `app.unmount()`.
 */
export default function VueDemo({ height = "420px" }: { height?: string }): ReactNode {
  const [ready, setReady] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    let app: { mount: (el: Element) => unknown; unmount: () => void } | null = null;
    void Promise.all([import("vue"), import("@oh-just-another/diagram-vue")]).then(
      ([vue, wrapper]) => {
        if (!alive || !hostRef.current) return;
        // Vue's mount() replaces the target's children — give it a nested div
        // React never renders into, or React's own reconciliation explodes.
        const target = document.createElement("div");
        target.style.height = "100%";
        hostRef.current.appendChild(target);
        app = vue.createApp({
          render: () =>
            vue.h(wrapper.Diagram, {
              theme: "system",
              grid: true,
              snap: true,
              style: "display:block;height:100%",
            }),
        });
        app.mount(target);
        setReady(true);
      },
    );
    return () => {
      alive = false;
      app?.unmount();
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
          Loading Vue…
        </div>
      )}
    </div>
  );
}
