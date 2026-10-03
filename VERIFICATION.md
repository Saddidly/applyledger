# Verification

Local evidence recorded on 2026-10-03.

## Passed

9 database/request tests, ESLint, and production build passed. Chromium acceptance created an application, added a note, changed Applied to Interview, observed the updated timeline/metrics, and reloaded persisted data. Desktop and 390px screenshots were reviewed; no page errors were reported.

## Environment and limits

Windows Node.js 22.14.0 and Chromium. The acceptance database was separate from project data. Public hosting and multi-user authentication remain unverified. See DEPENDENCY_REVIEW.md for outstanding tooling advisories.

## Hosted evidence

[GitHub Actions run](https://github.com/Saddidly/applyledger/actions/runs/37111963374) passed on 2026-10-03 for code revision `3967a05e8526691e6c4b3c9c35b446ae2666250f`.

Ubuntu, Node 22; database/request tests, lint, build, and Chromium desktop/mobile create, notes, status, reload, backup, import, and delete flows.

These checks cover the named environments and cases, not every possible input or platform. Re-run README commands after changing dependencies or moving to another platform. Screenshots and acceptance data are synthetic.

