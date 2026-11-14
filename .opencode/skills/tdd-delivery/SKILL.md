---
name: tdd-delivery
description: Implement an approved SEKTOR 9 work package using strict RED GREEN REFACTOR TDD with explicit acceptance and regression evidence
---

# TDD Work Package Delivery

Use only after PO authorization names the scope/work package.

1. Confirm frozen spec/ADR, approved ACs, base/head branch and out-of-scope behavior. Do not code on an unapproved design.
2. Write a focused test that fails for a real missing requirement; execute and record **RED** with expected failure. Include edge/adversarial cases.
3. Implement the smallest behavior for **GREEN**, then refactor under passing tests. Prefer headless simulation before UI. Keep a tested save migration for changed state.
4. Add integration and Playwright coverage as needed, including keyboard/pointer, responsive viewports, story/provenance and accessible focus.
5. Execute `npm test`, `npm run build`, `npm run test:e2e` when relevant; for release candidates run all. If Playwright/browser is unavailable, say NOT RUN, never PASS.
6. Review diff for accidental economic changes, forbidden future work, flaky time dependence, snapshots that conceal regressions and unsigned assumptions.
7. Produce handoff with exact SHA, RED/GREEN tests, final command results, related ACs, unresolved gaps and CI run URL for that SHA.

Do not weaken test assertions to match wrong behavior. Do not merge or tag, and stop at the work-package approval boundary.
