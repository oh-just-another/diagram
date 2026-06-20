import {
  createContext,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Composable sidebar. The root `<Sidebar>` owns the open tab state;
 * children (`Sidebar.Header`, `Sidebar.Tabs`, `Sidebar.Trigger`,
 * `Sidebar.TabTriggers`, `Sidebar.Tab`) lay out the panel.
 *
 * Hosts compose, e.g.:
 *
 *   <Sidebar defaultTab="layers" docked="right">
 *     <Sidebar.Header>Inspector</Sidebar.Header>
 *     <Sidebar.TabTriggers>
 *       <Sidebar.Trigger tab="layers">Layers</Sidebar.Trigger>
 *       <Sidebar.Trigger tab="comments">Comments</Sidebar.Trigger>
 *     </Sidebar.TabTriggers>
 *     <Sidebar.Tab tab="layers"><LayerPanel/></Sidebar.Tab>
 *     <Sidebar.Tab tab="comments"><CommentsPanel/></Sidebar.Tab>
 *   </Sidebar>
 */

interface SidebarContext {
  readonly active: string;
  readonly setActive: (tab: string) => void;
}

const Ctx = createContext<SidebarContext | null>(null);
const useSidebar = (): SidebarContext => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Sidebar sub-component must be inside <Sidebar>");
  return ctx;
};

export interface SidebarProps {
  readonly children: ReactNode;
  readonly defaultTab?: string;
  /** Where the sidebar attaches; affects the divider border. */
  readonly docked?: "left" | "right";
  readonly width?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const Sidebar = ({
  children,
  defaultTab = "",
  docked = "right",
  width = 280,
  className,
  style,
}: SidebarProps) => {
  const [active, setActive] = useState(defaultTab);
  const ctx = useMemo<SidebarContext>(() => ({ active, setActive }), [active]);
  const wrapper: CSSProperties = {
    width,
    background: "var(--panel, #161616)",
    color: "var(--text, #ddd)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    borderLeft: docked === "right" ? "1px solid var(--border, #2a2a2a)" : "none",
    borderRight: docked === "left" ? "1px solid var(--border, #2a2a2a)" : "none",
    ...style,
  };
  return (
    <Ctx.Provider value={ctx}>
      <aside className={className} style={wrapper}>
        {children}
      </aside>
    </Ctx.Provider>
  );
};

const Header = ({ children }: { children: ReactNode }) => (
  <header
    style={{
      padding: "12px 14px",
      fontSize: 13,
      fontWeight: 600,
      color: "var(--text-strong, #fff)",
      borderBottom: "1px solid var(--border, #2a2a2a)",
    }}
  >
    {children}
  </header>
);

const TabTriggers = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      gap: 4,
      padding: "8px 10px",
      borderBottom: "1px solid var(--border, #2a2a2a)",
    }}
  >
    {children}
  </div>
);

const Trigger = ({ tab, children }: { tab: string; children: ReactNode }) => {
  const { active, setActive } = useSidebar();
  const isActive = active === tab;
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={() => {
        setActive(tab);
      }}
      style={{
        background: isActive ? "var(--accent, #1a73e8)" : "transparent",
        color: isActive ? "var(--surface, #fff)" : "var(--text, #ddd)",
        border: `1px solid ${isActive ? "var(--accent, #1a73e8)" : "var(--border, #2a2a2a)"}`,
        borderRadius: 4,
        padding: "4px 10px",
        fontSize: 12,
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {children}
    </button>
  );
};

const Tab = ({ tab, children }: { tab: string; children: ReactNode }) => {
  const { active } = useSidebar();
  if (active !== tab) return null;
  return (
    <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "10px 12px" }}>{children}</div>
  );
};

/** Plain section (no tab gating) — for content that's always visible. */
const Section = ({ children }: { children: ReactNode }) => (
  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border, #2a2a2a)" }}>
    {children}
  </div>
);

Sidebar.Header = Header;
Sidebar.TabTriggers = TabTriggers;
Sidebar.Trigger = Trigger;
Sidebar.Tab = Tab;
Sidebar.Section = Section;
