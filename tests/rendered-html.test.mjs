import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("TuckQ app replaces the starter preview", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /TuckQ/);
  assert.match(page, /Student Portal Login/);
  assert.match(page, /cancelBooking/);
  assert.match(page, /placePreorder/);
  assert.match(page, /sendBillEmail/);
  assert.match(page, /downloadReport/);
  assert.match(page, /Download bill/);
  assert.match(layout, /TuckQ \| TISB Tuck Shop/);
  assert.match(styles, /\.noticePanel/);
  assert.match(styles, /\.billCard/);
  assert.doesNotMatch(page + layout, /SkeletonPreview|codex-preview|Queless/);
});
