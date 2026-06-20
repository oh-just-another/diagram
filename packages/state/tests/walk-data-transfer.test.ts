import { describe, expect, it, vi } from "vitest";
import { walkDataTransfer } from "../src/file-drop.js";

const makeFile = (name: string, content = "hello"): File =>
  new File([content], name, { type: "text/plain" });

// --- stubs that mirror the FileSystemEntry / DataTransfer APIs ---

const fileEntry = (file: File) => ({
  isFile: true,
  isDirectory: false,
  name: file.name,
  file: (success: (f: File) => void): void => success(file),
});

const dirEntry = (name: string, children: unknown[]) => {
  let returned = false;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (success: (entries: unknown[]) => void): void => {
        // First call returns the children, subsequent calls return [].
        if (returned) {
          success([]);
          return;
        }
        returned = true;
        success(children);
      },
    }),
  };
};

const dt = (entries: unknown[]): DataTransfer =>
  ({
    items: entries.map((entry) => ({
      kind: "file" as const,
      webkitGetAsEntry: () => entry,
    })),
    files: [],
  }) as unknown as DataTransfer;

const flatDt = (files: File[]): DataTransfer =>
  ({
    items: [], // empty items → fallback path
    files,
  }) as unknown as DataTransfer;

const collect = async <T>(gen: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const value of gen) out.push(value);
  return out;
};

describe("walkDataTransfer", () => {
  it("falls back to flat files list when items API absent", async () => {
    const a = makeFile("a.txt");
    const b = makeFile("b.txt");
    const out = await collect(walkDataTransfer(flatDt([a, b])));
    expect(out.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("yields a single file entry verbatim", async () => {
    const a = makeFile("a.txt");
    const out = await collect(walkDataTransfer(dt([fileEntry(a)])));
    expect(out.map((f) => f.name)).toEqual(["a.txt"]);
  });

  it("descends a directory and yields its files", async () => {
    const a = makeFile("a.txt");
    const b = makeFile("b.png");
    const folder = dirEntry("imgs", [fileEntry(a), fileEntry(b)]);
    const out = await collect(walkDataTransfer(dt([folder])));
    expect(out.map((f) => f.name)).toEqual(["a.txt", "b.png"]);
  });

  it("skips hidden directories by default (.git, dotfiles, node_modules)", async () => {
    const visible = makeFile("visible.txt");
    const git = dirEntry(".git", [fileEntry(makeFile("HEAD"))]);
    const nm = dirEntry("node_modules", [fileEntry(makeFile("pkg.json"))]);
    const out = await collect(walkDataTransfer(dt([fileEntry(visible), git, nm])));
    expect(out.map((f) => f.name)).toEqual(["visible.txt"]);
  });

  it("respects custom skipDirectory predicate", async () => {
    const a = makeFile("a.txt");
    const folder = dirEntry("custom", [fileEntry(a)]);
    const out = await collect(
      walkDataTransfer(dt([folder]), { skipDirectory: (name) => name === "custom" }),
    );
    expect(out).toEqual([]);
  });

  it("reports per-entry errors via onError without aborting the whole walk", async () => {
    const badFile = {
      isFile: true,
      isDirectory: false,
      name: "bad.txt",
      file: (_: (f: File) => void, err: (e: unknown) => void): void => {
        err(new Error("read fail"));
      },
    };
    const good = makeFile("good.txt");
    const onError = vi.fn();
    const out = await collect(walkDataTransfer(dt([badFile, fileEntry(good)]), { onError }));
    expect(out.map((f) => f.name)).toEqual(["good.txt"]);
    expect(onError).toHaveBeenCalledWith("bad.txt", expect.any(Error));
  });

  it("aborts a folder branch when maxDepth is exceeded", async () => {
    // 3 levels deep; maxDepth=1 should stop one level in.
    const inner = dirEntry("d2", [fileEntry(makeFile("deep.txt"))]);
    const outer = dirEntry("d1", [inner]);
    const onError = vi.fn();
    const out = await collect(walkDataTransfer(dt([outer]), { maxDepth: 1, onError }));
    expect(out).toEqual([]);
    expect(onError).toHaveBeenCalled();
  });
});
