---
name: game-qa
description: Independently assess SEKTOR 9 code and gameplay acceptance, verify economy, deterministic saves, migration, UI, and CI without source edits
---

# Independent Game QA

Use for PR reviews, work-package acceptance and regression audits.

1. Pin the exact reviewed commit, branch/PR and frozen spec/ADR versions. Read actual diff and existing tests; do not rely on Developer summaries.
2. Map every applicable AC to test IDs, assertion substance, negative case, command/CI output and manual coverage. A green workflow is not proof of every AC.
3. Verify deterministic tick ordering, physical goods, backpressure, money and materials, unchanged historical reference economics, paid campaign progression and no mission-bypass fixtures.
4. Verify old schema/rule persistence, reload/restore determinism and failure recovery. Label synthetic generated saves separately from authentic user archives.
5. Check React/Pixi viewport scaling, keyboard and pointer accessibility, mission visibility, recorder provenance and opt-in/no-telemetry guarantees as applicable.
6. Reproduce regressions with focused tests; use full `npm test`, `npm run build`, `npm run test:e2e` and final-HEAD CI when release-critical.
7. Report failures first (severity, reproduction, files), then AC matrix PASS/FAIL/BLOCKED/NOT RUN, exact CI SHA, human/manual gaps and PO recommendation.

No editing code/tests/specs to make QA pass. Human playtesting and release approval are independent gates.
