import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password,
      salt,
      keylen,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derived) => {
        if (err) reject(err);
        else resolve(derived as Buffer);
      },
    );
  });
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64url");
  const expected = Buffer.from(parts[2]!, "base64url");
  const derived = await scryptAsync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function pkceS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function jwtSecretKey(): Uint8Array {
  const secret = process.env.MCP_JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("MCP_JWT_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export type McpAccessClaims = {
  sub: string;
  org_id: string;
  scope: string;
  aud: string;
  iss: string;
  typ: "mcp_access";
  exp?: number;
};

export async function signAccessToken(claims: {
  mcpUserId: string;
  organizationId: string;
  resource: string;
  issuer: string;
  scope?: string;
  expiresInSec?: number;
}): Promise<{ token: string; expiresIn: number; expiresAt: number }> {
  const expiresIn = claims.expiresInSec ?? 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const token = await new SignJWT({
    org_id: claims.organizationId,
    scope: claims.scope ?? "org",
    typ: "mcp_access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.mcpUserId)
    .setAudience(claims.resource)
    .setIssuer(claims.issuer)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(jwtSecretKey());
  return { token, expiresIn, expiresAt };
}

export async function verifyAccessToken(
  token: string,
  expectedResource?: string,
): Promise<McpAccessClaims> {
  const { payload } = await jwtVerify(token, jwtSecretKey(), {
    algorithms: ["HS256"],
  });
  if (payload.typ !== "mcp_access") {
    throw new Error("Invalid token type");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Missing sub");
  }
  if (typeof payload.org_id !== "string" || !payload.org_id) {
    throw new Error("Missing org_id");
  }
  const audRaw = payload.aud;
  const aud = Array.isArray(audRaw) ? audRaw[0] : audRaw;
  if (typeof aud !== "string" || !aud) {
    throw new Error("Missing aud");
  }
  if (expectedResource) {
    const a = stripFragSlash(aud);
    const b = stripFragSlash(expectedResource);
    if (a !== b) {
      throw new Error("Token audience mismatch");
    }
  }
  if (typeof payload.iss !== "string") {
    throw new Error("Missing iss");
  }
  return {
    sub: payload.sub,
    org_id: payload.org_id as string,
    scope: typeof payload.scope === "string" ? payload.scope : "org",
    aud,
    iss: payload.iss,
    typ: "mcp_access",
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

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
