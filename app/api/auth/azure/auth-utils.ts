import { env } from "cloudflare:workers";

export type TuckQRole = "admin" | "student" | "teacher" | "operator";

export type AzureUser = {
  role: TuckQRole;
  roleSource?: string;
  requestedRole?: string;
  id: string;
  name: string;
  email: string;
  provider: "azure";
};

type JwtClaims = {
  aud?: string;
  iss?: string;
  exp?: number;
  nonce?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  upn?: string;
  oid?: string;
  roles?: string[];
  groups?: string[];
  _claim_names?: Record<string, string>;
};

const sessionCookie = "tuckq_azure_session";
const verifierCookie = "tuckq_azure_verifier";
const stateCookie = "tuckq_azure_state";
const nonceCookie = "tuckq_azure_nonce";

export const cookies = {
  session: sessionCookie,
  verifier: verifierCookie,
  state: stateCookie,
  nonce: nonceCookie,
};

export function azureConfig() {
  const tenantId = String(env.AZURE_TENANT_ID ?? "").trim();
  const clientId = String(env.AZURE_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.AZURE_CLIENT_SECRET ?? "").trim();
  const sessionSecret = String(env.AZURE_SESSION_SECRET ?? "").trim();
  return {
    configured: Boolean(tenantId && clientId && sessionSecret),
    tenantId,
    clientId,
    clientSecret,
    sessionSecret,
  };
}

export function parseCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function makeCookie(name: string, value: string, maxAge: number) {
  const secure = "Secure";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; ${secure}`;
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;
}

export function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  source.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function decodeJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256(value: string) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function signSession(user: AzureUser) {
  const config = azureConfig();
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ user, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  return `${payload}.${await hmac(config.sessionSecret, payload)}`;
}

export async function readSession(request: Request) {
  const config = azureConfig();
  if (!config.configured) return null;
  const token = parseCookies(request)[sessionCookie];
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if ((await hmac(config.sessionSecret, payload)) !== signature) return null;
  const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { user: AzureUser; exp: number };
  if (!parsed?.user || Date.now() > parsed.exp) return null;
  return parsed.user;
}

export async function verifyAzureIdToken(idToken: string, expectedNonce: string) {
  const config = azureConfig();
  const [headerPart, payloadPart, signaturePart] = idToken.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new Error("Invalid Azure token.");

  const header = decodeJwtPart<{ kid?: string; alg?: string }>(headerPart);
  const claims = decodeJwtPart<JwtClaims>(payloadPart);
  const keysResponse = await fetch(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`);
  const jwks = await keysResponse.json<{ keys?: JsonWebKey[] }>();
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk || header.alg !== "RS256") throw new Error("Could not verify Azure signing key.");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!verified) throw new Error("Azure token signature failed.");
  if (claims.aud !== config.clientId) throw new Error("Azure audience mismatch.");
  if (claims.iss !== `https://login.microsoftonline.com/${config.tenantId}/v2.0`) throw new Error("Azure tenant mismatch.");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Azure token expired.");
  if (claims.nonce !== expectedNonce) throw new Error("Azure sign-in nonce mismatch.");
  return claims;
}

function envList(key: string) {
  return String((env as Record<string, unknown>)[key] ?? "")
    .split(/[,\n;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function firstMatch(values: string[], accepted: string[]) {
  return values.find((value) => accepted.includes(value));
}

export function userFromClaims(claims: JwtClaims, requestedRole: string): AzureUser {
  const email = String(claims.email || claims.preferred_username || claims.upn || "").toLowerCase();
  const roleClaims = Array.isArray(claims.roles) ? claims.roles.map((role) => role.toLowerCase()) : [];
  const groupClaims = Array.isArray(claims.groups) ? claims.groups.map((group) => group.toLowerCase()) : [];
  const requested = ["admin", "student", "teacher", "operator"].includes(requestedRole) ? requestedRole : "student";
  const roleRules: Array<{
    role: Exclude<TuckQRole, "student">;
    emails: string;
    groups: string;
    appRoles: string[];
    label: string;
  }> = [
    {
      role: "admin",
      emails: "AZURE_ADMIN_EMAILS",
      groups: "AZURE_ADMIN_GROUP_IDS",
      appRoles: ["admin", "tuckq.admin", "schooladmin", "school_admin"],
      label: "Admin",
    },
    {
      role: "operator",
      emails: "AZURE_OPERATOR_EMAILS",
      groups: "AZURE_OPERATOR_GROUP_IDS",
      appRoles: ["operator", "tuckq.operator", "pos", "pos_operator", "tuckq.pos"],
      label: "POS operator",
    },
    {
      role: "teacher",
      emails: "AZURE_TEACHER_EMAILS",
      groups: "AZURE_TEACHER_GROUP_IDS",
      appRoles: ["teacher", "tuckq.teacher", "faculty"],
      label: "Teacher",
    },
  ];
  let role: TuckQRole = "student";
  let roleSource = "student default";

  for (const rule of roleRules) {
    const emailMatch = envList(rule.emails).includes(email);
    const roleMatch = firstMatch(roleClaims, rule.appRoles);
    const groupMatch = firstMatch(groupClaims, envList(rule.groups));
    if (emailMatch || roleMatch || groupMatch) {
      role = rule.role;
      roleSource = emailMatch
        ? `${rule.label} email allowlist`
        : roleMatch
          ? `${rule.label} Microsoft app role`
          : `${rule.label} Microsoft group`;
      break;
    }
  }

  if (role === "student") {
    const requestedRule = roleRules.find((rule) => rule.role === requested);
    if (requestedRule && envList(requestedRule.emails).includes(email)) {
      role = requestedRule.role;
      roleSource = `${requestedRule.label} email allowlist`;
    } else if (claims._claim_names?.groups) {
      roleSource = "student default; Microsoft did not include groups in token";
    }
  }

  const localPart = email.split("@")[0] || claims.oid || "azure-user";
  const studentId = localPart.startsWith("tisb") ? localPart.toUpperCase() : localPart.toUpperCase();
  return {
    role,
    roleSource,
    requestedRole: requested,
    id: role === "student" ? studentId : String(claims.oid || localPart).toUpperCase(),
    name: String(claims.name || email || "Azure user"),
    email,
    provider: "azure",
  };
}
