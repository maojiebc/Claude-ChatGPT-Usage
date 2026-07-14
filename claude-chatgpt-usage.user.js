// ==UserScript==
// @name         Claude & ChatGPT 中文汉化与用量显示
// @namespace    https://github.com/maojiebc/Claude-ChatGPT-Usage/
// @homepageURL  https://github.com/maojiebc/Claude-ChatGPT-Usage/
// @supportURL   https://github.com/maojiebc/Claude-ChatGPT-Usage/issues
// @source       https://github.com/maojiebc/Claude-ChatGPT-Usage/
// @author       jyking (original), maojiebc (maintainer)
// @copyright    2026, jyking and maojiebc
// @version      1.2.0
// @description  Claude.ai 完整中文汉化，并显示 Claude/Fable 5 与 ChatGPT/Codex 剩余用量
// @icon         https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/cd02a42d9-Vq_H3mgS.svg
// @match        https://claude.ai/*
// @match        https://chatgpt.com/*
// @require      https://raw.githubusercontent.com/maojiebc/Claude-ChatGPT-Usage/v1.0.0/claude2cn-design.user.js#sha256=19fefdebcb71584886bfa494aed0e54c4922860f01d9db367e838489ab8afb48
// @require      https://raw.githubusercontent.com/maojiebc/Claude-ChatGPT-Usage/v1.0.0/claude2cn-translations.user.js#sha256=587a5de6adf25d5aa19f1e6f58b5bb6181f31e5d89e49669a3c75a85df8ff61a
// @grant        none
// @license      MIT
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const isClaudeSite = location.hostname === "claude.ai";
  const isChatGPTSite = location.hostname === "chatgpt.com";

  // 添加 CSS 变量
  if (isClaudeSite) {
    const style = document.createElement("style");
    style.textContent = `
      :root {
        --font-anthropic-serif: "Anthropic Serif", Georgia, "Times New Roman", Times, "Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC", "Source Hans Serif CN", "Songti SC", SimSun, serif;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : "";

      if (
        !url.includes("/i18n/en-US.json") &&
        !url.includes("/i18n/statsig/en-US.json")
      ) {
        return originalFetch(...args);
      }

      const response = await originalFetch(...args);
      const json = await response.json();

      for (const key of Object.keys(json)) {
        const val = json[key];
        if (typeof val === "string" && TRANSLATIONS[val]) {
          json[key] = TRANSLATIONS[val];
        }
      }

      return new Response(JSON.stringify(json), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
  }

  // BEGIN USAGE_PARSERS — 保持为纯函数，便于离线测试未公开接口的响应兼容性。
  const UsageParsers = (() => {
    function asNumber(value) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    }

    function firstNumber(...values) {
      for (const value of values) {
        const parsed = asNumber(value);
        if (parsed !== null) return parsed;
      }
      return null;
    }

    function toTimestampMs(value) {
      const numeric = asNumber(value);
      if (numeric !== null) {
        return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
      }
      if (typeof value !== "string" || !value.trim()) return null;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeWindow(raw, defaultWindowMinutes = null) {
      if (!raw || typeof raw !== "object") return null;
      const utilization = firstNumber(
        raw.utilization,
        raw.used_percentage,
        raw.used_percent,
        raw.percent,
      );
      if (utilization === null) return null;
      const seconds = firstNumber(
        raw.limit_window_seconds,
        raw.window_seconds,
      );
      const minutes = firstNumber(raw.window_minutes, raw.window_duration_minutes);
      return {
        utilization: Math.min(100, Math.max(0, utilization)),
        resets_at:
          raw.resets_at ?? raw.reset_at ?? raw.resetAt ?? raw.resetsAt ?? null,
        window_minutes:
          minutes ?? (seconds !== null ? seconds / 60 : defaultWindowMinutes),
      };
    }

    function stringValue(value) {
      return typeof value === "string" ? value.trim() : "";
    }

    function displayModelName(value) {
      const name = stringValue(value);
      return /^(?:claude[-_ ]?)?fable(?:[-_ ]?5)?$/i.test(name)
        ? "Fable 5"
        : name;
    }

    function parseClaude(data) {
      const empty = {
        fiveHour: null,
        sevenDay: null,
        modelLimits: [],
        resetCredits: null,
        planName: "",
        hit: false,
        hasScopedSurface: false,
      };
      if (!data || typeof data !== "object") return empty;

      let fiveHour = normalizeWindow(data.five_hour, 300);
      let sevenDay = normalizeWindow(data.seven_day, 10_080);
      const modelLimits = new Map();

      function setModelLimit(name, raw, defaultWindowMinutes = 10_080) {
        const modelName = displayModelName(name);
        const window = normalizeWindow(raw, defaultWindowMinutes);
        if (!modelName || !window) return;
        modelLimits.set(modelName.toLowerCase(), { name: modelName, ...window });
      }

      setModelLimit(
        "Fable 5",
        data.seven_day_fable ?? data.fable_seven_day ?? data.fable_weekly,
      );

      if (Array.isArray(data.limits)) {
        for (const limit of data.limits) {
          if (!limit || typeof limit !== "object") continue;
          const kind = stringValue(limit.kind).toLowerCase();
          const group = stringValue(limit.group).toLowerCase();
          const scopedModel =
            limit.scope?.model?.display_name ??
            limit.scope?.model?.name ??
            limit.scope?.model?.id ??
            (typeof limit.scope?.model === "string" ? limit.scope.model : "");
          const windowMinutes =
            group === "session" || kind === "session" ? 300 : 10_080;

          if (stringValue(scopedModel)) {
            setModelLimit(scopedModel, limit, windowMinutes);
          } else if (!fiveHour && (kind === "session" || group === "session")) {
            fiveHour = normalizeWindow(limit, 300);
          } else if (
            !sevenDay &&
            (kind === "weekly_all" || group === "weekly")
          ) {
            sevenDay = normalizeWindow(limit, 10_080);
          }
        }
      }

      if (Array.isArray(data.rate_limits)) {
        for (const item of data.rate_limits) {
          if (!item || typeof item !== "object") continue;
          const windowName = stringValue(
            item.window_duration ?? item.type ?? item.kind,
          ).toLowerCase();
          const modelName =
            item.scope?.model?.display_name ?? item.model?.display_name ?? "";
          if (stringValue(modelName)) {
            setModelLimit(modelName, item);
          } else if (!fiveHour && /5h|five.?hour|session/.test(windowName)) {
            fiveHour = normalizeWindow(item, 300);
          } else if (!sevenDay && /7d|seven.?day|week/.test(windowName)) {
            sevenDay = normalizeWindow(item, 10_080);
          }
        }
      }

      const result = {
        fiveHour,
        sevenDay,
        modelLimits: [...modelLimits.values()],
        resetCredits: null,
        planName: stringValue(
          data.subscription_type ?? data.plan_name ?? data.plan,
        ),
        hasScopedSurface:
          Array.isArray(data.limits) || modelLimits.size > 0,
      };
      return {
        ...result,
        hit: Boolean(
          result.fiveHour || result.sevenDay || result.modelLimits.length,
        ),
      };
    }

    function parseChatGPT(data) {
      const empty = {
        fiveHour: null,
        sevenDay: null,
        modelLimits: [],
        resetCredits: null,
        planName: "",
        hit: false,
      };
      if (!data || typeof data !== "object") return empty;

      const rateLimit = data.rate_limit ?? data.rateLimit ?? {};
      const primaryWindow = normalizeWindow(
        rateLimit.primary_window ?? rateLimit.primaryWindow ?? data.primary,
        300,
      );
      const secondaryWindow = normalizeWindow(
        rateLimit.secondary_window ?? rateLimit.secondaryWindow ?? data.secondary,
        10_080,
      );
      const weeklyWindow = [primaryWindow, secondaryWindow].find((window) => {
        const minutes = Number(window?.window_minutes);
        return Number.isFinite(minutes) && minutes >= 9_360 && minutes <= 10_800;
      });

      const result = {
        // ChatGPT 网页端只把套餐共享的每周用量作为用户额度展示。
        // additional_rate_limits 是内部模型计量项，不属于网页端额度维度。
        fiveHour: null,
        sevenDay: weeklyWindow ?? null,
        modelLimits: [],
        resetCredits: parseChatGPTResetCredits(data),
        planName: stringValue(data.plan_type ?? data.planType ?? data.plan),
      };
      return {
        ...result,
        hit: Boolean(
          result.fiveHour || result.sevenDay || result.modelLimits.length,
        ),
      };
    }

    function parseChatGPTResetCredits(data) {
      if (!data || typeof data !== "object") return null;
      const summary =
        data.rate_limit_reset_credits ?? data.rateLimitResetCredits ?? data;
      if (!summary || typeof summary !== "object") return null;

      const credits = Array.isArray(summary.credits) ? summary.credits : null;
      const availableCredits = (credits ?? []).filter((credit) => {
        if (!credit || typeof credit !== "object") return false;
        const status = stringValue(credit.status).toLowerCase();
        return !status || status === "available";
      });
      const availableCountValue = firstNumber(
        summary.available_count,
        summary.availableCount,
      );
      if (availableCountValue === null && credits === null) return null;

      const expirations = availableCredits
        .map((credit) =>
          toTimestampMs(credit.expires_at ?? credit.expiresAt ?? null),
        )
        .filter((timestamp) => timestamp !== null)
        .sort((a, b) => a - b);

      return {
        availableCount: Math.max(
          0,
          Math.floor(availableCountValue ?? availableCredits.length),
        ),
        nearestExpiresAt: expirations[0] ?? null,
        detailsAvailable: credits !== null,
      };
    }

    function merge(base, incoming) {
      if (!base) return incoming;
      const modelLimits = new Map();
      for (const item of [...base.modelLimits, ...incoming.modelLimits]) {
        modelLimits.set(item.name.toLowerCase(), item);
      }
      const merged = {
        fiveHour: incoming.fiveHour ?? base.fiveHour,
        sevenDay: incoming.sevenDay ?? base.sevenDay,
        modelLimits: [...modelLimits.values()],
        resetCredits: incoming.resetCredits ?? base.resetCredits ?? null,
        planName: incoming.planName || base.planName,
        hasScopedSurface: Boolean(
          base.hasScopedSurface || incoming.hasScopedSurface,
        ),
      };
      return {
        ...merged,
        hit: Boolean(
          merged.fiveHour || merged.sevenDay || merged.modelLimits.length,
        ),
      };
    }

    return Object.freeze({
      parseClaude,
      parseChatGPT,
      parseChatGPTResetCredits,
      merge,
      toTimestampMs,
    });
  })();
  // END USAGE_PARSERS

  // BEGIN DYNAMIC_TRANSLATIONS — 处理包含姓名、百分比和日期的运行时文案。
  const DynamicTranslations = (() => {
    const greetings = {
      morning: "早上好",
      afternoon: "下午好",
      evening: "晚上好",
    };
    const months = {
      jan: 1,
      january: 1,
      feb: 2,
      february: 2,
      mar: 3,
      march: 3,
      apr: 4,
      april: 4,
      may: 5,
      jun: 6,
      june: 6,
      jul: 7,
      july: 7,
      aug: 8,
      august: 8,
      sep: 9,
      sept: 9,
      september: 9,
      oct: 10,
      october: 10,
      nov: 11,
      november: 11,
      dec: 12,
      december: 12,
    };
    const relativeDays = {
      today: "今天",
      tomorrow: "明天",
      monday: "周一",
      tuesday: "周二",
      wednesday: "周三",
      thursday: "周四",
      friday: "周五",
      saturday: "周六",
      sunday: "周日",
    };

    function formatClock(hourValue, minuteValue, meridiemValue) {
      let hour = Number(hourValue);
      const minute = Number(minuteValue || 0);
      const meridiem = String(meridiemValue || "").toUpperCase();
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
      if (meridiem === "AM" && hour === 12) hour = 0;
      if (meridiem === "PM" && hour < 12) hour += 12;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }

    function formatResetTime(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";

      const dateMatch = raw.match(
        /^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM))?$/i,
      );
      if (dateMatch) {
        const month = months[dateMatch[1].toLowerCase()];
        if (month) {
          const year = dateMatch[3] ? `${dateMatch[3]}年` : "";
          const clock = dateMatch[4]
            ? ` ${formatClock(dateMatch[4], dateMatch[5], dateMatch[6])}`
            : "";
          return `${year}${month}月${Number(dateMatch[2])}日${clock}`;
        }
      }

      const relativeMatch = raw.match(
        /^(Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i,
      );
      if (relativeMatch) {
        return `${relativeDays[relativeMatch[1].toLowerCase()]} ${formatClock(
          relativeMatch[2],
          relativeMatch[3],
          relativeMatch[4],
        )}`;
      }

      return raw
        .replace(/\bat\b/gi, "")
        .replace(/\bAM\b/gi, "上午")
        .replace(/\bPM\b/gi, "下午")
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    function formatLimitName(value) {
      const raw = String(value || "").trim();
      const known = {
        usage: "通用",
        weekly: "每周",
        session: "会话",
        "extra usage": "额外用量",
      };
      return known[raw.toLowerCase()] || raw;
    }

    function translate(value) {
      const original = String(value || "").trim();
      const text = original
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/[ \t]{2,}/g, " ");
      if (!text) return text;

      const greetingMatch = text.match(
        /^(?:Good\s+)?(Morning|Afternoon|Evening),\s*(.*)$/i,
      );
      if (greetingMatch) {
        const greeting = greetings[greetingMatch[1].toLowerCase()];
        return `${greeting}，${greetingMatch[2]}`;
      }

      const usageMatch = text.match(
        /^You(?:'|’)ve used\s*(\d+(?:\.\d+)?\s*%)\s*of\s+your\s*(.+?)\s+limit(?:\s*[·∙•]\s*Resets\s+(.+))?$/i,
      );
      if (usageMatch) {
        const percent = usageMatch[1].replace(/\s+/g, "");
        const limitName = formatLimitName(usageMatch[2]);
        const reset = usageMatch[3]
          ? ` · 将于 ${formatResetTime(usageMatch[3])} 重置`
          : "";
        const usagePrefix = /[\u3400-\u9fff]/u.test(limitName)
          ? `您已使用${limitName}额度的`
          : `您已使用 ${limitName} 额度的`;
        return `${usagePrefix} ${percent}${reset}`;
      }

      return original;
    }

    function translateSegments(values) {
      const original = values.map((value) => String(value || "")).join("");
      const translated = translate(original);
      return translated !== original.trim() ? translated : null;
    }

    return Object.freeze({ formatResetTime, translate, translateSegments });
  })();
  // END DYNAMIC_TRANSLATIONS

  const ClaudeUsageWidget = (() => {
    "use strict";

    const provider = isChatGPTSite ? "chatgpt" : "claude";
    const panelTitle =
      provider === "chatgpt" ? "ChatGPT 使用限制" : "Claude 用量监控";
    const positionStorageKey =
      provider === "chatgpt"
        ? "claude2cn-chatgpt-usage-position"
        : "claude-usage-position";

    let orgId = null;
    let autoRefreshTimer = null;
    let refreshInterval = null;
    let countdownTimer = null;
    let isHovered = false;
    let panel = null;
    let claudeShadow = null;
    let claudeWidgetState = "collapsed";
    let claudeAutoCollapseTimer = null;
    let claudeDocumentClickHandler = null;
    let claudeKeyHandler = null;
    let isDragging = false;
    let savedPosition = { left: null, right: 4, top: 50, isRight: true }; // 默认右上角

    const claudeSettingsStorageKey = "claude-usage-monitor:settings:v1";
    const defaultClaudeSettings = Object.freeze({
      autoCollapse: true,
      autoCollapseDelay: 4000,
      showResetTime: true,
      verticalPosition: "top",
      lastVisibleState: "collapsed",
    });
    let claudeSettings = { ...defaultClaudeSettings };

    let usageData = {
      provider,
      fiveHour: null,
      sevenDay: null,
      modelLimits: [],
      resetCredits: null,
      planName: "",
      lastFetch: null,
      fetchError: null,
    };

    const _origFetch = window.fetch.bind(window);

    function hookFetch() {
      window.fetch = function (...args) {
        const url =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof Request
              ? args[0].url
              : "";
        captureOrgId(url);
        return _origFetch(...args);
      };

      const _origXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (typeof url === "string") captureOrgId(url);
        return _origXHROpen.call(this, method, url, ...rest);
      };
    }

    function captureOrgId(url) {
      if (!url) return;
      const m = url.match(
        /\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      if (!m) return;
      const newId = m[1];
      if (orgId !== newId) {
        orgId = newId;
        console.log("[Claude用量] orgId 已获取:", orgId);
      }
      if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
      autoRefreshTimer = setTimeout(fetchUsage, 600);
    }

    async function discoverOrgId() {
      if (provider !== "claude") return true;
      if (orgId) return true;
      const candidates = [
        "https://claude.ai/api/bootstrap",
        // "https://claude.ai/api/organizations",
      ];
      for (const url of candidates) {
        try {
          const res = await _origFetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const str = JSON.stringify(data);
          const m = str.match(
            /"(?:uuid|id|organization_id)"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i,
          );
          if (m && !orgId) {
            orgId = m[1];
            console.log(`[Claude用量] 从 ${url} 获取 orgId`, orgId);
            return true;
          }
        } catch {}
      }
      return false;
    }

    function createPanel() {
      if (provider === "claude") return createClaudePanel();
      const metrics = getPanelMetrics();
      panel = document.createElement("div");
      panel.id = "claude-usage-panel-bottom";
      Object.assign(panel.style, {
        position: "fixed",
        top: "50px",
        right: metrics.defaultRight + "px",
        zIndex: "1000",
        background: "rgb(254, 252, 245)",
        border: "1px solid rgb(240, 235, 225)",
        borderRadius: metrics.borderRadius,
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "rgb(80, 75, 65)",
        padding: metrics.padding,
        width: "auto",
        minWidth: metrics.minWidth + "px",
        userSelect: "none",
        boxShadow: "none",
        cursor: "move",
        transition: "all 0.2s ease",
        touchAction: "none",
      });
      return panel;
    }

    function loadClaudeSettings() {
      try {
        const saved = JSON.parse(
          localStorage.getItem(claudeSettingsStorageKey) || "{}",
        );
        const delay = [2000, 4000, 8000].includes(saved.autoCollapseDelay)
          ? saved.autoCollapseDelay
          : defaultClaudeSettings.autoCollapseDelay;
        const verticalPosition = ["top", "center", "bottom"].includes(
          saved.verticalPosition,
        )
          ? saved.verticalPosition
          : defaultClaudeSettings.verticalPosition;
        const lastVisibleState = ["collapsed", "expanded"].includes(
          saved.lastVisibleState,
        )
          ? saved.lastVisibleState
          : defaultClaudeSettings.lastVisibleState;
        return {
          autoCollapse:
            typeof saved.autoCollapse === "boolean"
              ? saved.autoCollapse
              : defaultClaudeSettings.autoCollapse,
          autoCollapseDelay: delay,
          showResetTime:
            typeof saved.showResetTime === "boolean"
              ? saved.showResetTime
              : defaultClaudeSettings.showResetTime,
          verticalPosition,
          lastVisibleState,
        };
      } catch {
        return { ...defaultClaudeSettings };
      }
    }

    function saveClaudeSettings() {
      try {
        localStorage.setItem(
          claudeSettingsStorageKey,
          JSON.stringify(claudeSettings),
        );
      } catch {}
    }

    function claudeIcon(name) {
      // Tabler Icons 风格的内嵌线性图标；不依赖外部 CDN。
      const paths = {
        bolt: '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11"/>',
        boltFilled:
          '<path d="M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11" fill="currentColor" stroke="none"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
        calendar:
          '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
        sparkles:
          '<path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"/><path d="M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z"/><path d="M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z"/>',
        close: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
        refresh:
          '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
        settings:
          '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0 -2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0 -1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
      };
      return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
    }

    const claudeQuotaIcons = {
      fiveHour: "clock",
      sevenDay: "calendar",
      fableFive: "sparkles",
      model: "sparkles",
    };

    function createClaudePanel() {
      claudeSettings = loadClaudeSettings();
      // 窄视口（<900px）一律从收起态开始，避免展开卡遮挡正文。
      claudeWidgetState =
        window.innerWidth < 900 ? "collapsed" : claudeSettings.lastVisibleState;
      const host = document.createElement("div");
      host.id = "claude-usage-panel-bottom";
      host.setAttribute("data-claude-usage-widget", "v2");
      claudeShadow = host.attachShadow({ mode: "open" });
      claudeShadow.innerHTML = `
        <style>
          :host {
            --cu-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            --cu-bg: rgba(255, 255, 255, 0.96);
            --cu-bg-soft: rgba(32, 33, 36, 0.05);
            --cu-text: #1f2124;
            --cu-text-secondary: #6d7176;
            --cu-text-tertiary: #989ba1;
            --cu-border: rgba(32, 33, 36, 0.08);
            --cu-divider: rgba(32, 33, 36, 0.06);
            --cu-shadow: 0 18px 44px rgba(31, 35, 41, 0.13), 0 2px 8px rgba(31, 35, 41, 0.06);
            --cu-danger: #ef493d;
            --cu-transition: 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
            position: fixed;
            top: 96px;
            right: 12px;
            z-index: 2147483000;
            color: var(--cu-text);
            font-family: var(--cu-font);
            font-size: 13px;
            line-height: 1.4;
            color-scheme: light;
            user-select: none;
          }
          :host([data-theme="dark"]) {
            --cu-bg: rgba(38, 39, 42, 0.96);
            --cu-bg-soft: rgba(255, 255, 255, 0.065);
            --cu-text: #f2f3f5;
            --cu-text-secondary: #b5b8bd;
            --cu-text-tertiary: #8f9399;
            --cu-border: rgba(255, 255, 255, 0.10);
            --cu-divider: rgba(255, 255, 255, 0.07);
            --cu-shadow: 0 18px 48px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.30);
            color-scheme: dark;
          }
          *, *::before, *::after { box-sizing: border-box; }
          button, select, input { font: inherit; }
          button { color: inherit; }
          [hidden] { display: none !important; }
          svg { width: 18px; height: 18px; display: block; }
          .usage-widget { position: relative; display: flex; justify-content: flex-end; }
          /* 收起/展开互斥卡片：离场卡绝对定位叠在原地做淡出，在场卡撑起浮窗尺寸 */
          .compact-card, .expanded-card {
            transform-origin: top right;
            transition: opacity var(--cu-transition), transform var(--cu-transition), box-shadow var(--cu-transition), visibility 0s linear 0s;
          }
          .compact-card.is-off, .expanded-card.is-off {
            position: absolute;
            top: 0;
            right: 0;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: scale(0.96) translateY(-6px);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 200ms;
          }
          :host([data-anchor="bottom"]) .compact-card, :host([data-anchor="bottom"]) .expanded-card { transform-origin: bottom right; }
          :host([data-anchor="bottom"]) .compact-card.is-off, :host([data-anchor="bottom"]) .expanded-card.is-off {
            top: auto;
            bottom: 0;
            transform: scale(0.96) translateY(6px);
          }
          .compact-card {
            width: 104px;
            padding: 8px;
            display: grid;
            gap: 6px;
            border: 1px solid var(--cu-border);
            border-radius: 14px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(12px) saturate(1.05);
            -webkit-backdrop-filter: blur(12px) saturate(1.05);
            cursor: pointer;
          }
          .compact-card:hover { transform: translateY(-1px); }
          .compact-card:focus-visible, .icon-button:focus-visible, .setting-control:focus-visible, .reset-settings:focus-visible {
            outline: 2px solid #4285f4;
            outline-offset: 2px;
          }
          .compact-list { display: grid; gap: 6px; }
          .compact-row {
            min-height: 34px;
            padding: 0 10px;
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 8px;
            border-radius: 10px;
            background: var(--cu-bg-soft);
          }
          .compact-row[data-danger] { background: var(--quota-soft, var(--cu-bg-soft)); }
          .compact-label { color: var(--cu-text-secondary); font-size: 12px; font-weight: 500; }
          .compact-percent { color: var(--quota-color); font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; }
          .compact-status { min-height: 34px; display: grid; place-items: center; color: var(--cu-text-secondary); font-size: 12px; }
          .expanded-card {
            width: min(304px, calc(100vw - 24px));
            max-height: calc(100vh - 32px);
            display: flex;
            overflow: hidden;
            flex-direction: column;
            border: 1px solid var(--cu-border);
            border-radius: 18px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(12px) saturate(1.05);
            -webkit-backdrop-filter: blur(12px) saturate(1.05);
          }
          .widget-header {
            flex: 0 0 auto;
            min-height: 52px;
            padding: 0 12px 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--cu-divider);
            cursor: pointer;
          }
          .widget-title { display: flex; align-items: center; gap: 9px; font-size: 15px; font-weight: 600; }
          .title-badge {
            width: 22px;
            height: 22px;
            display: grid;
            place-items: center;
            border-radius: 7px;
            background: linear-gradient(135deg, #ff8a5c, #ff5f2e);
            color: #fff;
            box-shadow: 0 2px 6px rgba(255, 95, 46, 0.35);
          }
          .title-badge svg { width: 13px; height: 13px; }
          .icon-button {
            width: 32px;
            height: 32px;
            padding: 7px;
            display: grid;
            place-items: center;
            border: 0;
            border-radius: 9px;
            background: transparent;
            color: var(--cu-text-secondary);
            cursor: pointer;
          }
          .icon-button:hover { background: var(--cu-bg-soft); color: var(--cu-text); }
          .quota-list { flex: 1 1 auto; overflow-y: auto; padding: 4px 0 5px; }
          .quota-item { padding: 13px 16px 14px; }
          .quota-meta {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            column-gap: 10px;
            margin-bottom: 10px;
          }
          .quota-icon {
            width: 26px;
            height: 26px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            background: var(--quota-soft);
            background: color-mix(in srgb, var(--quota-color) 13%, transparent);
            color: var(--quota-color);
          }
          :host([data-theme="dark"]) .quota-icon { background: var(--quota-soft); background: color-mix(in srgb, var(--quota-color) 22%, transparent); }
          .quota-icon svg { width: 15px; height: 15px; stroke-width: 2; }
          .quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--cu-text); font-size: 13px; font-weight: 550; }
          .quota-remaining { color: var(--cu-text-tertiary); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .quota-value-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 14px; }
          .quota-track {
            height: 7px;
            overflow: hidden;
            border-radius: 999px;
            background: var(--quota-soft);
            background: color-mix(in srgb, var(--quota-color) 15%, transparent);
          }
          :host([data-theme="dark"]) .quota-track { background: var(--quota-soft); background: color-mix(in srgb, var(--quota-color) 24%, transparent); }
          .quota-fill { width: var(--remaining-percent); height: 100%; border-radius: inherit; background: var(--quota-color); transition: width 300ms ease; }
          .quota-percent { min-width: 58px; text-align: right; color: var(--quota-color); font-size: 25px; line-height: 1; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
          .expanded-status { min-height: 132px; display: grid; place-items: center; padding: 24px; color: var(--cu-text-secondary); text-align: center; }
          .widget-footer {
            flex: 0 0 auto;
            min-height: 50px;
            padding: 0 12px 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-top: 1px solid var(--cu-divider);
            color: var(--cu-text-secondary);
          }
          .reset-time { min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap; }
          .reset-time svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--cu-text-tertiary); }
          .reset-time time { font-variant-numeric: tabular-nums; color: var(--cu-text-secondary); }
          .settings-popover {
            position: absolute;
            top: 60px;
            right: 12px;
            z-index: 2;
            width: 256px;
            padding: 14px;
            border: 1px solid var(--cu-border);
            border-radius: 14px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            backdrop-filter: blur(14px) saturate(1.05);
            -webkit-backdrop-filter: blur(14px) saturate(1.05);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 0s;
          }
          .settings-popover.is-off {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-4px) scale(0.98);
            transition: opacity var(--cu-transition), transform var(--cu-transition), visibility 0s linear 200ms;
          }
          .settings-title { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
          .setting-row { min-height: 38px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; color: var(--cu-text-secondary); font-size: 12px; }
          .setting-control { min-width: 76px; accent-color: #4285f4; }
          .setting-row select { padding: 4px 7px; border: 1px solid var(--cu-border); border-radius: 7px; background: var(--cu-bg-soft); color: var(--cu-text); }
          .reset-settings { width: 100%; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--cu-border); border-radius: 9px; background: var(--cu-bg-soft); color: var(--cu-text-secondary); cursor: pointer; }
          .usage-tooltip {
            position: absolute;
            right: calc(100% + 8px);
            z-index: 3;
            width: max-content;
            max-width: 250px;
            padding: 8px 10px;
            border: 1px solid var(--cu-border);
            border-radius: 9px;
            background: var(--cu-bg);
            box-shadow: var(--cu-shadow);
            color: var(--cu-text-secondary);
            font-size: 11px;
            line-height: 1.55;
            pointer-events: none;
            white-space: normal;
          }
          @media (max-width: 640px) { :host { display: none; } }
          @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; } }
        </style>
        <div class="usage-widget" data-state="collapsed">
          <button class="compact-card" type="button" data-action="expand" aria-label="展开 Claude 用量详情">
            <span class="compact-list"></span>
            <span class="compact-status">正在获取额度…</span>
          </button>
          <section class="expanded-card is-off" aria-label="Claude 用量详情">
            <header class="widget-header" data-action="collapse" title="点击空白区域收起">
              <div class="widget-title"><span class="title-badge">${claudeIcon("boltFilled")}</span><span>Claude 用量</span></div>
              <button class="icon-button" type="button" data-action="hide" aria-label="关闭用量浮窗">${claudeIcon("close")}</button>
            </header>
            <div class="quota-list"></div>
            <div class="expanded-status">正在获取额度…</div>
            <footer class="widget-footer">
              <span class="reset-time">${claudeIcon("refresh")}<span>重置时间：</span><time>--/-- -- --:--</time></span>
              <button class="icon-button" type="button" data-action="settings" aria-label="用量浮窗设置">${claudeIcon("settings")}</button>
            </footer>
            <div class="settings-popover is-off">
              <h3 class="settings-title">浮窗设置</h3>
              <label class="setting-row"><span>自动收起</span><input class="setting-control" data-setting="autoCollapse" type="checkbox"></label>
              <label class="setting-row"><span>收起延迟</span><select class="setting-control" data-setting="autoCollapseDelay"><option value="2000">2 秒</option><option value="4000">4 秒</option><option value="8000">8 秒</option></select></label>
              <label class="setting-row"><span>显示重置时间</span><input class="setting-control" data-setting="showResetTime" type="checkbox"></label>
              <label class="setting-row"><span>垂直位置</span><select class="setting-control" data-setting="verticalPosition"><option value="top">顶部</option><option value="center">居中</option><option value="bottom">底部</option></select></label>
              <button class="reset-settings" type="button" data-action="reset-settings">恢复默认设置</button>
            </div>
          </section>
          <div class="usage-tooltip" role="tooltip" hidden></div>
        </div>`;
      panel = host;
      bindClaudePanelEvents(host);
      applyClaudePosition(host);
      setClaudeWidgetState(claudeWidgetState, false);
      return host;
    }

    function applyClaudePosition(host = panel) {
      if (!host) return;
      host.style.left = "auto";
      host.style.right = "12px";
      host.style.top = "auto";
      host.style.bottom = "auto";
      host.style.transform = "none";
      // data-anchor 决定离场卡片的对齐边与缩放方向（底部锚定时向上展开）。
      host.setAttribute("data-anchor", claudeSettings.verticalPosition === "bottom" ? "bottom" : "top");
      if (claudeSettings.verticalPosition === "center") {
        host.style.top = "50%";
        host.style.transform = "translateY(-50%)";
      } else if (claudeSettings.verticalPosition === "bottom") {
        host.style.bottom = "24px";
      } else {
        host.style.top = "96px";
      }
    }

    function clearClaudeAutoCollapse() {
      if (claudeAutoCollapseTimer) clearTimeout(claudeAutoCollapseTimer);
      claudeAutoCollapseTimer = null;
    }

    function scheduleClaudeAutoCollapse() {
      clearClaudeAutoCollapse();
      if (
        !claudeSettings.autoCollapse ||
        claudeWidgetState !== "expanded"
      )
        return;
      claudeAutoCollapseTimer = setTimeout(
        () => setClaudeWidgetState("collapsed"),
        claudeSettings.autoCollapseDelay,
      );
    }

    function setClaudeWidgetState(nextState, persist = true) {
      if (!claudeShadow || !panel) return;
      const allowed = ["collapsed", "expanded", "settings", "hidden"];
      const next = allowed.includes(nextState) ? nextState : "collapsed";
      claudeWidgetState = next;
      clearClaudeAutoCollapse();

      const widget = claudeShadow.querySelector(".usage-widget");
      const compact = claudeShadow.querySelector(".compact-card");
      const expanded = claudeShadow.querySelector(".expanded-card");
      const settings = claudeShadow.querySelector(".settings-popover");
      widget.dataset.state = next;
      panel.style.display = next === "hidden" ? "none" : "";
      // is-off 通过 opacity/transform/visibility 过渡离场，替代 hidden 的瞬间切换。
      compact.classList.toggle("is-off", next !== "collapsed");
      expanded.classList.toggle("is-off", !["expanded", "settings"].includes(next));
      settings.classList.toggle("is-off", next !== "settings");

      if (["collapsed", "expanded"].includes(next)) {
        claudeSettings.lastVisibleState = next;
      } else if (next === "settings") {
        claudeSettings.lastVisibleState = "expanded";
      }
      if (persist) saveClaudeSettings();
    }

    function updateClaudeSettingsControls() {
      if (!claudeShadow) return;
      claudeShadow.querySelector('[data-setting="autoCollapse"]').checked =
        claudeSettings.autoCollapse;
      claudeShadow.querySelector(
        '[data-setting="autoCollapseDelay"]',
      ).value = String(claudeSettings.autoCollapseDelay);
      claudeShadow.querySelector('[data-setting="showResetTime"]').checked =
        claudeSettings.showResetTime;
      claudeShadow.querySelector(
        '[data-setting="verticalPosition"]',
      ).value = claudeSettings.verticalPosition;
    }

    function registerClaudeMenuCommands() {
      const register =
        typeof globalThis.GM_registerMenuCommand === "function"
          ? globalThis.GM_registerMenuCommand
          : typeof globalThis.GM?.registerMenuCommand === "function"
            ? globalThis.GM.registerMenuCommand.bind(globalThis.GM)
            : null;
      if (!register) return;
      register("显示 Claude 用量监控", () =>
        setClaudeWidgetState("collapsed"),
      );
      register("隐藏 Claude 用量监控", () =>
        setClaudeWidgetState("hidden"),
      );
      register("恢复用量浮窗默认设置", () => {
        claudeSettings = { ...defaultClaudeSettings };
        saveClaudeSettings();
        applyClaudePosition();
        updateClaudeSettingsControls();
        setClaudeWidgetState("collapsed");
        renderClaudePanel();
      });
    }

    function bindClaudePanelEvents(host) {
      const compact = claudeShadow.querySelector('[data-action="expand"]');
      const header = claudeShadow.querySelector(".widget-header");
      compact.addEventListener("mouseenter", () =>
        setClaudeWidgetState("expanded"),
      );
      compact.addEventListener("click", () =>
        setClaudeWidgetState("expanded"),
      );
      header.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        setClaudeWidgetState("collapsed");
      });
      claudeShadow
        .querySelector('[data-action="hide"]')
        .addEventListener("click", () => setClaudeWidgetState("hidden"));
      claudeShadow
        .querySelector('[data-action="settings"]')
        .addEventListener("click", () => setClaudeWidgetState("settings"));
      claudeShadow
        .querySelector('[data-action="reset-settings"]')
        .addEventListener("click", () => {
          claudeSettings = { ...defaultClaudeSettings };
          saveClaudeSettings();
          applyClaudePosition(host);
          updateClaudeSettingsControls();
          setClaudeWidgetState("expanded");
          renderClaudePanel();
        });

      claudeShadow
        .querySelector('[data-setting="autoCollapse"]')
        .addEventListener("change", (event) => {
          claudeSettings.autoCollapse = event.target.checked;
          saveClaudeSettings();
        });
      claudeShadow
        .querySelector('[data-setting="autoCollapseDelay"]')
        .addEventListener("change", (event) => {
          claudeSettings.autoCollapseDelay = Number(event.target.value);
          saveClaudeSettings();
        });
      claudeShadow
        .querySelector('[data-setting="showResetTime"]')
        .addEventListener("change", (event) => {
          claudeSettings.showResetTime = event.target.checked;
          saveClaudeSettings();
          renderClaudePanel();
        });
      claudeShadow
        .querySelector('[data-setting="verticalPosition"]')
        .addEventListener("change", (event) => {
          claudeSettings.verticalPosition = event.target.value;
          saveClaudeSettings();
          applyClaudePosition(host);
        });

      host.addEventListener("mouseenter", clearClaudeAutoCollapse);
      host.addEventListener("mouseleave", scheduleClaudeAutoCollapse);
      claudeDocumentClickHandler = (event) => {
        if (claudeWidgetState === "hidden" || host.contains(event.target)) return;
        if (claudeWidgetState === "settings") {
          setClaudeWidgetState("expanded");
        } else if (claudeWidgetState === "expanded") {
          setClaudeWidgetState("collapsed");
        }
      };
      claudeKeyHandler = (event) => {
        if (event.altKey && event.shiftKey && event.key.toLowerCase() === "u") {
          setClaudeWidgetState("collapsed");
          return;
        }
        if (event.key !== "Escape") return;
        if (claudeWidgetState === "settings") {
          setClaudeWidgetState("expanded");
        } else if (claudeWidgetState === "expanded") {
          setClaudeWidgetState("collapsed");
        }
      };
      document.addEventListener("click", claudeDocumentClickHandler);
      document.addEventListener("keydown", claudeKeyHandler);
      updateClaudeSettingsControls();
      registerClaudeMenuCommands();
    }

    function getClaudeViewRows() {
      return getUsageRows()
        .filter(
          (row) =>
            row.key === "primary" ||
            row.key === "secondary" ||
            /^Fable 5$/i.test(row.title || ""),
        )
        .map((row) => {
          const used = pct(row.utilization);
          const remaining = 100 - used;
          const isFable = /^Fable 5$/i.test(row.title || "");
          const type =
            row.key === "primary"
              ? "fiveHour"
              : row.key === "secondary"
                ? "sevenDay"
                : isFable
                  ? "fableFive"
                  : "model";
          const shortLabel =
            type === "fiveHour"
              ? "5h"
              : type === "sevenDay"
                ? "7d"
                : type === "fableFive"
                  ? "F5"
                  : row.short;
          const fullLabel =
            type === "fiveHour"
              ? "5 小时窗口"
              : type === "sevenDay"
                ? "7 天配额"
                : type === "fableFive"
                  ? "Fable 5 · 7 天配额"
                  : row.label;
          const baseColors = {
            fiveHour: ["#ff6b3d", "rgba(255, 107, 61, 0.10)"],
            sevenDay: ["#18b96b", "rgba(24, 185, 107, 0.10)"],
            fableFive: ["#4285f4", "rgba(66, 133, 244, 0.10)"],
            model: ["#4285f4", "rgba(66, 133, 244, 0.10)"],
          };
          const [baseColor, baseSoft] = baseColors[type];
          const isDanger = remaining <= 20;
          const countdown = cdText(row.resets_at);
          return {
            ...row,
            type,
            shortLabel,
            fullLabel,
            remaining,
            critical: remaining <= 10,
            remainingText: countdown ? `${countdown} 剩余` : "剩余时间待定",
            resetText: fmtExpiryTime(row.resets_at),
            color: isDanger ? "#ef493d" : baseColor,
            softColor: isDanger ? "rgba(239, 73, 61, 0.10)" : baseSoft,
          };
        });
    }

    function showClaudeTooltip(element) {
      const tooltip = claudeShadow?.querySelector(".usage-tooltip");
      if (!tooltip || !element?.dataset.tooltip) return;
      tooltip.textContent = element.dataset.tooltip;
      tooltip.style.top = `${element.offsetTop}px`;
      tooltip.hidden = false;
    }

    function hideClaudeTooltip() {
      const tooltip = claudeShadow?.querySelector(".usage-tooltip");
      if (tooltip) tooltip.hidden = true;
    }

    function updateClaudeQuotaNodes(rows) {
      const compactList = claudeShadow.querySelector(".compact-list");
      const quotaList = claudeShadow.querySelector(".quota-list");
      const activeKeys = new Set(rows.map((row) => row.key));
      for (const element of [
        ...compactList.querySelectorAll("[data-quota-key]"),
        ...quotaList.querySelectorAll("[data-quota-key]"),
      ]) {
        if (!activeKeys.has(element.dataset.quotaKey)) element.remove();
      }

      for (const row of rows) {
        let compactRow = compactList.querySelector(
          `[data-quota-key="${row.key}"]`,
        );
        if (!compactRow) {
          compactRow = document.createElement("span");
          compactRow.className = "compact-row";
          compactRow.dataset.quotaKey = row.key;
          compactRow.innerHTML =
            '<span class="compact-label"></span><strong class="compact-percent"></strong>';
          compactRow.addEventListener("mouseenter", () =>
            showClaudeTooltip(compactRow),
          );
          compactRow.addEventListener("mouseleave", hideClaudeTooltip);
          compactList.appendChild(compactRow);
        }
        compactRow.style.setProperty("--quota-color", row.color);
        compactRow.style.setProperty("--quota-soft", row.softColor);
        compactRow.toggleAttribute("data-danger", row.critical);
        compactRow.querySelector(".compact-label").textContent = row.shortLabel;
        compactRow.querySelector(".compact-percent").textContent =
          `${row.remaining}%`;
        compactRow.dataset.tooltip = `${row.fullLabel} · ${row.remainingText} · ${row.resetText} 重置`;
        compactRow.title = compactRow.dataset.tooltip;
        compactList.appendChild(compactRow);

        let quotaItem = quotaList.querySelector(
          `[data-quota-key="${row.key}"]`,
        );
        if (!quotaItem) {
          quotaItem = document.createElement("article");
          quotaItem.className = "quota-item";
          quotaItem.dataset.quotaKey = row.key;
          quotaItem.innerHTML = `
            <div class="quota-meta"><span class="quota-icon" aria-hidden="true">${claudeIcon(claudeQuotaIcons[row.type] || "sparkles")}</span><span class="quota-name"></span><span class="quota-remaining"></span></div>
            <div class="quota-value-row"><div class="quota-track" aria-hidden="true"><div class="quota-fill"></div></div><strong class="quota-percent"></strong></div>`;
          quotaList.appendChild(quotaItem);
        }
        quotaItem.style.setProperty("--quota-color", row.color);
        quotaItem.style.setProperty("--quota-soft", row.softColor);
        quotaItem.style.setProperty(
          "--remaining-percent",
          `${row.remaining}%`,
        );
        quotaItem.setAttribute(
          "aria-label",
          `${row.fullLabel}剩余 ${row.remaining}%`,
        );
        quotaItem.querySelector(".quota-name").textContent = row.fullLabel;
        quotaItem.querySelector(".quota-remaining").textContent =
          row.remainingText;
        quotaItem.querySelector(".quota-percent").textContent =
          `${row.remaining}%`;
        quotaList.appendChild(quotaItem);
      }
    }

    function renderClaudePanel() {
      if (!claudeShadow || !panel) return;
      const rows = getClaudeViewRows();
      const compactList = claudeShadow.querySelector(".compact-list");
      const compactStatus = claudeShadow.querySelector(".compact-status");
      const quotaList = claudeShadow.querySelector(".quota-list");
      const expandedStatus = claudeShadow.querySelector(".expanded-status");
      const statusText = usageData.fetchError
        ? usageData.fetchError
        : "正在获取额度…";

      if (rows.length) {
        updateClaudeQuotaNodes(rows);
        compactList.hidden = false;
        compactStatus.hidden = true;
        quotaList.hidden = false;
        expandedStatus.hidden = true;
      } else {
        compactList.hidden = true;
        compactStatus.hidden = false;
        compactStatus.textContent = usageData.fetchError ? "获取失败" : "正在获取…";
        compactStatus.title = statusText;
        quotaList.hidden = true;
        expandedStatus.hidden = false;
        expandedStatus.textContent = statusText;
      }

      const resetAt =
        usageData.sevenDay?.resets_at ??
        usageData.fiveHour?.resets_at ??
        rows[0]?.resets_at ??
        null;
      const resetTime = claudeShadow.querySelector(".reset-time");
      resetTime.hidden = !claudeSettings.showResetTime;
      resetTime.querySelector("time").textContent = fmtExpiryTime(resetAt);
      updateClaudeSettingsControls();
      applyClaudePosition();
    }

    function applyTheme() {
      if (!panel) return;
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (provider === "claude") {
        panel.setAttribute("data-theme", isDark ? "dark" : "light");
        return;
      }

      if (isDark) {
        Object.assign(panel.style, {
          background: "rgb(40, 38, 35)",
          borderColor: "rgb(60, 55, 50)",
          color: "rgb(200, 195, 185)",
        });
      } else {
        Object.assign(panel.style, {
          background: "rgb(254, 252, 245)",
          borderColor: "rgb(240, 235, 225)",
          color: "rgb(80, 75, 65)",
        });
      }
    }

    function pct(v) {
      return Math.min(100, Math.max(0, Math.round(v || 0)));
    }

    function clr(p) {
      return p < 60 ? "#10b981" : p < 85 ? "#f59e0b" : "#ef4444";
    }

    function clrDark(p) {
      return p < 60 ? "#34d399" : p < 85 ? "#fbbf24" : "#f87171";
    }

    function cdText(ts) {
      const target = UsageParsers.toTimestampMs(ts);
      if (target === null) return "";
      const diff = target - Date.now();
      if (diff <= 0) return "已重置";
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function fmtTime(ts) {
      const timestamp = UsageParsers.toTimestampMs(ts);
      if (timestamp === null) return "—";
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) return "—";
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    function fmtExpiryTime(ts) {
      const timestamp = UsageParsers.toTimestampMs(ts);
      if (timestamp === null) return "暂无到期时间";
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return "暂无到期时间";
      const pad = (value) => String(value).padStart(2, "0");
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${weekdays[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(
        /[&<>'"]/g,
        (char) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
          })[char],
      );
    }

    function durationLabels(window, fallbackLabel, fallbackShort) {
      const minutes = Number(window?.window_minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { label: fallbackLabel, short: fallbackShort };
      }
      if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return { label: `${days}天配额`, short: `${days}d` };
      }
      if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return { label: `${hours}小时窗口`, short: `${hours}h` };
      }
      return { label: `${Math.round(minutes)}分钟窗口`, short: `${Math.round(minutes)}m` };
    }

    function compactDurationLabel(label) {
      return String(label || "").replace(/(?:配额|窗口)$/u, "");
    }

    function formatPlanName(value) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");
      const knownPlans = {
        free: "Free",
        plus: "Plus",
        pro: "Pro",
        prolite: "Pro Lite",
        team: "Team",
        business: "Business",
        enterprise: "Enterprise",
        edu: "Edu",
      };
      if (knownPlans[normalized]) return knownPlans[normalized];
      return raw
        .replace(/[_-]+/g, " ")
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }

    function splitLegacyModelName(item) {
      const explicitName = String(item?.modelName || "").trim();
      const explicitWindow = String(item?.windowLabel || "").trim();
      if (explicitName) {
        return { modelName: explicitName, windowLabel: explicitWindow };
      }
      const legacyName = String(item?.name || "模型").trim();
      const match = legacyName.match(/^(.*?)\s*·\s*(主窗口|次窗口)$/u);
      return match
        ? { modelName: match[1] || "模型", windowLabel: match[2] }
        : { modelName: legacyName || "模型", windowLabel: explicitWindow };
    }

    function getUsageRows() {
      const rows = [];
      if (usageData.fiveHour) {
        const labels = durationLabels(
          usageData.fiveHour,
          "5小时窗口",
          "5h",
        );
        const chatGPTTitle = "每周使用限额";
        rows.push({
          key: "primary",
          icon: "⚡",
          ...labels,
          title: provider === "chatgpt" ? chatGPTTitle : labels.label,
          meta:
            provider === "chatgpt" ? compactDurationLabel(labels.label) : "",
          label:
            provider === "chatgpt"
              ? `${chatGPTTitle} · ${compactDurationLabel(labels.label)}`
              : labels.label,
          short: labels.short,
          ...usageData.fiveHour,
        });
      }
      if (usageData.sevenDay) {
        const labels = durationLabels(
          usageData.sevenDay,
          "7天配额",
          "7d",
        );
        const chatGPTTitle = "每周使用限额";
        rows.push({
          key: "secondary",
          icon: "📅",
          ...labels,
          title: provider === "chatgpt" ? chatGPTTitle : labels.label,
          meta:
            provider === "chatgpt" ? compactDurationLabel(labels.label) : "",
          label:
            provider === "chatgpt"
              ? `${chatGPTTitle} · ${compactDurationLabel(labels.label)}`
              : labels.label,
          short: labels.short,
          ...usageData.sevenDay,
        });
      }
      usageData.modelLimits.forEach((item, index) => {
        const labels = durationLabels(item, "模型配额", "模型");
        const { modelName, windowLabel } = splitLegacyModelName(item);
        const rowTitle = modelName;
        const meta = [windowLabel, compactDurationLabel(labels.label)]
          .filter(Boolean)
          .join(" · ");
        rows.push({
          key: `model-${index}`,
          icon: "🧠",
          kind: "model",
          title: rowTitle,
          meta,
          label: [rowTitle, meta].filter(Boolean).join(" · "),
          short: /^Fable 5$/i.test(modelName)
            ? "Fable"
            : modelName.slice(0, 8),
          ...item,
        });
      });
      return rows;
    }

    function isMobileLayout() {
      return window.innerWidth <= 768;
    }

    function getPanelMetrics() {
      const expandedWidth = provider === "chatgpt" ? 228 : 200;
      if (isMobileLayout()) {
        return {
          defaultRight: null,
          collapsedWidth: 32,
          expandedWidth: Math.min(expandedWidth, window.innerWidth - 16),
          minWidth: 32,
          padding: "3px 2px",
          borderRadius: "4px",
        };
      }
      return {
        defaultRight: 8,
        collapsedWidth: 56,
        expandedWidth,
        minWidth: 56,
        padding: "8px 10px",
        borderRadius: "6px",
      };
    }

    function getMobileAnchorPosition() {
      return {
        left: Math.round(window.innerWidth * 0.64),
        top: 4,
      };
    }

    function renderPanel() {
      if (
        !document.body ||
        !panel ||
        !document.getElementById("claude-usage-panel-bottom")
      )
        return;
      if (provider === "claude") {
        applyTheme();
        renderClaudePanel();
        startCountdown();
        return;
      }
      applyTheme();

      if ((provider === "claude" && !orgId) || (!usageData.lastFetch && !usageData.fetchError)) {
        panel.title = `${panelTitle}：正在获取`;
        panel.innerHTML = `
        <div style="font-size:10px;opacity:0.6;text-align:center;">
          ⏳
        </div>`;
        return;
      }

      if (usageData.fetchError) {
        panel.title = usageData.fetchError;
        panel.innerHTML = `
        <div style="font-size:12px;opacity:0.7;text-align:center;">⚠️</div>`;
        return;
      }

      panel.title = panelTitle;
      const rows = getUsageRows();
      if (!rows.length) {
        panel.innerHTML = `<div style="font-size:10px;opacity:0.6;text-align:center;">暂无额度</div>`;
        return;
      }

      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isMobile = isMobileLayout();

      const textMuted = isDark
        ? "rgba(200, 195, 185, 0.6)"
        : "rgba(80, 75, 65, 0.6)";
      const dividerColor = isDark
        ? "rgba(200, 195, 185, 0.16)"
        : "rgba(80, 75, 65, 0.14)";
      const badgeBackground = isDark
        ? "rgba(255, 255, 255, 0.04)"
        : "rgba(80, 75, 65, 0.04)";
      const metrics = getPanelMetrics();

      // 判断面板是否靠近右侧
      const rect = panel.getBoundingClientRect();
      const isNearRight =
        savedPosition.isRight !== null
          ? savedPosition.isRight
          : rect.left > window.innerWidth / 2;

      // 使用保存的位置或当前位置
      let currentLeft, currentRight;
      if (isNearRight) {
        currentRight =
          savedPosition.right !== null
            ? savedPosition.right
            : window.innerWidth - rect.right;
      } else {
        currentLeft =
          savedPosition.left !== null ? savedPosition.left : rect.left;
      }
      const currentTop =
        savedPosition.top !== null ? savedPosition.top : rect.top;

      if (isHovered) {
        const expandedWidth = metrics.expandedWidth;

        panel.style.top = currentTop + "px";
        panel.style.bottom = "auto";
        panel.style.padding = metrics.padding;
        panel.style.borderRadius = metrics.borderRadius;

        if (isNearRight) {
          // 靠右时向左展开，保持右边缘不变
          panel.style.right = Math.max(0, currentRight) + "px";
          panel.style.left = "auto";
        } else {
          // 靠左时向右展开，保持左边缘不变
          const maxLeft = Math.max(0, window.innerWidth - expandedWidth);
          panel.style.left = Math.max(0, Math.min(currentLeft, maxLeft)) + "px";
          panel.style.right = "auto";
        }

        panel.style.width = expandedWidth + "px";
        panel.style.minWidth = expandedWidth + "px";

        const planName = formatPlanName(usageData.planName);
        const plan = planName
          ? `<div style="font-size:8px;color:${textMuted};margin-top:3px;letter-spacing:0.02em;">${escapeHtml(planName)}</div>`
          : "";
        const expandedRows = rows
          .map((row, index) => {
            const used = pct(row.utilization);
            const remain = 100 - used;
            const color = isDark ? clrDark(used) : clr(used);
            const rowTitle = row.title || row.label;
            const rowHeading = row.meta
              ? `<div data-usage-heading="${row.kind === "model" ? "model" : "quota"}" title="${escapeHtml(row.label)}" style="display:flex;align-items:center;gap:5px;min-width:0;margin-bottom:5px;">
                  <div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto;">
                    <span aria-hidden="true" style="flex:0 0 auto;">${row.icon}</span>
                    <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;font-weight:600;opacity:0.72;">${escapeHtml(rowTitle)}</span>
                  </div>
                  <span style="flex:0 0 auto;max-width:48%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:7px;line-height:1.45;color:${textMuted};background:${badgeBackground};border:1px solid ${dividerColor};border-radius:999px;padding:1px 5px;">${escapeHtml(row.meta)}</span>
                </div>`
              : `<div style="font-size:9px;color:${textMuted};margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(row.label)}">${row.icon} ${escapeHtml(rowTitle)}</div>`;
            const rowDivider = index
              ? `border-top:1px solid ${dividerColor};margin-top:8px;padding-top:8px;`
              : "";
            return `
          <div data-usage-row="${escapeHtml(row.key)}" style="${rowDivider}">
            ${rowHeading}
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
              <span style="font-size:11px;opacity:0.7;">剩余</span>
              <span style="font-size:16px;font-weight:600;color:${color};">${remain}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:8px;opacity:0.6;">
              <span>已用 ${used}%</span>
              <span>${fmtTime(row.resets_at)}</span>
            </div>
            <div data-usage-countdown="${index}" style="font-size:8px;color:${color};margin-top:2px;text-align:right;">${cdText(row.resets_at)}</div>
          </div>`;
          })
          .join("");
        const resetCredits = usageData.resetCredits;
        const resetCreditsExpanded =
          provider === "chatgpt" && resetCredits
            ? `<div data-reset-credit-summary style="border-top:1px solid ${dividerColor};margin-top:8px;padding-top:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <span style="font-size:9px;font-weight:600;opacity:0.72;">重置卡</span>
                  <span style="font-size:8px;color:${textMuted};background:${badgeBackground};border:1px solid ${dividerColor};border-radius:999px;padding:1px 6px;white-space:nowrap;">${resetCredits.availableCount} 次可用</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:8px;color:${textMuted};">
                  <span>最近到期</span>
                  <span style="text-align:right;white-space:nowrap;">${escapeHtml(fmtExpiryTime(resetCredits.nearestExpiresAt))}</span>
                </div>
              </div>`
            : "";

        panel.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:0;">
          <div style="font-size:11px;font-weight:600;opacity:0.8;text-align:center;border-bottom:1px solid ${textMuted};padding-bottom:6px;margin-bottom:10px;">${escapeHtml(panelTitle)}${plan}</div>
          ${expandedRows}
          ${resetCreditsExpanded}
        </div>
      `;
      } else {
        const collapsedWidth = metrics.collapsedWidth;
        panel.style.padding = metrics.padding;
        panel.style.borderRadius = metrics.borderRadius;
        panel.style.top = currentTop + "px";
        panel.style.bottom = "auto";

        if (isNearRight) {
          // 靠右时保持右对齐收起
          panel.style.right = Math.max(0, currentRight) + "px";
          panel.style.left = "auto";
        } else {
          // 靠左时保持左对齐收起
          const maxLeft = Math.max(0, window.innerWidth - collapsedWidth);
          panel.style.left = Math.max(0, Math.min(currentLeft, maxLeft)) + "px";
          panel.style.right = "auto";
        }

        panel.style.width = collapsedWidth + "px";
        panel.style.minWidth = collapsedWidth + "px";

        const collapsedRows = rows
          .map((row, index) => {
            const used = pct(row.utilization);
            const remain = 100 - used;
            const color = isDark ? clrDark(used) : clr(used);
            const divider =
              index === rows.length - 1
                ? ""
                : `<div style="width:${isMobile ? 14 : 30}px;height:1px;background:${textMuted};opacity:0.3;"></div>`;
            return `
          <div style="text-align:center;">
            <div style="font-size:${isMobile ? 7 : 8}px;color:${textMuted};margin-bottom:2px;max-width:${collapsedWidth - 4}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.short)}</div>
            <div style="font-size:${isMobile ? 11 : 16}px;font-weight:600;color:${color};line-height:1.05;">${remain}%</div>
            ${isMobile ? "" : `<div data-usage-countdown="${index}" style="font-size:8px;color:${textMuted};margin-top:2px;">${cdText(row.resets_at)}</div>`}
          </div>
          ${divider}`;
          })
          .join("");
        panel.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:${isMobile ? 2 : 8}px;align-items:center;">
          ${collapsedRows}
        </div>
      `;
      }

      startCountdown();
    }

    function startCountdown() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        if (provider === "claude") {
          renderClaudePanel();
          return;
        }
        const rows = getUsageRows();
        panel
          ?.querySelectorAll("[data-usage-countdown]")
          .forEach((element) => {
            const index = Number(element.getAttribute("data-usage-countdown"));
            element.textContent = cdText(rows[index]?.resets_at);
          });
      }, 30000);
    }

    async function fetchUsage() {
      usageData.fetchError = null;
      renderPanel();
      try {
        const snapshot =
          provider === "chatgpt"
            ? await fetchChatGPTUsage()
            : await fetchClaudeUsage();
        if (!snapshot?.hit) throw new Error("接口未返回可识别的额度窗口");
        usageData.fiveHour = snapshot.fiveHour;
        usageData.sevenDay = snapshot.sevenDay;
        usageData.modelLimits = snapshot.modelLimits;
        usageData.resetCredits = snapshot.resetCredits ?? null;
        usageData.planName = snapshot.planName;
        usageData.lastFetch = Date.now();
        usageData.fetchError = null;
      } catch (error) {
        const prefix = provider === "chatgpt" ? "ChatGPT/Codex" : "Claude";
        const message = error instanceof Error ? error.message : String(error);
        usageData.fetchError = `${prefix} 用量获取失败：${message}`;
        console.warn(`[${prefix}用量]`, error);
      }
      renderPanel();
    }

    async function fetchClaudeUsage() {
      if (!orgId) {
        await discoverOrgId();
        if (!orgId) throw new Error("未找到组织 ID，请刷新 Claude 页面");
      }
      const endpoints = [
        `https://claude.ai/api/organizations/${orgId}/usage`,
        `https://claude.ai/api/organizations/${orgId}/rate_limit_status`,
        `https://claude.ai/api/organizations/${orgId}/limits`,
      ];
      let merged = null;
      let lastError = null;
      for (const url of endpoints) {
        try {
          const res = await _origFetch(url, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          if (res.status === 404) continue;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const parsed = UsageParsers.parseClaude(data);
          if (parsed.hit) merged = UsageParsers.merge(merged, parsed);
          // 新版 /usage 已携带 limits[]，无需再重复请求旧的回退接口。
          if (url.endsWith("/usage") && parsed.hasScopedSurface) break;
        } catch (error) {
          lastError = error;
          console.warn("[Claude用量] 接口失败:", url, error.message);
        }
      }
      if (merged?.hit) return merged;
      throw lastError ?? new Error("所有用量接口均不可用");
    }

    function decodeJwtPayload(token) {
      try {
        const encoded = token.split(".")[1];
        if (!encoded) return {};
        const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(
          normalized.length + ((4 - (normalized.length % 4)) % 4),
          "=",
        );
        return JSON.parse(atob(padded));
      } catch {
        return {};
      }
    }

    function findChatGPTAccountId(session, accessToken) {
      const claims = decodeJwtPayload(accessToken);
      const authClaims = claims["https://api.openai.com/auth"] ?? {};
      return (
        session.account?.id ??
        session.accountId ??
        session.account_id ??
        session.user?.accountId ??
        session.user?.account_id ??
        authClaims.chatgpt_account_id ??
        claims.chatgpt_account_id ??
        ""
      );
    }

    async function fetchChatGPTSession() {
      const response = await _origFetch("https://chatgpt.com/api/auth/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`登录状态接口 HTTP ${response.status}`);
      const session = await response.json();
      const accessToken = session.accessToken ?? session.access_token;
      if (!accessToken) throw new Error("请先登录 chatgpt.com");
      return {
        accessToken,
        accountId: findChatGPTAccountId(session, accessToken),
      };
    }

    async function fetchChatGPTUsage() {
      const { accessToken, accountId } = await fetchChatGPTSession();
      const headers = {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      };
      if (accountId) headers["ChatGPT-Account-Id"] = accountId;

      const endpoints = [
        "https://chatgpt.com/backend-api/codex/usage",
        "https://chatgpt.com/backend-api/wham/usage",
        "https://chatgpt.com/api/codex/usage",
      ];
      let lastError = null;
      for (const url of endpoints) {
        try {
          const response = await _origFetch(url, {
            credentials: "include",
            headers,
          });
          if (response.status === 404) continue;
          if (response.status === 401 || response.status === 403) {
            throw new Error(`HTTP ${response.status}，当前账号可能没有 Codex 权限`);
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const parsed = UsageParsers.parseChatGPT(data);
          if (parsed.hit) {
            parsed.resetCredits = await fetchChatGPTResetCredits(
              headers,
              parsed.resetCredits,
            );
            return parsed;
          }
          lastError = new Error("接口响应中没有额度窗口");
        } catch (error) {
          lastError = error;
          console.warn("[ChatGPT/Codex用量] 接口失败:", url, error.message);
        }
      }
      throw lastError ?? new Error("所有用量接口均不可用");
    }

    async function fetchChatGPTResetCredits(headers, fallbackSummary) {
      const endpoints = [
        "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits",
        "https://chatgpt.com/api/codex/rate-limit-reset-credits",
      ];
      for (const url of endpoints) {
        try {
          const response = await _origFetch(url, {
            credentials: "include",
            headers,
          });
          if (response.status === 404) continue;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const parsed = UsageParsers.parseChatGPTResetCredits(
            await response.json(),
          );
          if (parsed) return parsed;
        } catch (error) {
          console.warn("[ChatGPT重置卡] 接口失败:", url, error.message);
        }
      }
      return fallbackSummary ?? null;
    }

    function enableDrag() {
      if (!panel) return;

      let startX, startY, startLeft, startTop, pointerMoved;

      panel.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        pointerMoved = false;
        startX = e.clientX;
        startY = e.clientY;

        // 获取当前位置
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        panel.style.transition = "none";
        panel.style.cursor = "grabbing";
        panel.setPointerCapture?.(e.pointerId);
      });

      document.addEventListener("pointermove", (e) => {
        if (!isDragging) return;
        e.preventDefault();

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
          pointerMoved = true;
          isHovered = false;
        }

        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;

        // 边界限制 - 使用当前布局的收起宽度作为基准
        const collapsedWidth = getPanelMetrics().collapsedWidth;
        const maxLeft = window.innerWidth - collapsedWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panel.style.left = newLeft + "px";
        panel.style.top = newTop + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      });

      document.addEventListener("pointerup", (e) => {
        if (isDragging) {
          isDragging = false;
          panel.style.transition = "all 0.2s ease";
          panel.style.cursor = "move";
          panel.releasePointerCapture?.(e.pointerId);

          // 保存实际位置坐标和对齐方式
          const rect = panel.getBoundingClientRect();
          const isRight = rect.left > window.innerWidth / 2;

          if (isRight) {
            // 在右边时保存距右边的距离
            savedPosition.right = window.innerWidth - rect.right;
            savedPosition.left = null;
          } else {
            // 在左边时保存距左边的距离
            savedPosition.left = rect.left;
            savedPosition.right = null;
          }

          savedPosition.top = rect.top;
          savedPosition.isRight = isRight;

          // 保存到 localStorage
          localStorage.setItem(
            positionStorageKey,
            JSON.stringify({
              left: savedPosition.left,
              right: savedPosition.right,
              top: rect.top,
              isRight: isRight,
            }),
          );

          if (!pointerMoved && e.pointerType !== "mouse") {
            isHovered = !isHovered;
          }

          // 重新渲染以调整展开方向
          renderPanel();
        }
      });

      document.addEventListener("pointercancel", (e) => {
        if (!isDragging) return;
        isDragging = false;
        panel.style.transition = "all 0.2s ease";
        panel.style.cursor = "move";
        panel.releasePointerCapture?.(e.pointerId);
        renderPanel();
      });
    }

    function init(options = {}) {
      if (document.getElementById("claude-usage-panel-bottom")) {
        console.warn(`[${panelTitle}] 小部件已存在`);
        return;
      }

      if (provider === "claude") hookFetch();
      panel = createPanel();

      // 支持自定义位置覆盖
      if (options.position) {
        const position = options.position;
        if (position.bottom) panel.style.bottom = position.bottom;
        if (position.left) panel.style.left = position.left;
        if (position.top) panel.style.top = position.top;
        if (position.right) panel.style.right = position.right;
      }

      const initWhenReady = () => {
        if (!document.body) {
          setTimeout(initWhenReady, 100);
          return;
        }

        document.body.appendChild(panel);

        if (provider === "chatgpt" && isMobileLayout() && !options.position) {
          const mobilePos = getMobileAnchorPosition();
          savedPosition.left = mobilePos.left;
          savedPosition.right = null;
          savedPosition.top = mobilePos.top;
          savedPosition.isRight = false;
          panel.style.left = mobilePos.left + "px";
          panel.style.top = mobilePos.top + "px";
          panel.style.right = "auto";
          panel.style.bottom = "auto";
        }

        // 恢复保存的位置（在添加到DOM后）
        const savedPos = localStorage.getItem(positionStorageKey);
        if (provider === "chatgpt" && savedPos && !options.position) {
          try {
            const pos = JSON.parse(savedPos);
            let top = parseFloat(pos.top);
            let isRight = pos.isRight !== undefined ? pos.isRight : false;

            // 边界检查和修正
            const maxTop = window.innerHeight - 100;
            if (top > maxTop) top = maxTop;
            if (top < 0) top = 0;

            savedPosition.top = top;
            savedPosition.isRight = isRight;

            if (isRight && pos.right !== null && pos.right !== undefined) {
              // 恢复右对齐位置
              let right = parseFloat(pos.right);
              const maxRight = window.innerWidth - getPanelMetrics().collapsedWidth;
              if (right > maxRight) right = maxRight;
              if (right < 0) right = 0;

              savedPosition.right = right;
              savedPosition.left = null;

              panel.style.right = right + "px";
              panel.style.left = "auto";
            } else if (pos.left !== null && pos.left !== undefined) {
              // 恢复左对齐位置
              let left = parseFloat(pos.left);
              const maxLeft = window.innerWidth - getPanelMetrics().collapsedWidth;
              if (left > maxLeft) left = maxLeft;
              if (left < 0) left = 0;

              savedPosition.left = left;
              savedPosition.right = null;

              panel.style.left = left + "px";
              panel.style.right = "auto";
            }

            panel.style.top = top + "px";
            panel.style.bottom = "auto";
          } catch (e) {
            console.warn(`[${panelTitle}] 恢复位置失败`, e);
          }
        }

        renderPanel();
        if (provider === "chatgpt") {
          enableDrag();

          panel.addEventListener("mouseenter", () => {
            if (!isDragging) {
              isHovered = true;
              renderPanel();
            }
          });

          panel.addEventListener("mouseleave", () => {
            if (!isDragging) {
              isHovered = false;
              renderPanel();
            }
          });
        } else {
          applyClaudePosition();
        }

        if (provider === "claude") {
          discoverOrgId().then(() => fetchUsage());
        } else {
          fetchUsage();
        }

        refreshInterval = setInterval(() => {
          if (provider === "chatgpt" || orgId) fetchUsage();
        }, 65000);

        const themeObserver = new MutationObserver(applyTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class", "data-theme"],
        });
        window
          .matchMedia("(prefers-color-scheme: dark)")
          .addEventListener("change", applyTheme);

        console.log(
          `%c✅ ${panelTitle}小部件已启动`,
          "color:#10b981;font-weight:600;font-size:13px",
        );
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initWhenReady);
      } else {
        initWhenReady();
      }
    }

    function destroy() {
      if (panel && panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
      if (countdownTimer) clearInterval(countdownTimer);
      if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
      if (claudeAutoCollapseTimer) clearTimeout(claudeAutoCollapseTimer);
      if (refreshInterval) clearInterval(refreshInterval);
      if (claudeDocumentClickHandler) {
        document.removeEventListener("click", claudeDocumentClickHandler);
      }
      if (claudeKeyHandler) {
        document.removeEventListener("keydown", claudeKeyHandler);
      }
      panel = null;
      claudeShadow = null;
      orgId = null;
      console.log(`[${panelTitle}] 小部件已销毁`);
    }

    return {
      init,
      destroy,
      getUsageData: () => usageData,
    };
  })();

  ClaudeUsageWidget.init();

  if (isClaudeSite) {
    // 动态首页文案通过 DOM 处理；Design 页面继续兼容打包在 JS bundle 中的静态字符串。
    function isDesignPage() {
      return location.pathname.startsWith("/design");
    }

    function shouldSkipTranslation(node) {
      let element =
        node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (element) {
        const tagName = String(element.tagName || "").toUpperCase();
        if (
          ["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(tagName) ||
          element.isContentEditable ||
          element.getAttribute?.("contenteditable") === "true"
        ) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    }

    function translateAttrs(el) {
      if (!isDesignPage()) return;
      for (const attr of ["title", "placeholder", "aria-label"]) {
        const val = el.getAttribute(attr);
        if (val && DESIGN_TRANSLATIONS[val]) {
          el.setAttribute(attr, DESIGN_TRANSLATIONS[val]);
        }
      }
    }

    function translateTextNode(node) {
      if (shouldSkipTranslation(node)) return;
      const raw = node.nodeValue;
      const text = raw && raw.trim();
      if (!text) return;

      const dynamicTranslation = DynamicTranslations.translate(text);
      if (dynamicTranslation !== text) {
        node.nodeValue = raw.replace(text, dynamicTranslation);
        return;
      }

      if (isDesignPage() && DESIGN_TRANSLATIONS[text]) {
        node.nodeValue = raw.replace(text, DESIGN_TRANSLATIONS[text]);
      }
    }

    function translateDynamicContainers(root) {
      if (!root) return;
      const seedNodes = [];
      if (root.nodeType === Node.TEXT_NODE) {
        seedNodes.push(root);
      } else if (root.nodeType === Node.ELEMENT_NODE) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) seedNodes.push(textNode);
      }

      const candidates = new Set();
      for (const textNode of seedNodes) {
        if (!/(?:you|used|fable|resets)/i.test(textNode.nodeValue || "")) {
          continue;
        }
        let element = textNode.parentElement;
        for (let depth = 0; element && depth < 5; depth += 1) {
          candidates.add(element);
          if (element === root) break;
          element = element.parentElement;
        }
      }

      const orderedCandidates = [...candidates].sort((a, b) => {
        const depth = (element) => {
          let value = 0;
          while (element?.parentElement) {
            value += 1;
            element = element.parentElement;
          }
          return value;
        };
        return depth(b) - depth(a);
      });

      for (const element of orderedCandidates) {
        if (shouldSkipTranslation(element)) continue;
        const combined = String(element.textContent || "").trim();
        if (!combined || combined.length > 240) continue;
        const translated = DynamicTranslations.translate(combined);
        if (translated === combined) continue;

        const textNodes = [];
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
        );
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (textNode.nodeValue?.trim() && !shouldSkipTranslation(textNode)) {
            textNodes.push(textNode);
          }
        }
        if (!textNodes.length) continue;

        const first = textNodes[0];
        const raw = first.nodeValue || "";
        const leading = raw.match(/^\s*/)?.[0] || "";
        const trailing = raw.match(/\s*$/)?.[0] || "";
        first.nodeValue = `${leading}${translated}${trailing}`;
        for (const extraNode of textNodes.slice(1)) extraNode.nodeValue = "";
      }
    }

    function translateNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node);
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !shouldSkipTranslation(node)
      ) {
        translateDynamicContainers(node);
        translateAttrs(node);
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
          translateTextNode(textNode);
        }
        if (isDesignPage()) {
          node
            .querySelectorAll("[title],[placeholder],[aria-label]")
            .forEach(translateAttrs);
        }
      }
    }

    const claudeDomObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          translateDynamicContainers(mutation.target);
        } else if (
          mutation.type === "attributes" &&
          mutation.target.nodeType === Node.ELEMENT_NODE
        ) {
          translateAttrs(mutation.target);
        } else {
          for (const node of mutation.addedNodes) {
            translateNode(node);
          }
        }
      }
    });

    function initClaudeDomTranslator() {
      translateNode(document.body);
      claudeDomObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "placeholder", "aria-label"],
      });
    }

    if (document.body) {
      initClaudeDomTranslator();
    } else {
      document.addEventListener("DOMContentLoaded", initClaudeDomTranslator);
    }
  }

})();
