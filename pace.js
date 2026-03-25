#!/usr/bin/env node

/**
 * Claude Code usage dashboard.
 * Fetches real usage data from the API and computes pacing statistics.
 */

const { execSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

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
async function fetchUsage(token) {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Pacing ──────────────────────────────────────────────────────────
function computePacing(utilization, resetsAt, cycleHours) {
  const now = new Date();
  const reset = new Date(resetsAt);
  const msLeft = reset.getTime() - now.getTime();

  if (msLeft <= 0) return null;

  const hoursLeft = msLeft / 3_600_000;
  const hoursElapsed = cycleHours - hoursLeft;
  const pctElapsed = Math.min(100, (hoursElapsed / cycleHours) * 100);
  const diff = utilization - pctElapsed;
  const pctRemaining = 100 - utilization;
  const hoursPerPct = pctRemaining > 0 ? hoursLeft / pctRemaining : 0;

  return { hoursLeft, pctElapsed, diff, pctRemaining, hoursPerPct };
}

// ── Progress bar ────────────────────────────────────────────────────
function progressBar(usedPct, expectedPct) {
  const chars = 50;
  const used = Math.round((usedPct / 100) * chars);
  const expected = Math.round((expectedPct / 100) * chars);

  const colors = { budget: 47, over: 41, pace: 46, empty: 100 };

  function kindOf(i) {
    if (i === expected - 1) return "pace";
    if (i < Math.min(used, expected)) return "budget";
    if (i < used) return "over";
    return "empty";
  }

  let bar = "";
  for (let c = 0; c < chars; c++) {
    bar += `\x1b[${colors[kindOf(c)]}m \x1b[0m`;
  }
  return bar;
}

// ── Format countdown ────────────────────────────────────────────────
function formatCountdown(hours) {
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  const m = Math.round((hours % 1) * 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Display ─────────────────────────────────────────────────────────
function displayWindow(label, utilization, resetsAt, cycleHours) {
  const pacing = computePacing(utilization, resetsAt, cycleHours);
  if (!pacing) {
    console.log(`${label}: ${utilization}% (reset passed)`);
    return;
  }

  const { hoursLeft, pctElapsed, diff, pctRemaining, hoursPerPct } = pacing;

  console.log(`${label}  ${progressBar(utilization, pctElapsed)}`);
  const color = diff >= 0 ? "31" : "32";
  console.log(
    `    \x1b[${color}m${utilization}% used \u00b7 ${pctElapsed.toFixed(1)}% expected \u00b7 ${Math.abs(diff).toFixed(1)}% ${diff >= 0 ? "over" : "under"} budget\x1b[0m`,
  );
  console.log(
    `    ${formatCountdown(hoursLeft)} left \u00b7 ${pctRemaining}% remaining \u00b7 ${hoursPerPct.toFixed(1)}h per 1%`,
  );
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const token = getCredentials();
  if (!token) {
    console.error("No Claude credentials found");
    process.exit(1);
  }

  const data = await fetchUsage(token);

  if (data.five_hour) {
    displayWindow(
      "5h",
      data.five_hour.utilization,
      data.five_hour.resets_at,
      5,
    );
  }
  if (data.seven_day) {
    console.log();
    displayWindow(
      "7d",
      data.seven_day.utilization,
      data.seven_day.resets_at,
      7 * 24,
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
