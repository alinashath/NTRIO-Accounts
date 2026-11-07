import { createMcpHandler, McpServer, type AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod4";
import { prisma } from "../lib/prisma.js";
import { normalizeEnabledModules } from "../lib/workspaces.js";
import { buildAgentGuide } from "./agentGuide.js";
import { toolsForModules, type McpToolDef } from "./catalog.js";
import { dispatchApi, formatDispatchResult } from "./dispatch.js";
import { fetchReceipt, uploadReceiptBase64 } from "./receipts.js";

export type McpAuthExtra = {
  mcpUserId: string;
  organizationId: string;
  dataOwnerId: string;
  accessToken: string;
};

function readExtra(authInfo: AuthInfo | undefined): McpAuthExtra | null {
  const extra = authInfo?.extra as McpAuthExtra | undefined;
  if (!extra?.mcpUserId || !extra.organizationId || !extra.dataOwnerId || !extra.accessToken) {
    return null;
  }
  return extra;
}

function buildPath(def: McpToolDef, args: Record<string, unknown>): string {
  let path = def.path;
  for (const key of def.pathParams ?? []) {
    const v = args[key];
    if (v === undefined || v === null || String(v).length === 0) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    path = path.replace(`{${key}}`, encodeURIComponent(String(v)));
  }
  return path;
}

function stripPathParams(def: McpToolDef, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const key of def.pathParams ?? []) {
    delete out[key];
  }
  return out;
}

async function audit(mcpUserId: string, organizationId: string, toolName: string) {
  try {
    await prisma.mcpAuditEvent.create({
      data: { mcpUserId, organizationId, toolName },
    });
  } catch (e) {
    console.error("[mcp audit]", e);
  }
}

export function createNtrioMcpHandler() {
  return createMcpHandler(
    async (ctx) => {
      const authInfo = ctx.authInfo;
      const extra = readExtra(authInfo);

      let enabled = normalizeEnabledModules(undefined);
      if (extra) {
        const org = await prisma.organization.findUnique({
          where: { id: extra.organizationId },
          select: { enabledModules: true },
        });
        enabled = normalizeEnabledModules(org?.enabledModules);
      }

      const server = new McpServer(
        { name: "ntrio-accounts", version: "1.0.0" },
        { capabilities: { tools: {} } },
      );

      // Call this first — teaches the agent every workflow and which tools to use.
      server.registerTool(
        "ntrio_howto",
        {
          description:
            "REQUIRED FIRST: Complete operating manual for this organization. Explains how to perform every accounts, receipt, report, kitchen, occupancy, and stock task, and which MCP tools to call. Pass optional task filter (overview, income, expenses, kitchen, stock, catalog, or a keyword).",
          inputSchema: z.object({
            task: z
              .string()
              .optional()
              .describe(
                "Optional focus: overview | accounts | income | expenses | contacts | debts | reports | kitchen | occupancy | stock | settings | catalog | or any keyword",
              ),
          }),
        },
        async ({ task }, ctx) => {
          const auth = readExtra(ctx.http?.authInfo);
          if (auth) {
            await audit(auth.mcpUserId, auth.organizationId, "ntrio_howto");
          }
          return {
            content: [{ type: "text", text: buildAgentGuide({ task: task ?? null }) }],
          };
        },
      );

      // Receipt helpers
      server.registerTool(
        "upload_receipt",
        {
          description:
            "Upload a receipt image/PDF (base64). Returns a public URL to pass as attachment_url on income, expense, or debt payment tools.",
          inputSchema: z.object({
            filename: z.string().optional().describe("Original filename, e.g. bill.jpg"),
            content_type: z.string().optional().describe("MIME type"),
            base64: z.string().describe("File bytes as base64 (data URLs accepted)"),
          }),
        },
        async ({ filename, content_type, base64 }, ctx) => {
          const auth = readExtra(ctx.http?.authInfo);
          if (!auth) {
            return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
          }
          await audit(auth.mcpUserId, auth.organizationId, "upload_receipt");
          try {
            const uploaded = await uploadReceiptBase64({
              dataOwnerId: auth.dataOwnerId,
              filename,
              contentType: content_type,
              base64,
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ attachment_url: uploaded.url, path: uploaded.path }),
                },
              ],
            };
          } catch (e) {
            return {
              content: [{ type: "text", text: e instanceof Error ? e.message : "Upload failed" }],
              isError: true,
            };
          }
        },
      );

      server.registerTool(
        "read_receipt",
        {
          description:
            "Fetch a receipt by public URL and return image/PDF content for the model to read.",
          inputSchema: z.object({
            url: z.string().url().describe("Public receipt URL (attachment_url)"),
          }),
        },
        async ({ url }, ctx) => {
          const auth = readExtra(ctx.http?.authInfo);
          if (!auth) {
            return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
          }
          await audit(auth.mcpUserId, auth.organizationId, "read_receipt");
          try {
            const { contentType, bytes } = await fetchReceipt(url);
            const b64 = bytes.toString("base64");
            if (contentType.startsWith("image/")) {
              const mime = contentType.split(";")[0]!.trim();
              return {
                content: [
                  { type: "text", text: `Receipt image (${mime}, ${bytes.length} bytes)` },
                  { type: "image", data: b64, mimeType: mime },
                ],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    content_type: contentType,
                    size: bytes.length,
                    base64: b64,
                  }),
                },
              ],
            };
          } catch (e) {
            return {
              content: [{ type: "text", text: e instanceof Error ? e.message : "Read failed" }],
              isError: true,
            };
          }
        },
      );

      for (const def of toolsForModules(enabled)) {
        registerHttpTool(server, def);
      }

      return server;
    },
    { legacy: "stateless" },
  );
}

function registerHttpTool(server: McpServer, def: McpToolDef) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of def.pathParams ?? []) {
    shape[p] = z.string().describe(`Path parameter ${p}`);
  }
  // Flexible bag for query/body fields
  shape["params"] = z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      def.method === "GET"
        ? "Optional query string parameters as an object"
        : "Optional JSON body fields as an object",
    );

  server.registerTool(
    def.name,
    {
      description: `${def.description} [${def.method} ${def.path}]`,
      inputSchema: z.object(shape),
    },
    async (args, ctx) => {
      const auth = readExtra(ctx.http?.authInfo);
      if (!auth) {
        return { content: [{ type: "text", text: "Unauthorized" }], isError: true };
      }
      await audit(auth.mcpUserId, auth.organizationId, def.name);

      try {
        const argsObj = args as Record<string, unknown>;
        const path = buildPath(def, argsObj);
        const rest = stripPathParams(def, argsObj);
        const params = (rest.params as Record<string, unknown> | undefined) ?? {};
        // Allow top-level fields too (besides path params and params)
        const { params: _p, ...top } = rest;
        const payload = { ...top, ...params };
        // Remove undefined
        for (const k of Object.keys(payload)) {
          if (payload[k] === undefined) delete payload[k];
        }

        const result = await dispatchApi({
          method: def.method,
          path,
          accessToken: auth.accessToken,
          organizationId: auth.organizationId,
          query: def.method === "GET" ? (payload as Record<string, string | number | boolean>) : undefined,
          body: def.method === "GET" ? undefined : Object.keys(payload).length ? payload : {},
        });

        return {
          content: [{ type: "text", text: formatDispatchResult(result) }],
          isError: result.status >= 400,
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }],
          isError: true,
        };
      }
    },
  );
}
