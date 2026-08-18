type FetchResult = {
  ok: true;
  finalUrl: string;
  contentType: string;
  kind: "text" | "xlsx";
  text?: string;
  base64?: string;
} | {
  ok: false;
  error: string;
  tried: string[];
};

const MAX_STUDENT_MASTER_BYTES = 5 * 1024 * 1024;
const ALLOWED_HOSTS = [
  "docs.google.com",
  "drive.google.com",
  "1drv.ms",
  "onedrive.live.com",
];

function isAllowedStudentMasterHost(hostname: string) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(host) || host.endsWith(".sharepoint.com");
}

function publicUrlCandidates(rawUrl: string) {
  const url = new URL(rawUrl);
  const candidates = new Set<string>();
  candidates.add(url.toString());

  if (url.hostname.includes("docs.google.com") && url.pathname.includes("/spreadsheets/d/")) {
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    const gid = url.searchParams.get("gid") || "0";
    if (match?.[1]) candidates.add(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`);
  }

  if (url.hostname.includes("sharepoint.com") || url.hostname.includes("1drv.ms") || url.hostname.includes("onedrive.live.com")) {
    const downloadUrl = new URL(url.toString());
    downloadUrl.searchParams.set("download", "1");
    candidates.add(downloadUrl.toString());
  }

  return [...candidates];
}

function isSpreadsheetBinary(contentType: string, finalUrl: string) {
  return /\.xlsx?(\?|$)/i.test(finalUrl) ||
    contentType.includes("spreadsheet") ||
    contentType.includes("excel") ||
    contentType.includes("octet-stream");
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

export async function POST(request: Request) {
  const body = await request.json<{ url?: string }>().catch(() => ({}));
  const rawUrl = String(body.url || "").trim();
  if (!rawUrl) {
    return Response.json({ ok: false, error: "Student master URL is required.", tried: [] } satisfies FetchResult, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return Response.json({ ok: false, error: "Paste a valid https:// link.", tried: [] } satisfies FetchResult, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return Response.json({ ok: false, error: "Only secure https:// student master links are supported.", tried: [] } satisfies FetchResult, { status: 400 });
  }

  if (!isAllowedStudentMasterHost(parsed.hostname)) {
    return Response.json({
      ok: false,
      error: "For safety, URL sync only supports public Google Sheets, OneDrive, or SharePoint student master links. Upload the file manually for other sources.",
      tried: [],
    } satisfies FetchResult, { status: 400 });
  }

  const tried: string[] = [];
  let lastError = "Could not fetch the student master.";
  for (const candidate of publicUrlCandidates(rawUrl)) {
    tried.push(candidate);
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        headers: {
          "accept": "text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*",
          "user-agent": "TuckQ student master sync",
        },
      });
      const contentType = response.headers.get("content-type") || "";
      const finalUrl = response.url || candidate;
      if (!response.ok) {
        lastError = `The link returned ${response.status}.`;
        continue;
      }

      const length = Number(response.headers.get("content-length") || 0);
      if (length > MAX_STUDENT_MASTER_BYTES) {
        lastError = "The file is too large. Keep the student master below 5 MB.";
        continue;
      }

      if (isSpreadsheetBinary(contentType, finalUrl)) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_STUDENT_MASTER_BYTES) {
          lastError = "The file is too large. Keep the student master below 5 MB.";
          continue;
        }
        return Response.json({
          ok: true,
          finalUrl,
          contentType,
          kind: "xlsx",
          base64: bufferToBase64(buffer),
        } satisfies FetchResult);
      }

      const text = await response.text();
      if (text.length > MAX_STUDENT_MASTER_BYTES) {
        lastError = "The file is too large. Keep the student master below 5 MB.";
        continue;
      }
      const looksLikeHtml = /^\s*<!doctype html|^\s*<html[\s>]/i.test(text);
      if (looksLikeHtml) {
        lastError = "That link opened an Excel/SharePoint preview page, not a downloadable CSV/XLSX file.";
        continue;
      }

      return Response.json({
        ok: true,
        finalUrl,
        contentType,
        kind: "text",
        text,
      } satisfies FetchResult);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Fetch failed.";
    }
  }

  return Response.json({
    ok: false,
    error: `${lastError} Use a published CSV/export link or upload the Excel file once.`,
    tried,
  } satisfies FetchResult, { status: 422 });
}
