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
 *
 * Chrome comes from the `du-sidebar*` classes (design tokens); the
 * default width is `--du-sidebar-w`.
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
  /** Override the `--du-sidebar-w` token for this instance. */
  readonly width?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const Sidebar = ({
  children,
  defaultTab = "",
  docked = "right",
  width,
  className,
  style,
}: SidebarProps) => {
  const [active, setActive] = useState(defaultTab);
  const ctx = useMemo<SidebarContext>(() => ({ active, setActive }), [active]);
  const wrapper: CSSProperties = width === undefined ? { ...style } : { width, ...style };
  return (
    <Ctx.Provider value={ctx}>
      <aside
        className={`du-sidebar du-sidebar-${docked}${className ? ` ${className}` : ""}`}
        style={wrapper}
      >
        {children}
      </aside>
    </Ctx.Provider>
  );
};

const Header = ({ children }: { children: ReactNode }) => (
  <header className="du-sidebar-header">{children}</header>
);

const TabTriggers = ({ children }: { children: ReactNode }) => (
  <div className="du-sidebar-tabs" role="tablist">
    {children}
  </div>
);

const Trigger = ({ tab, children }: { tab: string; children: ReactNode }) => {
  const { active, setActive } = useSidebar();
  const isActive = active === tab;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-pressed={isActive}
      onClick={() => {
        setActive(tab);
      }}
      className={`du-button${isActive ? " is-active" : ""}`}
    >
      {children}
    </button>
  );
};

const Tab = ({ tab, children }: { tab: string; children: ReactNode }) => {
  const { active } = useSidebar();
  if (active !== tab) return null;
  return (
    <div className="du-sidebar-body" role="tabpanel">
      {children}
    </div>
  );
};

/** Plain section (no tab gating) — for content that's always visible. */
const Section = ({ children }: { children: ReactNode }) => (
  <div className="du-sidebar-section">{children}</div>
);

Sidebar.Header = Header;
Sidebar.TabTriggers = TabTriggers;
Sidebar.Trigger = Trigger;
Sidebar.Tab = Tab;
Sidebar.Section = Section;
