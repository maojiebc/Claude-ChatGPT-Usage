const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
  "utf8",
);

test("Claude widget follows the compact and expanded reference dimensions", () => {
  assert.match(source, /\.compact-card\s*\{[\s\S]*?width:\s*104px;/);
  assert.match(source, /\.compact-row\s*\{[\s\S]*?min-height:\s*34px;/);
  assert.match(source, /\.expanded-card\s*\{[\s\S]*?304px[\s\S]*?min-height:\s*306px;/);
  assert.match(source, /right:\s*12px;/);
});

test("Claude widget has four explicit states and persistent settings", () => {
  assert.match(
    source,
    /const allowed = \["collapsed", "expanded", "settings", "hidden"\]/,
  );
  assert.match(source, /claude-usage-monitor:settings:v1/);
  assert.match(source, /autoCollapseDelay:\s*4000/);
  assert.match(source, /\[2000, 4000, 8000\]/);
  assert.match(source, /attachShadow\(\{ mode: "open" \}\)/);
});

test("closing the Claude widget only hides the current page session", () => {
  assert.match(
    source,
    /\["collapsed", "expanded"\]\.includes\(\s*saved\.lastVisibleState/,
  );
  assert.match(
    source,
    /\["collapsed", "expanded"\]\.includes\(next\)[\s\S]*?lastVisibleState = next/,
  );
  assert.doesNotMatch(
    source,
    /\["collapsed", "expanded", "hidden"\]\.includes\(\s*saved\.lastVisibleState/,
  );
});

test("hovering the Claude compact card expands it immediately", () => {
  assert.match(
    source,
    /compact\.addEventListener\("mouseenter",[\s\S]*?setClaudeWidgetState\("expanded"\)/,
  );
  assert.match(
    source,
    /host\.addEventListener\("mouseleave", scheduleClaudeAutoCollapse\)/,
  );
});

test("Claude compact view is limited to 5h, 7d, and F5", () => {
  assert.match(source, /\? "5h"/);
  assert.match(source, /\? "7d"/);
  assert.match(source, /\? "F5"/);
  assert.match(source, /\^Fable 5\$/);
  assert.match(
    source,
    /row\.key === "primary"[\s\S]*?row\.key === "secondary"[\s\S]*?Fable 5/,
  );
  assert.doesNotMatch(
    source.match(/function createClaudePanel\(\)[\s\S]*?function applyClaudePosition/)[0],
    /compact-card[\s\S]*?⚡/,
  );
});

test("Claude expanded view exposes reset time, settings, and recovery controls", () => {
  assert.match(source, /重置时间：/);
  assert.match(source, /\["周日", "周一", "周二", "周三", "周四", "周五", "周六"\]/);
  assert.match(source, /data-action="settings"/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /event\.altKey && event\.shiftKey/);
  assert.match(source, /显示 Claude 用量监控/);
});

test("Claude refresh updates existing quota nodes instead of rebuilding the root", () => {
  const renderSource = source.match(
    /function renderClaudePanel\(\)[\s\S]*?function applyTheme/,
  )[0];
  assert.doesNotMatch(renderSource, /innerHTML\s*=/);
  assert.match(renderSource, /updateClaudeQuotaNodes\(rows\)/);
});
