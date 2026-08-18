import { env } from "cloudflare:workers";
import { readSession } from "../../auth/azure/auth-utils";

type GraphSyncResult = {
  ok: true;
  source: string;
  fileName: string;
  contentType: string;
  kind: "text" | "xlsx";
  text?: string;
  base64?: string;
} | {
  ok: false;
  configured: boolean;
  error: string;
  missing?: string[];
};

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const MAX_STUDENT_MASTER_BYTES = 8 * 1024 * 1024;

function envText(key: string) {
  return String((env as Record<string, unknown>)[key] ?? "").trim();
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function isSpreadsheetBinary(contentType: string, fileName: string) {
  return /\.xlsx?$/i.test(fileName) ||
    contentType.includes("spreadsheet") ||
    contentType.includes("excel") ||
    contentType.includes("octet-stream");
}

function graphConfig() {
  const tenantId = envText("AZURE_TENANT_ID");
  const clientId = envText("AZURE_CLIENT_ID");
  const clientSecret = envText("AZURE_CLIENT_SECRET");
  const shareUrl = envText("GRAPH_STUDENT_MASTER_SHARE_URL") || envText("MS_GRAPH_STUDENT_MASTER_SHARE_URL");
  const driveId = envText("GRAPH_STUDENT_MASTER_DRIVE_ID") || envText("MS_GRAPH_STUDENT_MASTER_DRIVE_ID");
  const itemId = envText("GRAPH_STUDENT_MASTER_ITEM_ID") || envText("MS_GRAPH_STUDENT_MASTER_ITEM_ID");
  const siteId = envText("GRAPH_STUDENT_MASTER_SITE_ID") || envText("MS_GRAPH_STUDENT_MASTER_SITE_ID");
  const filePath = envText("GRAPH_STUDENT_MASTER_PATH") || envText("MS_GRAPH_STUDENT_MASTER_PATH");
  const configured = Boolean(
    tenantId &&
    clientId &&
    clientSecret &&
    (shareUrl || (driveId && itemId) || (siteId && filePath)),
  );
  const missing = [
    !tenantId && "AZURE_TENANT_ID",
    !clientId && "AZURE_CLIENT_ID",
    !clientSecret && "AZURE_CLIENT_SECRET",
    !(shareUrl || (driveId && itemId) || (siteId && filePath)) && "GRAPH_STUDENT_MASTER_SHARE_URL or DRIVE_ID+ITEM_ID or SITE_ID+PATH",
  ].filter(Boolean) as string[];
  return { tenantId, clientId, clientSecret, shareUrl, driveId, itemId, siteId, filePath, configured, missing };
}

async function isAuthorizedGraphSync(request: Request) {
  const session = await readSession(request);
  if (session?.role === "admin") return true;
  const syncKey = envText("TUCKQ_GRAPH_SYNC_KEY");
  const supplied = request.headers.get("x-tuckq-sync-key")?.trim() || "";
  return Boolean(syncKey && supplied && supplied === syncKey);
}

function forbidden() {
  return Response.json({
    ok: false,
    configured: false,
    error: "Microsoft student master sync needs an Azure Admin session or the school Graph sync key.",
  } satisfies GraphSyncResult, { status: 403 });
}

async function graphToken() {
  const config = graphConfig();
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const token = await tokenResponse.json<{ access_token?: string; error_description?: string }>().catch(() => ({}));
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(token.error_description || "Microsoft Graph token could not be created.");
  }
  return token.access_token;
}

function driveItemUrl() {
  const config = graphConfig();
  if (config.shareUrl) {
    return `${GRAPH_ROOT}/shares/u!${base64UrlEncode(config.shareUrl)}/driveItem?$select=id,name,file,@microsoft.graph.downloadUrl`;
  }
  if (config.driveId && config.itemId) {
    return `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(config.itemId)}?$select=id,name,file,@microsoft.graph.downloadUrl`;
  }
  const cleanPath = config.filePath.replace(/^\/+/, "");
  return `${GRAPH_ROOT}/sites/${encodeURIComponent(config.siteId)}/drive/root:/${cleanPath}:?$select=id,name,file,@microsoft.graph.downloadUrl`;
}

async function loadDriveItem(token: string) {
  const itemResponse = await fetch(driveItemUrl(), {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const item = await itemResponse.json<Record<string, unknown>>().catch(() => ({}));
  if (!itemResponse.ok) {
    const message = String((item.error as { message?: string } | undefined)?.message || "Microsoft Graph could not read the student master file.");
    throw new Error(message);
  }
  const fileName = String(item.name || "student-master.xlsx");
  const downloadUrl = String(item["@microsoft.graph.downloadUrl"] || "");
  if (!downloadUrl) throw new Error("Microsoft Graph did not return a downloadable file URL.");
  return { fileName, downloadUrl };
}

async function downloadFile(downloadUrl: string) {
  const response = await fetch(downloadUrl, {
    headers: {
      accept: "text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*",
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph download returned ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_STUDENT_MASTER_BYTES) throw new Error("The student master file is larger than 8 MB.");
  return { response, contentType };
}

export async function GET(request: Request) {
  if (!(await isAuthorizedGraphSync(request))) return forbidden();
  const config = graphConfig();
  return Response.json({
    ok: true,
    configured: config.configured,
    missing: config.missing,
    source: config.shareUrl ? "SharePoint sharing link" : config.driveId ? "Graph drive item" : config.siteId ? "Graph site path" : "Not configured",
  });
}

export async function POST(request: Request) {
  if (!(await isAuthorizedGraphSync(request))) return forbidden();
  const config = graphConfig();
  if (!config.configured) {
    return Response.json({
      ok: false,
      configured: false,
      error: "Microsoft Graph student master sync is not configured yet.",
      missing: config.missing,
    } satisfies GraphSyncResult, { status: 400 });
  }

  try {
    const token = await graphToken();
    const item = await loadDriveItem(token);
    const { response, contentType } = await downloadFile(item.downloadUrl);

    if (isSpreadsheetBinary(contentType, item.fileName)) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_STUDENT_MASTER_BYTES) throw new Error("The student master file is larger than 8 MB.");
      return Response.json({
        ok: true,
        source: "Microsoft Graph",
        fileName: item.fileName,
        contentType,
        kind: "xlsx",
        base64: bufferToBase64(buffer),
      } satisfies GraphSyncResult);
    }

    const text = await response.text();
    if (text.length > MAX_STUDENT_MASTER_BYTES) throw new Error("The student master file is larger than 8 MB.");
    return Response.json({
      ok: true,
      source: "Microsoft Graph",
      fileName: item.fileName,
      contentType,
      kind: "text",
      text,
    } satisfies GraphSyncResult);
  } catch (error) {
    return Response.json({
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Microsoft Graph sync failed.",
    } satisfies GraphSyncResult, { status: 502 });
  }
}
