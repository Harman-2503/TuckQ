import { env } from "cloudflare:workers";
import {
  azureConfig,
  clearCookie,
  cookies,
  makeCookie,
  parseCookies,
  signSession,
  userFromClaims,
  verifyAzureIdToken,
} from "../auth-utils";

export async function GET(request: Request) {
  const config = azureConfig();
  const url = new URL(request.url);
  const stored = parseCookies(request);
  const code = url.searchParams.get("code");
  const incomingState = url.searchParams.get("state") ?? "";
  const storedState = stored[cookies.state] ?? "";
  const nonce = stored[cookies.nonce] ?? "";
  const verifier = stored[cookies.verifier] ?? "";
  const requestedRole = incomingState.split(".")[0] || "student";

  const fail = (reason: string) =>
    Response.redirect(new URL(`/?sso=${encodeURIComponent(reason)}&role=${requestedRole}`, request.url), 302);

  if (!config.configured) return fail("not-configured");
  if (!code || !storedState || incomingState !== storedState || !nonce || !verifier) return fail("invalid");

  const redirectUri = String((env as Record<string, unknown>).AZURE_REDIRECT_URI || new URL("/api/auth/azure/callback", request.url));
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (config.clientSecret) tokenBody.set("client_secret", config.clientSecret);

  const tokenResponse = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: tokenBody,
  });
  const token = await tokenResponse.json<{ id_token?: string; error_description?: string }>().catch(() => ({}));
  if (!tokenResponse.ok || !token.id_token) return fail("token");

  try {
    const claims = await verifyAzureIdToken(token.id_token, nonce);
    const session = await signSession(userFromClaims(claims, requestedRole));
    const response = Response.redirect(new URL("/?sso=success", request.url), 302);
    response.headers.append("Set-Cookie", makeCookie(cookies.session, session, 8 * 60 * 60));
    response.headers.append("Set-Cookie", clearCookie(cookies.state));
    response.headers.append("Set-Cookie", clearCookie(cookies.nonce));
    response.headers.append("Set-Cookie", clearCookie(cookies.verifier));
    return response;
  } catch {
    return fail("verify");
  }
}
