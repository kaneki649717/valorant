// 构建采集器：把 src/track/collector.js 混淆压缩到 src/track/collector.min.js
// 用法：node tools/build_tracker.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JavaScriptObfuscator = require("javascript-obfuscator");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/track/collector.js");
const dst = resolve(root, "src/track/collector.min.js");

// 浏览器全局构造器名是明文的话混淆器不会动，先把它们改成从 window 按名字取
const GLOBALS = ["RTCPeerConnection"];
let code = readFileSync(src, "utf8");
for (const g of GLOBALS) {
  const parts = g.match(/[A-Z][a-z]+|[A-Z]+(?![a-z])/g) || [g];
  const expr = "window[" + parts.map((p) => JSON.stringify(p)).join(" + ") + "]";
  code = code.replace(new RegExp(`\\b${g}\\b`, "g"), expr);
}

const result = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  simplify: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  disableConsoleOutput: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  rotateStringArray: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 6,
  stringArray: true,
  stringArrayEncoding: ["rc4"],
  stringArrayThreshold: 1,
  transformObjectKeys: true,
  unicodeEscapeSequence: true,
  selfDefending: true,
  target: "browser",
  seed: 0x7f3a1c9d,
});

writeFileSync(dst, result.getObfuscatedCode(), "utf8");
console.log(`built ${dst}`);
