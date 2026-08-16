import { env } from "cloudflare:workers";

type MailPayload = {
  to?: string;
  subject?: string;
  body?: string;
};

async function ensureTable() {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_mail_outbox_created_at ON mail_outbox (created_at)"),
  ]);
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

async function recordMail(message: Required<MailPayload>, status: string, providerId = "", reason = "") {
  await env.DB.prepare("INSERT INTO mail_outbox (id, to_email, subject, body, status, provider_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(`MAIL-${Date.now()}-${Math.random().toString(16).slice(2)}`, message.to, message.subject, message.body, status, providerId, reason)
    .run();
}

export async function GET() {
  await ensureTable();
  const rows = await env.DB.prepare("SELECT id, to_email, subject, status, reason, created_at FROM mail_outbox ORDER BY created_at DESC LIMIT 50").all();
  return Response.json({ ok: true, mail: rows.results ?? [] });
}

export async function POST(request: Request) {
  await ensureTable();
  const payload = await request.json<MailPayload>();
  const message = {
    to: clean(payload.to),
    subject: clean(payload.subject),
    body: String(payload.body ?? "").trim(),
  };

  if (!message.to || !message.subject || !message.body) {
    return Response.json({ ok: false, status: "Rejected", error: "To, subject and body are required." }, { status: 400 });
  }

  const mode = String(env.MAIL_MODE ?? "draft").toLowerCase();
  const apiKey = String(env.RESEND_API_KEY ?? "");
  const from = String(env.MAIL_FROM ?? "TuckQ <onboarding@resend.dev>");

  if (mode !== "live" || !apiKey) {
    const reason = "Mail saved to outbox. Set MAIL_MODE=live, RESEND_API_KEY and MAIL_FROM to send real email.";
    await recordMail(message, "Draft", "", reason);
    return Response.json({ ok: true, sent: false, status: "Draft", reason });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.body }),
  });
  const result = await response.json<{ id?: string; message?: string }>().catch(() => ({}));

  if (!response.ok) {
    const reason = result.message || `Email provider returned ${response.status}.`;
    await recordMail(message, "Error", "", reason);
    return Response.json({ ok: false, sent: false, status: "Error", reason }, { status: 502 });
  }

  await recordMail(message, "Sent", result.id || "", "");
  return Response.json({ ok: true, sent: true, status: "Sent", providerId: result.id || "" });
}
