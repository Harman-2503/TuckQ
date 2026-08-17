import { env } from "cloudflare:workers";
import { ensureTuckQDatabase, saveStructuredState } from "../state/db-sync";

const KEY = "production";

async function ensureTable() {
  await ensureTuckQDatabase();
}

export async function GET() {
  await ensureTable();
  const row = await env.DB.prepare("SELECT value FROM tuckq_state WHERE key = ?").bind(KEY).first<{ value: string }>();
  return Response.json({ ok: true, state: row ? JSON.parse(row.value) : null });
}

export async function POST(request: Request) {
  await ensureTable();
  const body = await request.json<{ state?: unknown }>();
  await saveStructuredState(body.state ?? null);
  await env.DB.prepare("INSERT INTO tuckq_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP")
    .bind(KEY, JSON.stringify(body.state ?? null))
    .run();
  return Response.json({ ok: true });
}
