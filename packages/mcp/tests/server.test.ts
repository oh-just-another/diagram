import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/server";
import { SERVER_NAME, SERVER_VERSION } from "../src/constants";

describe("createMcpServer", () => {
  it("constructs a server with all tools registered", () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
    expect(SERVER_NAME).toBe("oja-mcp");
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
