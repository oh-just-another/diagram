import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "../src/markdown";

const html = (text: string): string => {
  const { container } = render(<div>{<Markdown text={text} />}</div>);
  return container.firstElementChild!.innerHTML;
};

describe("Markdown renderer", () => {
  it("returns null for empty string", () => {
    const { container } = render(<>{<Markdown text="" />}</>);
    expect(container.textContent).toBe("");
  });

  it("renders plain text as plain text", () => {
    expect(html("hello world")).toBe("<span>hello world</span>");
  });

  it("**bold** becomes <strong>", () => {
    expect(html("**boom**")).toBe("<strong>boom</strong>");
  });

  it("*italic* becomes <em>", () => {
    expect(html("*emph*")).toBe("<em>emph</em>");
  });

  it("_italic_ becomes <em>", () => {
    expect(html("_emph_")).toBe("<em>emph</em>");
  });

  it("`code` becomes <code>", () => {
    const out = html("`x.y`");
    expect(out).toContain("<code");
    expect(out).toContain("x.y");
  });

  it("[label](https://example.com) becomes safe anchor", () => {
    const out = html("[click](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("rejects javascript: URL — falls back to literal text", () => {
    const out = html("[xss](javascript:alert(1))");
    expect(out).not.toContain("href=");
    expect(out).toContain("xss");
    expect(out).toContain("alert");
  });

  it("supports mailto: link", () => {
    const out = html("[me](mailto:a@b.c)");
    expect(out).toContain('href="mailto:a@b.c"');
  });

  it("line break becomes <br />", () => {
    const out = html("a\nb");
    expect(out).toMatch(/<br ?\/?>/);
    expect(out).toContain("a");
    expect(out).toContain("b");
  });

  it("mixes inline kinds in one line", () => {
    const out = html("**A** _b_ `c`");
    expect(out).toContain("<strong>A</strong>");
    expect(out).toContain("<em>b</em>");
    expect(out).toContain("<code");
  });

  it("text containing < > & is escaped by React", () => {
    const out = html("a <b> & c");
    expect(out).toContain("&lt;b&gt;");
    expect(out).toContain("&amp;");
  });
});
