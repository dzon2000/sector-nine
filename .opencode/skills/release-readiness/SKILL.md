---
name: release-readiness
description: Produce a SEKTOR 9 release-readiness audit of exact commit CI, full acceptance, migrations, human playtest and unresolved blockers without merging
---

# Release Readiness Gate

Use for final QA and candidate release reviews; never interpret this skill as authorization to publish.

1. Verify PR target `develop`, source branch and exact final commit SHA. Confirm checks were run for **that SHA**; account for GitHub PR synthetic merge SHA versus feature head.
2. Verify full `npm test`, `npm run build`, Playwright, buildCommit attestation if applicable, determinism and historical economy, migration failure handling, save/restore and e2e privacy.
3. Inspect current version-specific acceptance matrix and validation, release checklist, ADR and spec; ensure no frozen economic/AC deviations or open critical code-review threads.
4. Distinguish automated engine campaign from human PO playtest. Require authentic save/manual migration evidence or an explicitly documented PO waiver; track human UX, accessibility, deployed smoke and recorder exports.
5. Classify each AC as PASS, FAIL, BLOCKED or NOT RUN and identify severity, risk, exact evidence links and missing sign-offs.
6. Return one of READY FOR PO REVIEW / CHANGES REQUIRED / BLOCKED. Even READY FOR PO REVIEW is **not** permission to merge, tag, deploy, publish or close issues.

Only a separate, explicit Product Owner authorization opens release actions. No agent can grant it.
