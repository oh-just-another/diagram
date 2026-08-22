/**
 * Behavioural coverage for the composable `<MainMenu>` dropdown: opening /
 * closing the panel, item clicks firing their handler and collapsing the
 * menu, disabled items staying inert, links carrying the right attributes,
 * the radio `Toggle`, and nested `Submenu` expansion.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MainMenu } from "../src/index";

afterEach(cleanup);

const trigger = (container: HTMLElement): HTMLButtonElement =>
  container.querySelector('button[aria-label="Main menu"]') as HTMLButtonElement;

describe("MainMenu open/close", () => {
  it("toggles the panel open on trigger click and reflects aria-expanded", () => {
    const { container } = render(
      <MainMenu>
        <MainMenu.Item>One</MainMenu.Item>
      </MainMenu>,
    );
    const btn = trigger(container);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[role="menu"]')).toBeNull();

    act(() => {
      fireEvent.click(btn);
    });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    act(() => {
      fireEvent.click(btn);
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on Escape and on outside pointerdown", () => {
    const { container } = render(
      <MainMenu>
        <MainMenu.Item>One</MainMenu.Item>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();

    // Re-open, then click outside.
    act(() => {
      fireEvent.click(trigger(container));
    });
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("MainMenu.Item", () => {
  it("fires onClick and closes the menu", () => {
    const onClick = vi.fn();
    const { container, getByText } = render(
      <MainMenu>
        <MainMenu.Item onClick={onClick} shortcut="⌘S">
          Save
        </MainMenu.Item>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    act(() => {
      fireEvent.click(getByText("Save"));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    // Menu closed after activation.
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("does not fire onClick when disabled and keeps the menu open", () => {
    const onClick = vi.fn();
    const { container, getByText } = render(
      <MainMenu>
        <MainMenu.Item onClick={onClick} disabled>
          Nope
        </MainMenu.Item>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    act(() => {
      fireEvent.click(getByText("Nope"));
    });
    expect(onClick).not.toHaveBeenCalled();
    // Disabled item click is a no-op; the click never reaches `close()`.
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});

describe("MainMenu.ItemLink", () => {
  it("renders an anchor with href and adds target/rel for external links", () => {
    const { container, getByText } = render(
      <MainMenu>
        <MainMenu.ItemLink href="#docs">Docs</MainMenu.ItemLink>
        <MainMenu.ItemLink href="https://x.dev" external>
          External
        </MainMenu.ItemLink>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    // Labels sit inside a gutter span; climb to the anchor itself.
    const internal = getByText("Docs").closest("a") as HTMLAnchorElement;
    expect(internal.getAttribute("href")).toBe("#docs");
    expect(internal.getAttribute("target")).toBeNull();

    const external = getByText("External").closest("a") as HTMLAnchorElement;
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toContain("noopener");

    // Clicking a link closes the menu.
    act(() => {
      fireEvent.click(internal);
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
});

describe("MainMenu.Toggle", () => {
  it("marks the active option and fires onChange on click", () => {
    const onChange = vi.fn();
    const { container, getByLabelText } = render(
      <MainMenu>
        <MainMenu.Toggle
          value="dark"
          onChange={onChange}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    const dark = getByLabelText("Dark");
    const light = getByLabelText("Light");
    expect(dark.getAttribute("aria-checked")).toBe("true");
    expect(light.getAttribute("aria-checked")).toBe("false");

    act(() => {
      fireEvent.click(light);
    });
    expect(onChange).toHaveBeenCalledWith("light");
    // Toggle keeps the menu open.
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});

describe("MainMenu.Submenu", () => {
  it("expands on click and lets a child item fire + close the whole chain", () => {
    const onExport = vi.fn();
    const { container } = render(
      <MainMenu>
        <MainMenu.Submenu label="Export">
          <MainMenu.Item onClick={onExport}>PNG</MainMenu.Item>
        </MainMenu.Submenu>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    // Child not visible until the submenu opens.
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);

    act(() => {
      fireEvent.click(screen.getByText("Export"));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(2);

    act(() => {
      fireEvent.click(screen.getByText("PNG"));
    });
    expect(onExport).toHaveBeenCalledTimes(1);
    // Root menu collapses via the shared close() context.
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("does not open when disabled", () => {
    const { container } = render(
      <MainMenu>
        <MainMenu.Submenu label="Export" disabled>
          <MainMenu.Item>PNG</MainMenu.Item>
        </MainMenu.Submenu>
      </MainMenu>,
    );
    act(() => {
      fireEvent.click(trigger(container));
    });
    act(() => {
      fireEvent.click(screen.getByText("Export"));
    });
    // Still only the root menu — submenu stayed closed.
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
  });
});
