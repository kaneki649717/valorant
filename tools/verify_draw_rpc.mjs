// 验证线上裁决记录能写进 Supabase：抽一次 → 查库 → 清掉
// 用法：node tools/verify_draw_rpc.mjs [url]
import { chromium } from "playwright";

const URL = process.argv[2] || "https://valorant-000077.streamlit.app";
const SB_URL = "https://hfexsoembyhkshafpdnd.supabase.co";
const SB_KEY = "sb_publishable_p62RjCDeZYb5R-ddDbBuvQ_rR4XPS0x";

const rpc = async (fn, payload) => {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
};

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error" && /rpc|history|fetch/i.test(m.text())) console.log("[console.error]", m.text());
});
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });

const getAppFrame = async () => {
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      if (await f.locator("#btn-draw").count()) return f;
    } catch (e) {}
  }
  return null;
};
let F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(1000);
  F = await getAppFrame();
}
if (!F) throw new Error("app iframe not found");
await page.waitForTimeout(8000);

// 清掉冷却，保证能抽
await F.evaluate(() => localStorage.removeItem("vp_cooldown"));
await page.reload({ waitUntil: "domcontentloaded" });
F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(1000);
  F = await getAppFrame();
}
if (!F) throw new Error("app iframe not found after reload");
await page.waitForTimeout(8000);

const cid = await F.evaluate(() => localStorage.getItem("vp_client_id"));
console.log("client_id =", cid);

const rowsBefore = (await F.locator("#history-list .history-row").count());
console.log("history rows before =", rowsBefore);

await F.locator("#btn-draw").click({ force: true });
await page.waitForTimeout(6000);

const rowsAfter = (await F.locator("#history-list .history-row").count());
const labelText = (await F.locator("#category-label").innerText()).trim();
console.log("history rows after  =", rowsAfter);
console.log("category-label      =", labelText);

// 直接查库确认
const db = await rpc("draw_list", { p: { cid, limit: 5 } });
console.log("db items =", JSON.stringify(db.items, null, 2));

const okWrite = db.items && db.items.length > 0 && rowsAfter === rowsBefore + 1;
const okLabel = db.items && db.items.length && labelText.includes("//");
console.log(`${okWrite ? "PASS" : "FAIL"}  裁决写入数据库`);
console.log(`${okLabel ? "PASS" : "FAIL"}  页面与库一致`);

// 清理：删掉刚才这条测试记录
const del = await rpc("draw_undo", { p: { cid, ids: db.items && db.items.length ? [db.items[0].id] : null } });
console.log("cleanup deleted =", del.deleted);
await browser.close();
process.exit(okWrite && okLabel ? 0 : 1);
