// 上线前检查：构建采集器 → 语法校验 → 明文泄漏扫描 → Python 打包校验
// 用法：node tools/preflight.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { fail.push(m); console.log("  FAIL " + m); };

console.log("[1/4] 构建采集器");
try {
  execFileSync(process.execPath, [resolve(root, "tools/build_tracker.mjs")], { stdio: "inherit" });
  ok("collector.min.js 已更新");
} catch (e) { bad("构建失败: " + e.message); }

console.log("[2/4] 语法校验");
const minPath = resolve(root, "src/track/collector.min.js");
// 源文件是 ESM，必须按 module 解析；直接 --check 会按 CJS 处理，import/export 会误报
const checkEsm = (abs) => {
  const src = readFileSync(abs, "utf8");
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: src, stdio: "pipe" });
};
if (!existsSync(minPath)) { bad("collector.min.js 不存在"); }
else {
  try {
    execFileSync(process.execPath, ["--check", minPath], { stdio: "pipe" });
    ok("collector.min.js 语法通过");
  } catch (e) { bad("collector.min.js 语法错误"); }
}
for (const f of ["src/config.js", "src/utils.js", "src/api.js", "src/effects.js",
  "src/core/Store.js", "src/components/GlitchText.js", "src/main.js"]) {
  try {
    checkEsm(resolve(root, f));
  } catch (e) { bad(f + " 语法错误: " + String(e.stderr || e.message).slice(0, 200)); }
}
if (!fail.some((x) => x.includes("语法错误"))) ok("7 个前端模块语法通过");

console.log("[3/4] 明文泄漏扫描（产物里不该出现的词）");
const min = existsSync(minPath) ? readFileSync(minPath, "utf8") : "";
const SECRETS = [
  "stun:", "RTCPeerConnection", "track_visit", "track_leave", "rest/v1/rpc",
  "ipify", "icanhazip", "cdn-cgi/trace", "deviceMemory", "hardwareConcurrency",
  "enumerateDevices", "requestMediaKeySystemAccess", "permissions.query",
  "getUserMedia", "canvas", "getContext", "toDataURL", "AudioContext",
  "OffscreenCanvas", "WebGLRenderingContext", "fonts", "voices",
  "supabase", "sb_publishable", "hfexsoembyhkshafpdnd"
];
const leaked = SECRETS.filter((s) => min.includes(s));
if (leaked.length) bad("产物里还有明文: " + leaked.join(", "));
else ok("23 个敏感词全部隐藏");

console.log("[4/4] Python 侧检查");
try {
  execFileSync("python", ["-c", "import ast,sys; ast.parse(open('app.py',encoding='utf-8').read())"], { cwd: root, stdio: "pipe" });
  ok("app.py 语法通过");
} catch (e) { bad("app.py 语法错误"); }
const appSrc = readFileSync(resolve(root, "app.py"), "utf8");
if (!appSrc.includes("collector.min.js")) bad("app.py 没有加载 collector.min.js");
else ok("app.py 已指向混淆产物");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (!pkg.scripts?.preflight) {
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.preflight = "node tools/preflight.mjs";
  pkg.scripts.build = "node tools/build_tracker.mjs";
  writeFileSync(resolve(root, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  ok("package.json 已加 preflight / build 脚本");
} else ok("package.json 脚本已就位");

console.log("");
if (fail.length) {
  console.log("preflight FAIL (" + fail.length + ")");
  process.exit(1);
}
console.log("preflight PASS");
