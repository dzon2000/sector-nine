---
name: specification-audit
description: Audit SEKTOR 9 feature or version specifications and produce architecture decisions, feasibility checks, work-package plan, and acceptance test mapping before code
---

# Specification Audit

Use for new releases, issues, architecture proposals and requirements ambiguities.

1. Read AGENTS.md, docs/GDD.md, docs/architecture.md, docs/roadmap.md, active frozen specification, docs/decisions/ and release/validation status.
2. Distinguish approved facts from proposals; preserve existing rules and economics. Reconcile issue requirements, UI constraints, current-version persistence and narrative. Apply docs/decisions/0006-development-save-policy.md: legacy compatibility is not a constraint from v0.5.
3. Map each acceptance criterion to executable unit/integration/Playwright evidence and human-only sign-off; include negative/adversarial cases.
4. Decompose scope into dependency-ordered work packages with testable entry/exit gates. Identify math/throughput feasibility and playtest risk before asking to build.
5. Draft decision options and recommended ADR text for PO approval; never write/overwrite frozen specs or claim provisional values are approved.

Output: authority/source revision, proposed design, AC matrix, work packages, risks and explicit PO decisions required. Stop when authority is missing.
