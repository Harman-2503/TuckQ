import { azureConfig, readSession } from "../azure/auth-utils";

export async function GET(request: Request) {
  const user = await readSession(request);
  return Response.json({
    ok: true,
    azureConfigured: azureConfig().configured,
    authenticated: Boolean(user),
    user,
  });
}
