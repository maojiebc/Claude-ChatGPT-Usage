const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUsageParsers() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const block = source.match(
    /\/\/ BEGIN USAGE_PARSERS[\s\S]*?\/\/ END USAGE_PARSERS/,
  );
  assert.ok(block, "userscript should expose the pure parser block");
  const context = {};
  vm.runInNewContext(
    `${block[0]}\nglobalThis.__usageParsers = UsageParsers;`,
    context,
  );
  return context.__usageParsers;
}

const parsers = loadUsageParsers();

test("parses Fable 5 from Claude limits[]", () => {
  const parsed = parsers.parseClaude({
    five_hour: {
      utilization: 15,
      resets_at: "2026-07-14T10:00:00Z",
    },
    seven_day: {
      utilization: 36,
      resets_at: "2026-07-19T10:00:00Z",
    },
    limits: [
      {
        kind: "weekly_scoped",
        group: "weekly",
        percent: 71,
        resets_at: "2026-07-19T10:00:00Z",
        scope: { model: { id: null, display_name: "Fable" } },
      },
    ],
  });

  assert.equal(parsed.hit, true);
  assert.equal(parsed.fiveHour.utilization, 15);
  assert.equal(parsed.sevenDay.utilization, 36);
  assert.equal(parsed.modelLimits.length, 1);
  assert.equal(parsed.modelLimits[0].name, "Fable 5");
  assert.equal(parsed.modelLimits[0].utilization, 71);
  assert.equal(parsed.modelLimits[0].window_minutes, 10_080);
});

test("keeps compatibility with legacy top-level Fable fields", () => {
  const parsed = parsers.parseClaude({
    fable_weekly: {
      used_percentage: "42.5",
      reset_at: 1_784_000_000,
    },
  });

  assert.equal(parsed.hit, true);
  assert.equal(parsed.hasScopedSurface, true);
  assert.equal(parsed.modelLimits[0].name, "Fable 5");
  assert.equal(parsed.modelLimits[0].utilization, 42.5);
});

test("keeps only ChatGPT's user-facing weekly usage limit", () => {
  const parsed = parsers.parseChatGPT({
    plan_type: "plus",
    rate_limit: {
      primary_window: {
        used_percent: 23,
        reset_at: 1_784_000_000,
        limit_window_seconds: 18_000,
      },
      secondary_window: {
        used_percent: 64,
        reset_at: 1_784_500_000,
        limit_window_seconds: 604_800,
      },
    },
    additional_rate_limits: [
      {
        limit_name: "GPT-5.5",
        rate_limit: {
          primary_window: {
            used_percent: 9,
            reset_at: 1_784_000_000,
            limit_window_seconds: 86_400,
          },
        },
      },
    ],
  });

  assert.equal(parsed.hit, true);
  assert.equal(parsed.planName, "plus");
  assert.equal(parsed.fiveHour, null);
  assert.equal(parsed.sevenDay.window_minutes, 10_080);
  assert.equal(parsed.modelLimits.length, 0);
});

test("finds a weekly ChatGPT limit in the primary window", () => {
  const parsed = parsers.parseChatGPT({
    rate_limit: {
      primary_window: {
        used_percent: 36,
        reset_at: 1_784_500_000,
        limit_window_seconds: 604_800,
      },
    },
    additional_rate_limits: [
      {
        limit_name: "GPT-5.3-Codex-Spark",
        rate_limit: {
          primary_window: {
            used_percent: 0,
            reset_at: 1_784_600_000,
            limit_window_seconds: 604_800,
          },
        },
      },
    ],
  });

  assert.equal(parsed.hit, true);
  assert.equal(parsed.sevenDay.utilization, 36);
  assert.equal(parsed.modelLimits.length, 0);
});

test("parses reset-card count and nearest available expiry", () => {
  const parsed = parsers.parseChatGPTResetCredits({
    available_count: 4,
    credits: [
      {
        id: "reset-later",
        status: "available",
        expires_at: "2026-08-12T00:00:00Z",
      },
      {
        id: "reset-redeemed",
        status: "redeemed",
        expires_at: "2026-07-16T00:00:00Z",
      },
      {
        id: "reset-sooner",
        status: "available",
        expires_at: "2026-08-01T00:00:00Z",
      },
    ],
  });

  assert.equal(parsed.availableCount, 4);
  assert.equal(parsed.nearestExpiresAt, Date.parse("2026-08-01T00:00:00Z"));
  assert.equal(parsed.detailsAvailable, true);
});

test("parses reset-card count when usage response has no details", () => {
  const parsed = parsers.parseChatGPTResetCredits({
    rate_limit_reset_credits: { available_count: 3 },
  });

  assert.equal(parsed.availableCount, 3);
  assert.equal(parsed.nearestExpiresAt, null);
  assert.equal(parsed.detailsAvailable, false);
});

test("normalizes epoch seconds, milliseconds and ISO reset times", () => {
  assert.equal(parsers.toTimestampMs(1_784_000_000), 1_784_000_000_000);
  assert.equal(parsers.toTimestampMs("1784000000000"), 1_784_000_000_000);
  assert.equal(
    parsers.toTimestampMs("2026-07-14T00:00:00Z"),
    Date.parse("2026-07-14T00:00:00Z"),
  );
});
