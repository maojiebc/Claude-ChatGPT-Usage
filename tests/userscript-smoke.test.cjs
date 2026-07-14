const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("runs on chatgpt.com and renders Codex quota without Claude globals", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "claude-chatgpt-usage.user.js"),
    "utf8",
  );
  const elements = new Map();

  function createElement() {
    return {
      addEventListener() {},
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
  assert.equal(panel.title, "ChatGPT / Codex 用量");
  assert.match(panel.innerHTML, /77%/);
  assert.match(panel.innerHTML, /36%/);
});
