#!/usr/bin/env node

/**
 * Claude Code usage dashboard.
 * Fetches real usage data from the API and computes pacing statistics.
 */

const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

const { version } = require("./package.json");

// Cycle length per limit group, used to work out how much of the window
// has elapsed. A group missing here still renders, just without pacing.
const CYCLE_HOURS = { session: 5, weekly: 7 * 24 };

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => paint(2, s);
const red = (s) => paint(31, s);

// ── Credentials ─────────────────────────────────────────────────────
function getCredentials() {
  let raw;
  if (os.platform() === "darwin") {
    try {
      raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    } catch {
      return null;
    }
  } else {
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    try {
      raw = fs.readFileSync(credPath, "utf8");
    } catch {
      return null;
    }
  }

  try {
    const creds = JSON.parse(raw);
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

// ── API ─────────────────────────────────────────────────────────────
async function apiGet(token, endpoint) {
  const res = await fetch(`https://api.anthropic.com/api/oauth/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  if (res.status === 401) {
    throw new Error(
      "Claude credentials rejected — run `claude` to log in again",
    );
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Pacing ──────────────────────────────────────────────────────────
function computePacing(utilization, resetsAt, cycleHours) {
  const msLeft = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null;

  const hoursLeft = msLeft / 3_600_000;
  if (!cycleHours) return { hoursLeft, diff: null };

  const pctElapsed = Math.min(
    100,
    ((cycleHours - hoursLeft) / cycleHours) * 100,
  );
  return { hoursLeft, diff: utilization - pctElapsed };
}

// ── Formatting ──────────────────────────────────────────────────────
function formatCountdown(hours) {
  const total = Math.round(hours * 60);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatReset(resetsAt) {
  const reset = new Date(resetsAt);
  const clock = reset.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (reset.toDateString() === new Date().toDateString()) return clock;
  const day = reset.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${day} ${clock}`;
}

function formatAhead(diff) {
  const ahead = diff === null ? 0 : Math.round(diff);
  return ahead >= 1 ? `${ahead}%` : "";
}

function labelFor(limit) {
  if (limit.kind === "session") return "5h";
  if (limit.kind === "weekly_all") return "7d";
  return limit.scope?.model?.display_name || limit.kind;
}

// ── Display ─────────────────────────────────────────────────────────
function displayAccount(profile, limits) {
  const rows = limits
    .map((limit) => {
      const pacing = computePacing(
        limit.percent,
        limit.resets_at,
        CYCLE_HOURS[limit.group],
      );
      if (!pacing) return null;
      return {
        label: `${labelFor(limit)}:`,
        pct: `${limit.percent}%`,
        reset: `resets ${formatReset(limit.resets_at)}`,
        left: `in ${formatCountdown(pacing.hoursLeft)}`,
        ahead: formatAhead(pacing.diff),
      };
    })
    .filter(Boolean);

  console.log(
    `${profile.account.email} ${dim(`[${profile.organization.name}]`)}`,
  );

  if (!rows.length) {
    console.log(dim("  no active usage windows"));
    return;
  }

  const width = (key) => Math.max(...rows.map((r) => r[key].length));
  const w = {
    label: width("label"),
    pct: width("pct"),
    reset: width("reset"),
    left: width("left"),
    ahead: width("ahead"),
  };

  rows.forEach((row, i) => {
    const branch = i === rows.length - 1 ? "└" : "├";
    const pace = row.ahead
      ? red(`${row.ahead.padStart(w.ahead)} ahead of pace`)
      : "";
    console.log(
      (`  ${branch} ${row.label.padEnd(w.label)} ${row.pct.padStart(w.pct)}   ` +
        `${dim(row.reset.padEnd(w.reset))}  ${dim(row.left.padEnd(w.left))}  ${pace}`).trimEnd(),
    );
  });
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2];
  if (arg === "-v" || arg === "--version") return console.log(version);
  if (arg === "-h" || arg === "--help") {
    return console.log(
      "ccpace — Claude Code usage pacing dashboard\n\n" +
        "Usage: ccpace [-h|--help] [-v|--version]\n\n" +
        "Reads your Claude Code login and prints each usage window with\n" +
        "how much you've used, when it resets, and whether you're ahead of pace.\n" +
        "Set NO_COLOR to disable colored output.",
    );
  }

  const token = getCredentials();
  if (!token) {
    console.error("No Claude credentials found — run `claude` to log in");
    process.exit(1);
  }

  const [usage, profile] = await Promise.all([
    apiGet(token, "usage"),
    apiGet(token, "profile"),
  ]);

  displayAccount(profile, usage.limits || []);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
