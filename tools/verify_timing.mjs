// 验证首屏时序：面板不空白、动画不等网络、迁移不阻塞
import { chromium } from "playwright";

const URL = process.argv[2] || "https://valorant-000077.streamlit.app";
const SB_URL = "https://hfexsoembyhkshafpdnd.supabase.co";
const SB_KEY = "sb_publishable_p62RjCDeZYb5R-ddDbBuvQ_rR4XPS0x";

const rpc = async (fn, payload) => {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.log(`  [rpc retry ${attempt}/4] ${e.message.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw lastErr;
};

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const getAppFrame = async () => {
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      if (await f.locator("#btn-draw").count()) return f;
    } catch (e) {}
  }
  return null;
};

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
let F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(500);
  F = await getAppFrame();
}
if (!F) throw new Error("app iframe not found");

const cid = await F.evaluate(() => localStorage.getItem("vp_client_id"));
console.log("client_id =", cid);

// 预置 3 条带真实时间戳的老记录
const seed = [
  { id: 1, rule_id: "TAC-01", content: "只能走路 (半场)", category: "tactical", timestamp: "2026-11-01T10:00:00.000Z", client_id: cid },
  { id: 2, rule_id: "WEP-02", content: "只能用刀", category: "weaponry", timestamp: "2026-11-05T11:00:00.000Z", client_id: cid },
  { id: 3, rule_id: "SOC-03", content: "只能报点", category: "social", timestamp: "2026-11-10T12:00:00.000Z", client_id: cid },
];
await F.evaluate(({ cid, seed }) => {
  localStorage.setItem(`vp_history_${cid}`, JSON.stringify(seed));
  localStorage.removeItem(`vp_history_${cid}__migrated`);
  localStorage.removeItem(`vp_history_${cid}__migrated__cursor`);
}, { cid, seed });

// 重载，采样首屏各时间点
const t0 = Date.now();
await page.reload({ waitUntil: "domcontentloaded" });
let samples = [];
let F2 = null;
for (let i = 0; i < 80; i++) {
  await page.waitForTimeout(100);
  if (!F2) {
    F2 = await getAppFrame();
    if (F2) {
      samples.push({ t: Date.now() - t0, event: "iframe ready" });
    }
  } else {
    try {
      const rows = await F2.locator("#history-list .history-row").count();
      const hasAnim = await F2.evaluate(() => !!document.querySelector(".datastream-layer"));
      const last = samples[samples.length - 1];
      const state = `${rows}rows,anim=${hasAnim}`;
      if (!last || last.state !== state) {
        samples.push({ t: Date.now() - t0, state });
      }
    } catch (e) {}
  }
}
console.log("\n首屏时序：");
for (const s of samples) console.log(`  ${String(s.t).padStart(5)}ms  ${s.event || s.state}`);

// 等迁移完成，验证时间戳保留
await page.waitForTimeout(20000);
const db = await rpc("draw_list", { p: { cid, limit: 20 } });
console.log("\n数据库记录：");
for (const it of db.items || []) console.log(`  ${it.timestamp}  ${it.rule_id}  ${it.content}`);

const okTs = seed.every((s) =>
  (db.items || []).some((i) => i.rule_id === s.rule_id && i.timestamp.startsWith(s.timestamp.slice(0, 10)))
);
console.log(`\n${okTs ? "PASS" : "FAIL"}  迁移保留原始时间戳`);

const ids = (db.items || []).filter((i) => seed.some((s) => s.rule_id === i.rule_id)).map((i) => i.id);
if (ids.length) {
  const del = await rpc("draw_undo", { p: { cid, ids } });
  console.log("cleanup deleted =", del.deleted);
}
await browser.close();
process.exit(okTs ? 0 : 1);
