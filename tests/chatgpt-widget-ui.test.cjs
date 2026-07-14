const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
  "utf8",
);

test("ChatGPT panel adopts the shared design language", () => {
  const panelSource = source.match(
    /function createChatGPTPanel\(\)[\s\S]*?function setChatGPTWidgetState/,
  )[0];
  // 与 Claude 同一套 Shadow DOM 骨架：收起卡 + 展开卡 + 共享样式层。
  assert.match(panelSource, /attachShadow\(\{ mode: "open" \}\)/);
  assert.match(panelSource, /\$\{widgetSharedStyles\(\)\}/);
  assert.match(panelSource, /compact-card/);
  assert.match(panelSource, /expanded-card is-off/);
  // ChatGPT 品牌绿徽章，替代旧版米色内联面板。
  assert.match(panelSource, /linear-gradient\(135deg, #1fc39a, #0d8a6a\)/);
  assert.doesNotMatch(panelSource, /rgb\(254, 252, 245\)/);
});

test("ChatGPT weekly quota renders with calendar icon and brand color", () => {
  assert.match(source, /function getChatGPTViewRows\(\)/);
  assert.match(source, /weekly: \["#10a37f", "rgba\(16, 163, 127, 0\.12\)"\]/);
  assert.match(source, /iconName: isWeekly \? "calendar" : "sparkles"/);
  assert.match(source, /fullLabel: isWeekly \? "每周使用限额"/);
});

test("ChatGPT reset credits render as a dedicated block outside quota rows", () => {
  assert.match(source, /function renderChatGPTCredits\(\)/);
  assert.match(source, /credit-item/);
  assert.match(source, /claudeIcon\("ticket"\)/);
  assert.match(source, /次可用/);
  assert.match(source, /最近到期/);
  // 重置卡容器独立于 quota-list，避免被额度行的增量清理误删。
  assert.match(source, /<div class="credit-list" hidden><\/div>/);
});

test("ChatGPT hover, tap and drag route through one state entry", () => {
  assert.match(source, /function setChatGPTWidgetState\(expanded\)/);
  assert.match(
    source,
    /mouseenter", \(\) => \{\n\s*if \(!isDragging\) setChatGPTWidgetState\(true\)/,
  );
  assert.match(
    source,
    /mouseleave", \(\) => \{\n\s*if \(!isDragging\) setChatGPTWidgetState\(false\)/,
  );
  // 触屏 tap 切换、拖动中强制收起，都不再直改 isHovered。
  assert.match(source, /setChatGPTWidgetState\(!isHovered\)/);
  assert.doesNotMatch(source, /isHovered = !isHovered/);
});

test("both providers resolve theme through the same data-theme attribute", () => {
  const themeSource = source.match(
    /function applyTheme\(\)[\s\S]*?\n    \}/,
  )[0];
  assert.match(themeSource, /panel\.setAttribute\("data-theme"/);
  assert.doesNotMatch(themeSource, /Object\.assign\(panel\.style/);
});
