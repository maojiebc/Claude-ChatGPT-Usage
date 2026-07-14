const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
  "utf8",
);
const iconSource = fs.readFileSync(
  path.join(__dirname, "..", "claude-usage-icons.user.js"),
  "utf8",
);

test("Claude widget follows the compact and expanded reference dimensions", () => {
  // v1.4.0 轻盈化：收起卡 96px（规格上限 104px 内），行高 30px。
  assert.match(source, /\.compact-card\s*\{[\s\S]*?width:\s*96px;/);
  assert.match(source, /\.compact-row\s*\{[\s\S]*?min-height:\s*30px;/);
  assert.match(source, /\.expanded-card\s*\{[\s\S]*?304px/);
  // 高度由内容决定：空态/失败态不再被 min-height 撑出空白。
  assert.doesNotMatch(source, /\.expanded-card\s*\{[\s\S]*?min-height:\s*306px;/);
  assert.match(source, /right:\s*12px;/);
});

test("Claude widget cards transition between states instead of toggling display", () => {
  // 收起/展开/设置面板通过 is-off 类做 opacity/transform/visibility 过渡。
  assert.match(source, /\.compact-card\.is-off, \.expanded-card\.is-off\s*\{/);
  assert.match(source, /compact\.classList\.toggle\("is-off"/);
  assert.match(source, /expanded\.classList\.toggle\("is-off"/);
  assert.match(source, /settings\.classList\.toggle\("is-off"/);
  assert.match(source, /transform-origin: top right;/);
});

test("Claude expanded quota items carry type icons and neutral compact chips", () => {
  // 展开态条目带类型图标，收起态胶囊回归中性底色。
  assert.match(source, /claudeQuotaIcons\s*=\s*\{[\s\S]*?fiveHour:\s*"clock"[\s\S]*?sevenDay:\s*"calendar"/);
  assert.match(source, /quota-icon/);
  assert.match(
    source,
    /\.compact-row\s*\{[\s\S]*?background:\s*var\(--cu-bg-soft\);/,
  );
  assert.match(source, /\.compact-row\[data-danger\]/);
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

test("Claude widget uses the generated icon asset set", () => {
  for (const name of [
    "bolt",
    "clock",
    "calendar",
    "brain",
    "refresh",
    "settings",
    "close",
    "resetCard",
  ]) {
    assert.match(iconSource, new RegExp(`${name}: \\"data:image/png;base64,`));
  }
  assert.match(source, /CLAUDE_USAGE_ICON_ASSETS/);
  assert.match(source, /assetIconName = \{/);
  assert.match(source, /fiveHour:\s*"clock"/);
  assert.match(source, /sevenDay:\s*"calendar"/);
  assert.match(source, /fableFive:\s*"brain"/);
  assert.match(source, /generated-quota-icon/);
  assert.match(source, /generatedClaudeIcon\("bolt", "generated-title-icon"\)/);
  assert.match(source, /generatedClaudeIcon\("close"\)/);
  assert.match(source, /generatedClaudeIcon\("refresh"\)/);
  assert.match(source, /generatedClaudeIcon\("settings"\)/);
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
    /function renderClaudePanel\(\)[\s\S]*?function getChatGPTViewRows/,
  )[0];
  assert.doesNotMatch(renderSource, /innerHTML\s*=/);
  assert.match(renderSource, /updateQuotaNodes\(claudeShadow, rows/);
});

test("both widgets share one style layer and quota-node updater", () => {
  assert.match(source, /function widgetSharedStyles\(\)/);
  assert.match(source, /function updateQuotaNodes\(shadow, rows/);
  // 两个面板都从共享层取样式，避免双份 CSS 漂移。
  const sharedCalls = source.match(/\$\{widgetSharedStyles\(\)\}/g) || [];
  assert.equal(sharedCalls.length, 2);
});
