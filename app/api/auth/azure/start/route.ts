import { env } from "cloudflare:workers";
import {
  azureConfig,
  cookies,
  makeCookie,
  randomToken,
  sha256,
} from "../auth-utils";

const validRoles = new Set(["admin", "student", "teacher", "operator"]);

export async function GET(request: Request) {
  const config = azureConfig();
  const url = new URL(request.url);
  const requestedRole = validRoles.has(url.searchParams.get("role") ?? "")
    ? String(url.searchParams.get("role"))
    : "student";

  if (!config.configured) {
    return Response.redirect(new URL(`/?sso=not-configured&role=${requestedRole}`, request.url), 302);
  }

  const state = `${requestedRole}.${randomToken()}`;
  const nonce = randomToken();
  const verifier = randomToken();
  const challenge = await sha256(verifier);
  const redirectUri = String((env as Record<string, unknown>).AZURE_REDIRECT_URI || new URL("/api/auth/azure/callback", request.url));
  const authorize = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("scope", "openid profile email");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("prompt", "select_account");

  const response = Response.redirect(authorize.toString(), 302);
  response.headers.append("Set-Cookie", makeCookie(cookies.state, state, 600));
  response.headers.append("Set-Cookie", makeCookie(cookies.nonce, nonce, 600));
  response.headers.append("Set-Cookie", makeCookie(cookies.verifier, verifier, 600));
  return response;
}
