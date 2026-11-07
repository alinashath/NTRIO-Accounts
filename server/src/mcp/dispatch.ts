import { ORG_HEADER } from "../lib/organization.js";

export type DispatchResult = {
  status: number;
  contentType: string | null;
  bodyText: string;
  bodyBase64?: string;
};

function listenPort(): number {
  return Number(process.env.PORT ?? 3001);
}

/**
 * Call an existing /api route in-process over loopback, reusing the MCP bearer token.
 * requireAuth accepts MCP JWTs and resolves to the organization data owner.
 */
export async function dispatchApi(opts: {
  method: string;
  path: string;
  accessToken: string;
  organizationId: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}): Promise<DispatchResult> {
  const url = new URL(opts.path, `http://127.0.0.1:${listenPort()}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    [ORG_HEADER]: opts.organizationId,
    Accept: "application/json, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*",
  };

  let bodyInit: string | undefined;
  if (opts.body !== undefined && opts.method.toUpperCase() !== "GET" && opts.method.toUpperCase() !== "HEAD") {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(opts.body);
  }

  const res = await fetch(url, {
    method: opts.method.toUpperCase(),
    headers,
    body: bodyInit,
  });

  const contentType = res.headers.get("content-type");
  const buf = Buffer.from(await res.arrayBuffer());

  if (
    contentType?.includes("application/vnd.openxmlformats") ||
    contentType?.includes("application/octet-stream")
  ) {
    return {
      status: res.status,
      contentType,
      bodyText: `Binary response (${buf.length} bytes). base64 follows.`,
      bodyBase64: buf.toString("base64"),
    };
  }

  return {
    status: res.status,
    contentType,
    bodyText: buf.toString("utf8"),
  };
}

export function formatDispatchResult(result: DispatchResult): string {
  const header = `HTTP ${result.status}${result.contentType ? ` (${result.contentType})` : ""}`;
  if (result.bodyBase64) {
    return `${header}\n${result.bodyText}\n\nbase64:\n${result.bodyBase64}`;
  }
  return `${header}\n${result.bodyText}`;
}
