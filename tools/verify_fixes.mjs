// 本地回归验证：类别不弹回 / 裁决 3 次限流 / 撤销 1 次限流 / 刷新保留 CD / 无 wait 光标
// 用法：node tools/verify_fixes.mjs [url]
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:8599";
const results = [];
const rec = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

// Streamlit 的 components.html 会生成一个 srcdoc iframe（title=st.iframe，1.53 只有这一层）
const getAppFrame = async () => {
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      if (await f.locator("#btn-draw").count()) return f;
    } catch (e) {}
  }
  return null;
};
let appFrame = null;
for (let i = 0; i < 60 && !appFrame; i++) {
  await page.waitForTimeout(1000);
  appFrame = await getAppFrame();
}
if (!appFrame) throw new Error("app iframe not found");
await page.waitForTimeout(6000);

const F = appFrame;
const catValue = () => F.locator("#category-value").innerText();
const catText = async () => (await F.locator("#category-value").textContent()).trim();
const openMenu = async () => {
  await F.locator("#category-trigger").click();
  await F.locator("#category-dropdown.open").waitFor({ timeout: 3000 });
};

// ---- 1. 类别选中后立刻点执行裁决区域，不应弹回 ----
await openMenu();
await F.locator('.category-dropdown-item[data-value="weaponry"]').click();
// 不等待，立刻点执行裁决（模拟用户的快速操作）
await F.locator("#btn-draw").click({ force: true, timeout: 2000 }).catch(() => {});
await page.waitForTimeout(400);
const t1 = await catText();
rec("类别不弹回", t1 === "器械", `选中后快速点执行裁决，显示值=${t1}`);

// ---- 2. 裁决 5 分钟内最多 3 次 ----
// 等 draw 动画结束
await page.waitForTimeout(3500);
const drawOnce = async () => {
  const before = await F.locator("#category-label").innerText();
  await F.locator("#btn-draw").click({ force: true });
  await page.waitForTimeout(3200);
  const after = await F.locator("#category-label").innerText();
  return before !== after;
};
// 上面那次点击被 dropdown guard 吞掉了，不算。现在从干净状态连点 5 次：前 3 次生效，后 2 次被拦。
// 先清掉冷却，保证从 0 开始。
await F.evaluate(() => localStorage.removeItem("vp_cooldown"));
await page.reload({ waitUntil: "domcontentloaded" });
let appFrame1 = null;
for (let i = 0; i < 60 && !appFrame1; i++) {
  await page.waitForTimeout(1000);
  appFrame1 = await getAppFrame();
}
const F1 = appFrame1;
await page.waitForTimeout(6000);
const drawOnce1 = async () => {
  const before = await F1.locator("#category-label").innerText();
  await F1.locator("#btn-draw").click({ force: true });
  await page.waitForTimeout(3200);
  const after = await F1.locator("#category-label").innerText();
  return before !== after;
};
const r1 = await drawOnce1();
const r2 = await drawOnce1();
const r3 = await drawOnce1();
const r4 = await drawOnce1();
const r5 = await drawOnce1();
rec("裁决 3 次限流", r1 && r2 && r3 && !r4 && !r5, `1=${r1} 2=${r2} 3=${r3} 4=${r4} 5=${r5}`);

// ---- 3. 撤销 5 分钟内最多 1 次 ----
const undoOnce = async () => {
  const before = await F1.locator("#history-list .history-row").count();
  await F1.locator("#btn-undo").click({ force: true });
  await page.waitForTimeout(2500);
  const after = await F1.locator("#history-list .history-row").count();
  return after === before - 1;
};
const u1 = await undoOnce();
const u2 = await undoOnce();
rec("撤销 1 次限流", u1 && !u2, `第1次=${u1} 第2次=${u2}`);

// ---- 4. 刷新后 CD 保留 ----
await page.reload({ waitUntil: "domcontentloaded" });
let appFrame2 = null;
for (let i = 0; i < 60 && !appFrame2; i++) {
  await page.waitForTimeout(1000);
  appFrame2 = await getAppFrame();
}
if (!appFrame2) throw new Error("app iframe not found after reload");
const F2 = appFrame2;
await page.waitForTimeout(6000);
const beforeReload = await F2.locator("#category-label").innerText();
await F2.locator("#btn-draw").click({ force: true });
await page.waitForTimeout(3200);
const afterReload = await F2.locator("#category-label").innerText();
rec("刷新保留 CD", beforeReload === afterReload, `刷新后点裁决，label 变化=${beforeReload !== afterReload}`);

// ---- 5. busy 时不是 wait 光标 ----
await F2.locator("#btn-draw").click({ force: true }).catch(() => {});
await page.waitForTimeout(300);
const cursor = await F2.evaluate(() => {
  const el = document.getElementById("btn-draw");
  const cs = getComputedStyle(el);
  return { cls: el.className, disabled: el.disabled, cursor: cs.cursor };
});
rec("无 wait 光标", cursor.cursor !== "wait", JSON.stringify(cursor));

// ---- 6. localStorage 里的冷却值 ----
const cd = await F2.evaluate(() => localStorage.getItem("vp_cooldown"));
console.log("vp_cooldown =", cd);

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
