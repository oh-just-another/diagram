import type { Peer } from "./awareness.js";

/**
 * Extract `@username` tokens from a comment body. Matches alphanumeric
 * + underscore handles after `@`, lowercased for case-insensitive
 * lookup. Anchors on a word boundary so e-mail addresses (`foo@bar.com`)
 * don't false-match.
 */
export const extractMentions = (body: string): readonly string[] => {
  const out: string[] = [];
  const re = /(^|\s)@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const handle = match[2];
    if (handle !== undefined) out.push(handle.toLowerCase());
  }
  return out;
};

/**
 * Match mention tokens against the peer list (case-insensitive on the
 * peer's display name, with whitespace stripped). Returns matched
 * peers — duplicate filter applied so each peer appears at most once
 * even if mentioned several times.
 */
export const resolveMentions = (mentions: readonly string[], peers: readonly Peer[]): Peer[] => {
  const seen = new Set<number>();
  const out: Peer[] = [];
  for (const tag of mentions) {
    for (const p of peers) {
      if (seen.has(p.clientId)) continue;
      const normalised = p.user.name.replace(/\s+/g, "").toLowerCase();
      if (normalised === tag) {
        out.push(p);
        seen.add(p.clientId);
      }
    }
  }
  return out;
};

/**
 * Fire a browser Notification if the local user has been mentioned.
 * `notif` is the platform's `Notification` constructor (host passes
 * `globalThis.Notification` in browser code). No-op when not granted
 * or constructor missing — keeps `@collab` portable to Node.
 */
export const notifyMention = (
  notif:
    | {
        new (title: string, options?: { body?: string; tag?: string }): unknown;
        permission: string;
      }
    | undefined,
  opts: {
    readonly authorName: string;
    readonly body: string;
    readonly room?: string;
  },
): void => {
  if (!notif) return;
  if (notif.permission !== "granted") return;
  const title = `${opts.authorName} mentioned you`;
  new notif(title, {
    body: opts.body.slice(0, 140),
    tag: opts.room ?? "diagram-mention",
  });
};
