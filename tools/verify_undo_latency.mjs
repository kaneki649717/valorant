// 验证：点击后提示和面板立刻出现，不等 RPC
import { chromium } from "playwright";

const URL = process.argv[2] || "https://valorant-000077.streamlit.app";
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

const t0 = Date.now();
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
let F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(500);
  F = await getAppFrame();
}
if (!F) throw new Error("app iframe not found");
await page.waitForTimeout(8000);
console.log(`页面就绪: ${Date.now() - t0}ms`);

// 清冷却
await F.evaluate(() => localStorage.removeItem("vp_cooldown"));
await page.reload({ waitUntil: "domcontentloaded" });
F = null;
for (let i = 0; i < 60 && !F; i++) {
  await page.waitForTimeout(500);
  F = await getAppFrame();
}
await page.waitForTimeout(8000);

// ---- 裁决：动画结束后到小绿框出现（动画本身固定 ~2.2s，不算在延迟里） ----
await F.locator("#btn-draw").click({ force: true });
const clickAt = Date.now();
// 等动画结束：按钮重新可用
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(50);
  const disabled = await F.locator("#btn-draw").isDisabled();
  if (!disabled) break;
}
const animDoneAt = Date.now();
let toastAt = 0;
let rowAt = 0;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(50);
  if (!toastAt && await F.locator(".success-toast").count()) toastAt = Date.now() - animDoneAt;
  if (!rowAt && (await F.locator("#history-list .history-row").count()) > 0) rowAt = Date.now() - animDoneAt;
  if (toastAt && rowAt) break;
}
console.log(`裁决: 动画耗时 ${animDoneAt - clickAt}ms, 动画结束→记录 ${rowAt}ms, 动画结束→绿框 ${toastAt}ms`);

// ---- 撤销：从点击到小绿框出现 ----
await page.waitForTimeout(1500);
const rowsBefore = await F.locator("#history-list .history-row").count();
const dbgBefore = await F.evaluate(() => ({
  cache: localStorage.getItem("vp_history_" + localStorage.getItem("vp_client_id")),
  rows: document.querySelectorAll("#history-list .history-row").length,
}));
console.log("  [dbg] cache before undo:", (dbgBefore.cache || "").slice(0, 200));
await F.locator("#btn-undo").click({ force: true });
const uClick = Date.now();
let uToastAt = 0;
let uRowAt = 0;
let dbgAfter = null;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(50);
  if (!uToastAt && await F.locator(".success-toast").count()) uToastAt = Date.now() - uClick;
  if (!uRowAt) {
    const now = await F.locator("#history-list .history-row").count();
    if (now < rowsBefore) {
      uRowAt = Date.now() - uClick;
      dbgAfter = await F.evaluate(() => ({
        cache: localStorage.getItem("vp_history_" + localStorage.getItem("vp_client_id")),
        rows: document.querySelectorAll("#history-list .history-row").length,
      }));
    }
  }
  if (uToastAt && uRowAt) break;
}
console.log(`撤销: 点击→记录消失 ${uRowAt}ms, 点击→绿框 ${uToastAt}ms`);
console.log("  [dbg] cache after undo:", ((dbgAfter && dbgAfter.cache) || "").slice(0, 200));

const okDraw = toastAt >= 0 && toastAt < 800;
const okUndo = uToastAt > 0 && uToastAt < 1500;
console.log(`${okDraw ? "PASS" : "FAIL"}  裁决提示及时 (${toastAt}ms)`);
console.log(`${okUndo ? "PASS" : "FAIL"}  撤销提示及时 (${uToastAt}ms)`);

await browser.close();
process.exit(okDraw && okUndo ? 0 : 1);
