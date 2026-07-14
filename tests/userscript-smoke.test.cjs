const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("runs on chatgpt.com and renders the weekly usage limit without Claude globals", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const elements = new Map();

  function createElement() {
    const listeners = new Map();
    return {
      _listeners: listeners,
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      getBoundingClientRect() {
        return { left: 1000, right: 1056, top: 50 };
      },
      id: "",
      innerHTML: "",
      offsetHeight: 100,
      parentNode: null,
      querySelectorAll() {
        return [];
      },
      releasePointerCapture() {},
      setPointerCapture() {},
      style: {},
      title: "",
    };
  }

  const body = {
    appendChild(element) {
      element.parentNode = body;
      elements.set(element.id, element);
    },
    removeChild(element) {
      elements.delete(element.id);
      element.parentNode = null;
    },
  };
  const documentElement = {
    classList: { contains: () => false },
    getAttribute: () => null,
  };
  const document = {
    addEventListener() {},
    body,
    createElement,
    documentElement,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    readyState: "complete",
  };

  async function fetch(url) {
    if (url === "https://chatgpt.com/api/auth/session") {
      return {
        json: async () => ({ accessToken: "not-a-jwt", accountId: "acct-test" }),
        ok: true,
        status: 200,
      };
    }
    if (url === "https://chatgpt.com/backend-api/codex/usage") {
      return {
        json: async () => ({
          plan_type: "prolite",
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
          rate_limit_reset_credits: { available_count: 4 },
        }),
        ok: true,
        status: 200,
      };
    }
    if (
      url ===
      "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"
    ) {
      return {
        json: async () => ({
          available_count: 4,
          credits: [
            {
              id: "reset-later",
              status: "available",
              expires_at: "2026-08-12T00:00:00Z",
            },
            {
              id: "reset-nearest",
              status: "available",
              expires_at: "2026-08-01T00:00:00Z",
            },
          ],
        }),
        ok: true,
        status: 200,
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  }

  const window = {
    fetch,
    innerHeight: 900,
    innerWidth: 1200,
    matchMedia() {
      return { addEventListener() {}, matches: false };
    },
  };
  const storage = new Map();
  const context = {
    MutationObserver: class {
      observe() {}
    },
    Request: class {},
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    location: { hostname: "chatgpt.com", pathname: "/" },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    window,
  };

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const panel = elements.get("claude-usage-panel-bottom");
  assert.ok(panel, "usage panel should be mounted");
  assert.equal(panel.title, "ChatGPT 使用限制");
  assert.match(panel.innerHTML, /36%/);
  panel._listeners.get("mouseenter")();
  assert.equal(panel.style.width, "228px");
  assert.match(panel.innerHTML, /Pro Lite/);
  assert.match(panel.innerHTML, /每周使用限额/);
  assert.match(panel.innerHTML, /重置卡/);
  assert.match(panel.innerHTML, /4 次可用/);
  assert.match(panel.innerHTML, /最近到期/);
  assert.doesNotMatch(panel.innerHTML, /Codex 当前额度|77%/);
  assert.doesNotMatch(panel.innerHTML, /data-usage-heading="model"/);
  assert.doesNotMatch(
    panel.innerHTML,
    /GPT-5\.3-Codex-Spark|Spark 独立额度|主窗口/,
  );
  assert.match(panel.innerHTML, /text-overflow:ellipsis/);
});
