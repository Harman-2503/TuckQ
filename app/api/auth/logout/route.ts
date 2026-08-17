import { clearCookie, cookies } from "../azure/auth-utils";

export async function GET(request: Request) {
  const response = Response.redirect(new URL("/", request.url), 302);
  response.headers.append("Set-Cookie", clearCookie(cookies.session));
  response.headers.append("Set-Cookie", clearCookie(cookies.state));
  response.headers.append("Set-Cookie", clearCookie(cookies.nonce));
  response.headers.append("Set-Cookie", clearCookie(cookies.verifier));
  return response;
}
