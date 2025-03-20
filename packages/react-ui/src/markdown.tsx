import type { ReactNode } from "react";

/**
 * Lightweight regex-only markdown renderer for comment bodies.
 * Supported subset:
 *
 *   • `**bold**`   → `<strong>`
 *   • `*italic*`   → `<em>`
 *   • `_italic_`   → `<em>`
 *   • `` `code` `` → `<code>` (inline only)
 *   • `[label](url)` → `<a href="...">` (http/https/mailto only)
 *
 * Line breaks become `<br />`; whitespace is otherwise preserved.
 *
 * Every URL goes through `safeUrl()`; everything else is plain text
 * put inside React children, so React escapes it. No
 * `dangerouslySetInnerHTML`.
 */

const URL_RE = /^(https?:|mailto:)/i;

const safeUrl = (raw: string): string | null => (URL_RE.test(raw) ? raw : null);

interface Token {
  readonly kind: "text" | "bold" | "italic" | "code" | "link";
  readonly value: string;
  readonly href?: string;
}

/**
 * Tokenise a single line of comment text. Greedy left-to-right scan;
 * on no match emit the next char as a text token and advance.
 */
const tokenise = (line: string): readonly Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  let textBuf = "";
  const flushText = (): void => {
    if (textBuf.length > 0) {
      tokens.push({ kind: "text", value: textBuf });
      textBuf = "";
    }
  };

  while (i < line.length) {
    // **bold**
    if (line[i] === "*" && line[i + 1] === "*") {
      const close = line.indexOf("**", i + 2);
      if (close !== -1) {
        flushText();
        tokens.push({ kind: "bold", value: line.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    // *italic* or _italic_
    if (line[i] === "*" || line[i] === "_") {
      const close = line.indexOf(line[i]!, i + 1);
      if (close !== -1 && close > i + 1) {
        flushText();
        tokens.push({ kind: "italic", value: line.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // `code`
    if (line[i] === "`") {
      const close = line.indexOf("`", i + 1);
      if (close !== -1) {
        flushText();
        tokens.push({ kind: "code", value: line.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    // [label](url)
    if (line[i] === "[") {
      const labelClose = line.indexOf("](", i + 1);
      if (labelClose !== -1) {
        const urlClose = line.indexOf(")", labelClose + 2);
        if (urlClose !== -1) {
          const label = line.slice(i + 1, labelClose);
          const url = line.slice(labelClose + 2, urlClose);
          const safe = safeUrl(url);
          if (safe) {
            flushText();
            tokens.push({ kind: "link", value: label, href: safe });
            i = urlClose + 1;
            continue;
          }
        }
      }
    }
    textBuf += line[i]!;
    i++;
  }
  flushText();
  return tokens;
};

/**
 * Convert a tokenised line into React children. Text tokens are
 * emitted as plain children so React handles escaping.
 */
const tokensToNodes = (tokens: readonly Token[], baseKey: string): ReactNode[] =>
  tokens.map((t, i) => {
    const key = `${baseKey}-${i}`;
    if (t.kind === "bold") return <strong key={key}>{t.value}</strong>;
    if (t.kind === "italic") return <em key={key}>{t.value}</em>;
    if (t.kind === "code") {
      return (
        <code
          key={key}
          style={{
            background: "var(--code-bg, rgba(255,255,255,0.08))",
            padding: "0 4px",
            borderRadius: 2,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.92em",
          }}
        >
          {t.value}
        </code>
      );
    }
    if (t.kind === "link") {
      return (
        <a key={key} href={t.href} target="_blank" rel="noopener noreferrer">
          {t.value}
        </a>
      );
    }
    return <span key={key}>{t.value}</span>;
  });

export interface MarkdownProps {
  readonly text: string;
}

/**
 * Render plain text as React nodes with inline markdown. Each line is
 * tokenised separately; lines are joined with `<br />`.
 */
export const Markdown = ({ text }: MarkdownProps): ReactNode => {
  if (!text) return null;
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) out.push(<br key={`br-${i}`} />);
    const tokens = tokenise(lines[i]!);
    out.push(...tokensToNodes(tokens, `l${i}`));
  }
  return out;
};
