import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("TuckQ app replaces the starter preview", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const oldUi = await readFile(new URL("../public/tuckq.html", import.meta.url), "utf8");

  assert.match(page, /iframe/);
  assert.match(page, /\/tuckq\.html/);
  assert.match(oldUi, /TISB Tuck Shop Operating System/);
  assert.match(oldUi, /admin123/);
  assert.match(oldUi, /student1042/);
  assert.match(oldUi, /createStudentLogin/);
  assert.match(oldUi, /Queue ticket cancelled/);
  assert.match(oldUi, /salesReportRows/);
  assert.match(oldUi, /Microsoft email and NFC card UID mapping is active/);
  assert.match(oldUi, /Student master file/);
  assert.match(oldUi, /Student ID \/ NFC card UID/);
  assert.match(oldUi, /customReportRows/);
  assert.match(oldUi, /TISB-Logo-DarkBG/);
  assert.match(layout, /TuckQ \| TISB Tuck Shop/);
  assert.match(styles, /\.tuckq-frame/);
  assert.doesNotMatch(page + layout + oldUi, /SkeletonPreview|codex-preview|Queless/);
});
