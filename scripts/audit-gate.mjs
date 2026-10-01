// CI gate over RUNTIME dependencies (npm audit --omit=dev): fails on
// high/critical unless the package is explicitly allowlisted below with a
// reason and a review date. An expired entry fails the gate — re-justify or
// fix; never widen or bypass the gate itself. Dev-only findings never fail
// this gate (they are developers' local risk, not production's).
import { execSync } from "node:child_process";

const ALLOWLIST = {
  // "package-name": { until: "YYYY-MM-DD", reason: "why we ship it anyway" },
};

let out;
try {
  out = execSync("npm audit --omit=dev --json", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  // npm audit exits non-zero whenever it finds ANY vulnerability —
  // even below our gate threshold. The report is still on stdout.
  out = e.stdout;
}
if (!out) {
  console.error("[audit-gate] npm audit produced no output — cannot verify");
  process.exit(2);
}
const { vulnerabilities = {} } = JSON.parse(out);

const failing = [];
for (const [name, vuln] of Object.entries(vulnerabilities)) {
  if (!["high", "critical"].includes(vuln.severity)) continue;

  const entry = ALLOWLIST[name];
  if (entry) {
    if (new Date(entry.until) >= new Date()) {
      console.warn(
        `[audit-gate] allowlisted ${name} (${vuln.severity}) until ${entry.until}: ${entry.reason}`,
      );
      continue;
    }
    failing.push(
      `${name}: allowlist entry EXPIRED on ${entry.until} — fix or re-justify`,
    );
    continue;
  }

  const titles = (vuln.via || [])
    .filter((v) => typeof v === "object")
    .map((v) => v.title)
    .join("; ");
  failing.push(`${name} (${vuln.severity}): ${titles || vuln.range}`);
}

if (failing.length) {
  console.error(
    `[audit-gate] ${failing.length} unmitigated high/critical runtime finding(s):`,
  );
  for (const f of failing) console.error(`  - ${f}`);
  console.error(
    "Fix via `npm audit fix` (or a pin bump) or add a dated, justified entry to ALLOWLIST in scripts/audit-gate.mjs.",
  );
  process.exit(1);
}

console.log(
  "[audit-gate] OK: no unmitigated high/critical findings in runtime dependencies.",
);
