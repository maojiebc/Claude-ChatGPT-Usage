const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDynamicTranslations() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const block = source.match(
    /\/\/ BEGIN DYNAMIC_TRANSLATIONS[\s\S]*?\/\/ END DYNAMIC_TRANSLATIONS/,
  );
  assert.ok(block, "userscript should expose the dynamic translation block");
  const context = {};
  vm.runInNewContext(
    `${block[0]}\nglobalThis.__dynamicTranslations = DynamicTranslations;`,
    context,
  );
  return context.__dynamicTranslations;
}

const translations = loadDynamicTranslations();

test("translates Claude time-of-day greetings with or without a name", () => {
  assert.equal(translations.translate("Morning,"), "早上好，");
  assert.equal(translations.translate("Afternoon, 马甲"), "下午好，马甲");
  assert.equal(translations.translate("Good evening, Alice"), "晚上好，Alice");
});

test("translates model picker taglines and effort menu entries", () => {
  assert.equal(
    translations.translate("For your toughest challenges"),
    "应对最棘手的挑战",
  );
  assert.equal(
    translations.translate("Most efficient for everyday tasks"),
    "日常任务最高效",
  );
  assert.equal(
    translations.translate(
      "Higher effort means more thorough responses, but takes longer and uses your limits faster.",
    ),
    "工作量越高，回答越详尽，但耗时更长、额度消耗也更快。",
  );
  assert.equal(translations.translate("Low"), "低");
  assert.equal(translations.translate("High"), "高");
  assert.equal(translations.translate("Max"), "最高");
  assert.equal(translations.translate("Default"), "默认");
});

test("translates the limited-time inclusion banner with dynamic dates", () => {
  assert.equal(
    translations.translate("Included until July 19"),
    "7月19日前可用",
  );
  assert.equal(
    translations.translate("Included until January 3, 2027"),
    "2027年1月3日前可用",
  );
});

test("does not hijack prototype keys or ordinary sentences", () => {
  assert.equal(translations.translate("constructor"), "constructor");
  assert.equal(
    translations.translate("Maximum effort pays off"),
    "Maximum effort pays off",
  );
});

test("translates dynamic Fable usage and reset date", () => {
  assert.equal(
    translations.translate(
      "You’ve used 82% of your Fable 5 limit · Resets Jul 18 at 12:00 AM",
    ),
    "您已使用 Fable 5 额度的 82% · 将于 7月18日 00:00 重置",
  );
});

test("translates a Fable banner split across multiple DOM text segments", () => {
  assert.equal(
    translations.translateSegments([
      "You’ve used ",
      "82%",
      " of your Fable 5 limit",
      " · Resets Jul 18 at 12:00 AM",
    ]),
    "您已使用 Fable 5 额度的 82% · 将于 7月18日 00:00 重置",
  );
  assert.equal(
    translations.translateSegments([
      "You’ve used",
      "82%",
      "of your ",
      "Fable 5",
      " limit · Resets Jul 18 at 12:00 AM",
    ]),
    "您已使用 Fable 5 额度的 82% · 将于 7月18日 00:00 重置",
  );
});

test("ignores invisible separators in dynamic Claude banners", () => {
  assert.equal(
    translations.translate(
      "You’ve used\u200B 82% of your Fable 5 limit · Resets Jul 18 at 12:00 AM",
    ),
    "您已使用 Fable 5 额度的 82% · 将于 7月18日 00:00 重置",
  );
});

test("supports straight apostrophes, decimal percentages and relative reset days", () => {
  assert.equal(
    translations.translate(
      "You've used 42.5% of your session limit ∙ Resets Tomorrow at 1:05 PM",
    ),
    "您已使用会话额度的 42.5% · 将于 明天 13:05 重置",
  );
});

test("leaves unrelated page and conversation text unchanged", () => {
  assert.equal(
    translations.translate("Tell me about an afternoon in Paris."),
    "Tell me about an afternoon in Paris.",
  );
});
