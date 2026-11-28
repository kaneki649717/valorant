// 验证 localStorage 老记录能自动迁移进数据库
// 流程：预置 3 条老记录 → 打开页面 → 查库确认 3 条都在 → 清理
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
  const t = m.text();
  if (m.type() === "error" || /\[migrate\]/.test(t)) console.log("[console]", t);
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
await page.waitForTimeout(6000);

const cid = await F.evaluate(() => localStorage.getItem("vp_client_id"));
console.log("client_id =", cid);

// 预置 3 条老记录到 localStorage（模拟改造前的线上状态）
const seed = [
  { id: 1, rule_id: "TAC-01", content: "只能走路 (半场)", category: "tactical", timestamp: "2026-11-20T10:00:00.000Z", client_id: cid },
  { id: 2, rule_id: "WEP-02", content: "只能用刀", category: "weaponry", timestamp: "2026-11-21T11:00:00.000Z", client_id: cid },
  { id: 3, rule_id: "SOC-03", content: "只能报点", category: "social", timestamp: "2026-11-22T12:00:00.000Z", client_id: cid },
];
await F.evaluate(({ cid, seed }) => {
  localStorage.setItem(`vp_history_${cid}`, JSON.stringify(seed));
  localStorage.removeItem(`vp_history_${cid}__migrated`);
  localStorage.removeItem(`vp_history_${cid}__migrated__cursor`);
}, { cid, seed });

// 重载触发迁移
await page.reload({ waitUntil: "domcontentloaded" });
F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(1000);
  F = await getAppFrame();
}
if (!F) throw new Error("app iframe not found after reload");
await page.waitForTimeout(12000);

const rowsOnPage = await F.locator("#history-list .history-row").count();
const db = await rpc("draw_list", { p: { cid, limit: 20 } });
const dbRules = (db.items || []).map((i) => i.rule_id);
const migratedFlag = await F.evaluate((cid) => localStorage.getItem(`vp_history_${cid}__migrated`), cid);
const localLeft = await F.evaluate((cid) => localStorage.getItem(`vp_history_${cid}`), cid);

console.log("page rows      =", rowsOnPage);
console.log("db rules       =", JSON.stringify(dbRules));
console.log("migrated flag  =", migratedFlag);
console.log("local key left =", localLeft);

const okDb = seed.every((s) => dbRules.includes(s.rule_id));
const okPage = rowsOnPage >= 3;
const okClean = localLeft === null && migratedFlag === "3";
console.log(`${okDb ? "PASS" : "FAIL"}  3 条老记录全部进库`);
console.log(`${okPage ? "PASS" : "FAIL"}  页面显示迁移后的记录`);
console.log(`${okClean ? "PASS" : "FAIL"}  本地 key 已清理`);

// 清理
const ids = (db.items || []).filter((i) => seed.some((s) => s.rule_id === i.rule_id)).map((i) => i.id);
if (ids.length) {
  const del = await rpc("draw_undo", { p: { cid, ids } });
  console.log("cleanup deleted =", del.deleted);
}
await browser.close();
process.exit(okDb && okPage && okClean ? 0 : 1);
