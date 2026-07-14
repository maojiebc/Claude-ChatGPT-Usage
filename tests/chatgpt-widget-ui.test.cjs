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

test("ChatGPT weekly quota renders with calendar icon and health colors", () => {
  assert.match(source, /function getChatGPTViewRows\(\)/);
  assert.match(source, /iconName: isWeekly \? "calendar" : "sparkles"/);
  assert.match(source, /fullLabel: isWeekly \? "每周使用限额"/);
});

test("quota colors follow remaining-health tiers shared by both providers", () => {
  // 直接按剩余额度判断：充足绿、关注金黄、偏低橙、告急红。
  const health = source.match(
    /function quotaHealthColors\(remaining\)[\s\S]*?\n    \}/,
  );
  assert.ok(health, "quotaHealthColors should exist");
  const colorFor = Function(
    `"use strict"; ${health[0]}; return quotaHealthColors;`,
  )();
  assert.equal(colorFor(100)[0], "#059669");
  assert.equal(colorFor(80)[0], "#059669");
  assert.equal(colorFor(79)[0], "#c37a04");
  assert.equal(colorFor(60)[0], "#c37a04");
  assert.equal(colorFor(59)[0], "#ea580c");
  assert.equal(colorFor(46)[0], "#ea580c");
  assert.equal(colorFor(39)[0], "#ef4444");
  assert.equal(colorFor(0)[0], "#ef4444");
  // 两端视图行都走健康度色，不再按额度类型固定配色。
  const healthCalls =
    source.match(/= quotaHealthColors\(remaining\)/g) || [];
  assert.equal(healthCalls.length, 2);
  assert.doesNotMatch(source, /baseColors/);
});

test("ChatGPT compact card also surfaces the reset-credit count", () => {
  const fn = source.match(
    /function renderChatGPTCompactCredits\(\)[\s\S]*?\n    \}/,
  );
  assert.ok(fn, "compact credit renderer should exist");
  // 复用胶囊行结构：label 用生成的票券小图标（与 7d 缩写同列宽）+ 紫色 ×N；无卡时整行移除。
  assert.match(fn[0], /generatedClaudeIcon\("resetCard"\)/);
  assert.match(fn[0], /`×\$\{credits\.availableCount\}`/);
  assert.match(fn[0], /#8b5cf6/);
  assert.match(fn[0], /row\?\.remove\(\)/);
  assert.match(fn[0], /最近到期/);
  // 收起态渲染链路中实际调用。
  assert.match(source, /updateQuotaNodes\(chatgptShadow, rows\);\n\s*renderChatGPTCompactCredits\(\)/);
});

test("ChatGPT reset credits render as a dedicated block outside quota rows", () => {
  assert.match(source, /function renderChatGPTCredits\(\)/);
  assert.match(source, /credit-item/);
  assert.match(source, /generatedClaudeIcon\("resetCard", "generated-quota-icon"\)/);
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

test("ChatGPT panel docks to the nearest edge instead of floating freely", () => {
  // 水平永远吸边（与 Claude 的贴边一致），只记忆垂直位置与停靠边。
  assert.match(source, /function applyChatGPTPosition\(/);
  assert.match(source, /savedPosition = \{ top: 50, isRight: true \}/);
  assert.match(
    source,
    /rect\.left \+ rect\.width \/ 2 > window\.innerWidth \/ 2/,
  );
  // localStorage 只存 {top, isRight}；旧版的悬空 left/right 偏移不再写入。
  assert.match(
    source,
    /JSON\.stringify\(\{\n\s*top: savedPosition\.top,\n\s*isRight: savedPosition\.isRight,\n\s*\}\)/,
  );
  assert.doesNotMatch(source, /savedPosition\.right = window\.innerWidth/);
  // 拖动被打断（pointercancel）时回弹到停靠位，不悬空。
  const cancelBlock = source.match(
    /pointercancel[\s\S]*?renderPanel\(\);\n\s*\}\);/,
  )[0];
  assert.match(cancelBlock, /applyChatGPTPosition\(\)/);
  // 左停靠时卡片从左缘生长。
  assert.match(source, /data-dock="left"[\s\S]*?transform-origin: top left/);
});

test("both providers resolve theme through the same data-theme attribute", () => {
  const themeSource = source.match(
    /function applyTheme\(\)[\s\S]*?\n    \}/,
  )[0];
  assert.match(themeSource, /panel\.setAttribute\("data-theme"/);
  assert.doesNotMatch(themeSource, /Object\.assign\(panel\.style/);
});
