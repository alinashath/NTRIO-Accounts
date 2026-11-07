import type { Express, Request, Response, NextFunction } from "express";
import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { dataOwnerForOrganization } from "../lib/organization.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "./crypto.js";
import { createNtrioMcpHandler, type McpAuthExtra } from "./mcpServer.js";
import { oauthRouter } from "./oauthRouter.js";
import {
  sendAuthorizationServerMetadata,
  sendProtectedResourceMetadata,
} from "./oauthMetadata.js";
import {
  issuerUrl,
  listAllowedHostnames,
  mcpResourceUrl,
  resolveRequestOrigin,
} from "./origins.js";

function hostGuard(req: Request, res: Response, next: NextFunction) {
  const origin = resolveRequestOrigin(req);
  if (!origin) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Host is not on the allowed domain list",
    });
    return;
  }
  next();
}

export function mountMcp(app: Express) {
  // Discovery (RFC 9728 + RFC 8414 + OIDC)
  app.get("/.well-known/oauth-protected-resource", hostGuard, sendProtectedResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/mcp", hostGuard, sendProtectedResourceMetadata);
  app.get("/.well-known/oauth-authorization-server", hostGuard, sendAuthorizationServerMetadata);
  app.get("/.well-known/openid-configuration", hostGuard, sendAuthorizationServerMetadata);

  app.use("/oauth", oauthRouter);

  const handler = createNtrioMcpHandler();
  const node = toNodeHandler(handler);

  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let claims;
      try {
        claims = await verifyAccessToken(token);
      } catch {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired token");
      }
      const mcpUser = await prisma.mcpUser.findUnique({
        where: { id: claims.sub },
        select: { id: true, organizationId: true, disabled: true },
      });
      if (!mcpUser || mcpUser.disabled || mcpUser.organizationId !== claims.org_id) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired token");
      }
      if (!String(claims.scope ?? "").split(/\s+/).includes("org")) {
        throw new OAuthError(OAuthErrorCode.InsufficientScope, "Missing org scope");
      }
      const dataOwnerId = await dataOwnerForOrganization(mcpUser.organizationId);
      const extra: McpAuthExtra = {
        mcpUserId: mcpUser.id,
        organizationId: mcpUser.organizationId,
        dataOwnerId,
        accessToken: token,
      };
      const expiresAt =
        typeof claims.exp === "number" ? claims.exp : Math.floor(Date.now() / 1000) + 3600;
      return {
        token,
        clientId: claims.sub,
        scopes: ["org"],
        expiresAt,
        resource: new URL(claims.aud),
        extra: extra as unknown as Record<string, unknown>,
      };
    },
  };

  // Per-request auth: expected resource matches the Host used for this call.
  app.all("/mcp", hostGuard, (req, res, next) => {
    const origin = resolveRequestOrigin(req)!;
    const resourceUrl = new URL(mcpResourceUrl(origin));
    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
    const auth = requireBearerAuth({
      verifier,
      requiredScopes: ["org"],
      resourceMetadataUrl,
      expectedResource: resourceUrl,
    });
    auth(req, res, (err?: unknown) => {
      if (err) {
        next(err);
        return;
      }
      void node(req, res, req.body);
    });
  });

  // Optional: advertise allowed hosts for ops / settings UI
  app.get("/api/mcp/meta", hostGuard, (req, res) => {
    const origin = resolveRequestOrigin(req)!;
    res.json({
      mcp_url: mcpResourceUrl(origin),
      issuer: issuerUrl(origin),
      allowed_hostnames: listAllowedHostnames(),
      scope: "org",
    });
  });
}
