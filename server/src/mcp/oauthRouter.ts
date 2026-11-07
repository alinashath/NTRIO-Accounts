import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/http.js";
import {
  hashToken,
  pkceS256Challenge,
  randomUrlToken,
  signAccessToken,
  verifyPassword,
} from "./crypto.js";
import { renderLoginPage } from "./loginPage.js";
import {
  issuerUrl,
  listAllowedOrigins,
  mcpResourceUrl,
  resolveRequestOrigin,
} from "./origins.js";
import { filterAllowedRedirectUris, isAllowedRedirectUri } from "./redirectUris.js";

export const oauthRouter = Router();

const SCOPE = "org";
const CODE_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type ClientRecord = {
  id: string;
  clientId: string;
  redirectUris: string[];
};

async function resolveClient(clientIdRaw: string): Promise<ClientRecord | null> {
  const clientId = clientIdRaw.trim();
  if (!clientId) return null;

  // CIMD: client_id is an HTTPS URL to a metadata document
  if (/^https:\/\//i.test(clientId)) {
    try {
      const res = await fetch(clientId, {
        headers: {
          Accept: "application/json",
          "User-Agent": "NTRIO-MCP/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return null;
      const doc = (await res.json()) as {
        client_id?: string;
        redirect_uris?: string[];
        token_endpoint_auth_method?: string;
        token_endpoint_auth_methods_supported?: string[];
      };
      const uris = filterAllowedRedirectUris(
        Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [],
      );
      if (!uris.length) return null;
      // ChatGPT advertises preferred private_key_jwt but also supports "none"
      // (PKCE public client). Accept when "none" is preferred or listed.
      const supported = Array.isArray(doc.token_endpoint_auth_methods_supported)
        ? doc.token_endpoint_auth_methods_supported.map(String)
        : [];
      const preferred = doc.token_endpoint_auth_method ?? "none";
      const allowsPublic = preferred === "none" || supported.includes("none");
      if (!allowsPublic) return null;
      return {
        id: `cimd:${clientId}`,
        clientId,
        redirectUris: uris,
      };
    } catch {
      return null;
    }
  }

  const row = await prisma.oAuthClient.findUnique({
    where: { clientId },
    select: { id: true, clientId: true, redirectUris: true },
  });
  return row;
}

async function ensureDbClientForCimd(client: ClientRecord): Promise<string> {
  if (!client.id.startsWith("cimd:")) return client.id;
  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: client.clientId },
    select: { id: true },
  });
  if (existing) {
    await prisma.oAuthClient.update({
      where: { id: existing.id },
      data: { redirectUris: client.redirectUris },
    });
    return existing.id;
  }
  const created = await prisma.oAuthClient.create({
    data: {
      clientId: client.clientId,
      clientName: "CIMD client",
      redirectUris: client.redirectUris,
      tokenEndpointAuthMethod: "none",
    },
    select: { id: true },
  });
  return created.id;
}

function oauthError(
  res: Response,
  status: number,
  error: string,
  description?: string,
) {
  res.status(status).json({
    error,
    ...(description ? { error_description: description } : {}),
  });
}

function requireOrigin(req: Request, res: Response): string | null {
  const origin = resolveRequestOrigin(req);
  if (!origin) {
    oauthError(
      res,
      400,
      "invalid_request",
      `Host not allowed. Allowed: ${listAllowedOrigins().join(", ") || "(none configured)"}`,
    );
    return null;
  }
  return origin;
}

/** Dynamic Client Registration (RFC 7591) — public clients only. */
oauthRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    if (!requireOrigin(req, res)) return;

    const body = z
      .object({
        client_name: z.string().max(256).optional(),
        redirect_uris: z.array(z.string()).min(1),
        token_endpoint_auth_method: z.string().optional(),
        grant_types: z.array(z.string()).optional(),
        response_types: z.array(z.string()).optional(),
      })
      .passthrough()
      .safeParse(req.body);

    if (!body.success) {
      oauthError(res, 400, "invalid_client_metadata", "redirect_uris required");
      return;
    }

    const method = body.data.token_endpoint_auth_method ?? "none";
    if (method !== "none") {
      oauthError(res, 400, "invalid_client_metadata", "Only public clients (auth method none) are supported");
      return;
    }

    const redirectUris = filterAllowedRedirectUris(body.data.redirect_uris);
    if (!redirectUris.length) {
      oauthError(
        res,
        400,
        "invalid_redirect_uri",
        "No allowed redirect_uris (Claude, ChatGPT, Grok, Cursor, or loopback)",
      );
      return;
    }

    const clientId = randomUrlToken(24);
    const row = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: body.data.client_name ?? null,
        redirectUris,
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
      },
    });

    res.status(201).json({
      client_id: row.clientId,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      client_name: row.clientName,
      redirect_uris: row.redirectUris,
      grant_types: row.grantTypes,
      response_types: row.responseTypes,
      token_endpoint_auth_method: "none",
    });
  }),
);

const authorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
  scope: z.string().optional(),
  state: z.string().optional(),
  resource: z.string().min(1),
});

oauthRouter.get(
  "/authorize",
  asyncHandler(async (req, res) => {
    const origin = requireOrigin(req, res);
    if (!origin) return;

    const parsed = authorizeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      oauthError(res, 400, "invalid_request", "Missing or invalid authorization parameters");
      return;
    }
    const q = parsed.data;
    const client = await resolveClient(q.client_id);
    if (!client) {
      oauthError(
        res,
        400,
        "invalid_request",
        "Unknown client (CIMD fetch failed, or client does not allow public/none auth)",
      );
      return;
    }
    if (!client.redirectUris.includes(q.redirect_uri)) {
      oauthError(
        res,
        400,
        "invalid_request",
        `redirect_uri mismatch. Registered: ${client.redirectUris.join(", ")}`,
      );
      return;
    }
    if (!isAllowedRedirectUri(q.redirect_uri)) {
      oauthError(res, 400, "invalid_request", "redirect_uri not allowed");
      return;
    }

    const expectedResource = mcpResourceUrl(origin);
    if (stripFragSlash(q.resource) !== stripFragSlash(expectedResource)) {
      oauthError(
        res,
        400,
        "invalid_target",
        `resource must be ${expectedResource}`,
      );
      return;
    }

    const scope = (q.scope ?? SCOPE).split(/\s+/).includes(SCOPE) ? SCOPE : null;
    if (!scope) {
      oauthError(res, 400, "invalid_scope", "Only scope \"org\" is supported");
      return;
    }

    const hidden: Record<string, string> = {
      client_id: q.client_id,
      redirect_uri: q.redirect_uri,
      code_challenge: q.code_challenge,
      code_challenge_method: q.code_challenge_method,
      resource: q.resource,
      scope,
      ...(q.state ? { state: q.state } : {}),
    };

    res
      .status(200)
      .type("html")
      .send(
        renderLoginPage({
          formAction: "/oauth/authorize",
          hiddenFields: hidden,
        }),
      );
  }),
);

oauthRouter.post(
  "/authorize",
  asyncHandler(async (req, res) => {
    const origin = requireOrigin(req, res);
    if (!origin) return;

    const body = z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
        client_id: z.string().min(1),
        redirect_uri: z.string().min(1),
        code_challenge: z.string().min(1),
        code_challenge_method: z.literal("S256"),
        resource: z.string().min(1),
        scope: z.string().default(SCOPE),
        state: z.string().optional(),
      })
      .safeParse(req.body);

    const failPage = (error: string, fields: Record<string, string>) => {
      res.status(200).type("html").send(
        renderLoginPage({
          error,
          formAction: "/oauth/authorize",
          hiddenFields: fields,
        }),
      );
    };

    if (!body.success) {
      oauthError(res, 400, "invalid_request");
      return;
    }
    const b = body.data;
    const hidden: Record<string, string> = {
      client_id: b.client_id,
      redirect_uri: b.redirect_uri,
      code_challenge: b.code_challenge,
      code_challenge_method: b.code_challenge_method,
      resource: b.resource,
      scope: b.scope,
      ...(b.state ? { state: b.state } : {}),
    };

    const client = await resolveClient(b.client_id);
    if (!client || !client.redirectUris.includes(b.redirect_uri)) {
      failPage("Invalid client configuration.", hidden);
      return;
    }

    const expectedResource = mcpResourceUrl(origin);
    if (stripFragSlash(b.resource) !== stripFragSlash(expectedResource)) {
      failPage("Invalid resource for this host.", hidden);
      return;
    }

    const username = b.username.trim().toLowerCase();
    const mcpUser = await prisma.mcpUser.findUnique({
      where: { username },
    });
    if (!mcpUser || mcpUser.disabled) {
      failPage("Invalid username or password.", hidden);
      return;
    }
    const ok = await verifyPassword(b.password, mcpUser.passwordHash);
    if (!ok) {
      failPage("Invalid username or password.", hidden);
      return;
    }

    const dbClientId = await ensureDbClientForCimd(client);
    const code = randomUrlToken(32);
    const issuer = issuerUrl(origin);
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        clientId: dbClientId,
        mcpUserId: mcpUser.id,
        redirectUri: b.redirect_uri,
        codeChallenge: b.code_challenge,
        codeChallengeMethod: "S256",
        scope: SCOPE,
        resource: expectedResource,
        issuer,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    const redirect = new URL(b.redirect_uri);
    redirect.searchParams.set("code", code);
    if (b.state) redirect.searchParams.set("state", b.state);
    redirect.searchParams.set("iss", issuer);
    res.redirect(302, redirect.toString());
  }),
);

oauthRouter.post(
  "/token",
  asyncHandler(async (req, res) => {
    const origin = requireOrigin(req, res);
    if (!origin) return;
    const issuer = issuerUrl(origin);

    const body = req.body as Record<string, unknown>;
    const grantType = String(body.grant_type ?? "");

    if (grantType === "authorization_code") {
      const parsed = z
        .object({
          grant_type: z.literal("authorization_code"),
          code: z.string().min(1),
          redirect_uri: z.string().min(1),
          client_id: z.string().min(1),
          code_verifier: z.string().min(43).max(128),
          resource: z.string().optional(),
        })
        .safeParse(body);
      if (!parsed.success) {
        oauthError(res, 400, "invalid_request");
        return;
      }
      const t = parsed.data;
      const client = await resolveClient(t.client_id);
      if (!client) {
        oauthError(res, 401, "invalid_client");
        return;
      }
      const dbClientId = await ensureDbClientForCimd(client);
      const codeHash = hashToken(t.code);
      const row = await prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash },
        include: { mcpUser: true },
      });
      if (
        !row ||
        row.consumedAt ||
        row.expiresAt.getTime() < Date.now() ||
        row.clientId !== dbClientId ||
        row.redirectUri !== t.redirect_uri
      ) {
        oauthError(res, 400, "invalid_grant");
        return;
      }
      if (row.issuer !== issuer) {
        oauthError(res, 400, "invalid_grant", "Issuer mismatch");
        return;
      }
      const challenge = pkceS256Challenge(t.code_verifier);
      if (challenge !== row.codeChallenge) {
        oauthError(res, 400, "invalid_grant", "PKCE verification failed");
        return;
      }
      if (row.mcpUser.disabled) {
        oauthError(res, 400, "invalid_grant", "MCP user disabled");
        return;
      }
      const resource = t.resource ?? row.resource;
      if (stripFragSlash(resource) !== stripFragSlash(row.resource)) {
        oauthError(res, 400, "invalid_target");
        return;
      }

      await prisma.oAuthAuthorizationCode.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });

      const access = await signAccessToken({
        mcpUserId: row.mcpUserId,
        organizationId: row.mcpUser.organizationId,
        resource: row.resource,
        issuer: row.issuer,
        scope: row.scope,
      });
      const refresh = randomUrlToken(48);
      await prisma.oAuthRefreshToken.create({
        data: {
          tokenHash: hashToken(refresh),
          clientId: dbClientId,
          mcpUserId: row.mcpUserId,
          scope: row.scope,
          resource: row.resource,
          issuer: row.issuer,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });

      res.json({
        access_token: access.token,
        token_type: "Bearer",
        expires_in: access.expiresIn,
        refresh_token: refresh,
        scope: row.scope,
      });
      return;
    }

    if (grantType === "refresh_token") {
      const parsed = z
        .object({
          grant_type: z.literal("refresh_token"),
          refresh_token: z.string().min(1),
          client_id: z.string().min(1),
          resource: z.string().optional(),
        })
        .safeParse(body);
      if (!parsed.success) {
        oauthError(res, 400, "invalid_request");
        return;
      }
      const t = parsed.data;
      const client = await resolveClient(t.client_id);
      if (!client) {
        oauthError(res, 401, "invalid_client");
        return;
      }
      const dbClientId = await ensureDbClientForCimd(client);
      const tokenHash = hashToken(t.refresh_token);
      const row = await prisma.oAuthRefreshToken.findUnique({
        where: { tokenHash },
        include: { mcpUser: true },
      });
      if (
        !row ||
        row.revokedAt ||
        row.expiresAt.getTime() < Date.now() ||
        row.clientId !== dbClientId ||
        row.issuer !== issuer
      ) {
        oauthError(res, 400, "invalid_grant");
        return;
      }
      if (row.mcpUser.disabled) {
        oauthError(res, 400, "invalid_grant", "MCP user disabled");
        return;
      }
      if (t.resource && stripFragSlash(t.resource) !== stripFragSlash(row.resource)) {
        oauthError(res, 400, "invalid_target");
        return;
      }

      await prisma.oAuthRefreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });

      const access = await signAccessToken({
        mcpUserId: row.mcpUserId,
        organizationId: row.mcpUser.organizationId,
        resource: row.resource,
        issuer: row.issuer,
        scope: row.scope,
      });
      const refresh = randomUrlToken(48);
      await prisma.oAuthRefreshToken.create({
        data: {
          tokenHash: hashToken(refresh),
          clientId: dbClientId,
          mcpUserId: row.mcpUserId,
          scope: row.scope,
          resource: row.resource,
          issuer: row.issuer,
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });

      res.json({
        access_token: access.token,
        token_type: "Bearer",
        expires_in: access.expiresIn,
        refresh_token: refresh,
        scope: row.scope,
      });
      return;
    }

    oauthError(res, 400, "unsupported_grant_type");
  }),
);

function stripFragSlash(s: string): string {
  try {
    const u = new URL(s);
    u.hash = "";
    let out = u.toString();
    if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
    return out;
  } catch {
    return s.replace(/\/$/, "");
  }
}
