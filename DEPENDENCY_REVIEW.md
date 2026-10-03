# Dependency review

Audit recorded locally on 2026-10-03 against the checked-in npm lockfile.

Reported affected packages: 5 total; 5 high,
0 moderate, 0 critical.

The full audit reports 5 high-severity affected packages. The source advisory is
braces stack exhaustion on deeply nested patterns (GHSA-vfj7-8cjw-p6xm), propagated
through micromatch/fast-glob and the Next ESLint plugin/config. These are development
lint dependencies. `npm audit --omit=dev --json` reports zero advisories.

The audit proposes a major downgrade to eslint-config-next 14.2.35, incompatible
with this Next 16 project. No forced downgrade was applied. Treat repository files
and lint configuration as trusted input, monitor compatible upstream fixes, and
rerun both full and production audits before release. This scope assessment does
not prove absence of other vulnerabilities.

`dependency-audit.json` contains the complete npm result and source advisory links.
Reproduce with `npm ci` followed by `npm audit --json`. Registry advisory data
changes over time; zero reported advisories is not a security certification.
