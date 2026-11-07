import type { Request, Response } from "express";
import {
  issuerUrl,
  listAllowedOrigins,
  mcpResourceUrl,
  resolveRequestOrigin,
} from "./origins.js";

export function authorizationServerMetadata(issuer: string) {
  const base = issuer.replace(/\/+$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: ["org"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    // Claude selects CIMD when both this flag and "none" auth method are present.
    service_documentation: `${base}/accounts/settings/mcp`,
  };
}

export function protectedResourceMetadata(origin: string) {
  const resource = mcpResourceUrl(origin);
  const issuer = issuerUrl(origin);
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: ["org"],
    bearer_methods_supported: ["header"],
  };
}

export function sendProtectedResourceMetadata(req: Request, res: Response) {
  const origin = resolveRequestOrigin(req);
  if (!origin) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Host is not on the allowed domain list",
      allowed_origins: listAllowedOrigins(),
    });
    return;
  }
  res.json(protectedResourceMetadata(origin));
}

export function sendAuthorizationServerMetadata(req: Request, res: Response) {
  const origin = resolveRequestOrigin(req);
  if (!origin) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "Host is not on the allowed domain list",
      allowed_origins: listAllowedOrigins(),
    });
    return;
  }
  res.json(authorizationServerMetadata(issuerUrl(origin)));
}
