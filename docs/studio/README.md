# SEKTOR 9 — AI Game Development Studio

**Scope:** project workflow and reusable OpenCode v2 agent configuration; no gameplay changes.
**Authority:** the human Product Owner approves gameplay/design/economy changes, work-package gates, acceptance and releases. Repository documents, not conversational memory, define approved implementation scope.

## Roles

| Participant | Responsibility | Writes source? | May approve release? |
| --- | --- | --- | --- |
| Product Owner (human) | Scope, design, balance, priorities, hands-on playtest, sign-off | May authorize changes | Yes, explicitly |
| `studio` (primary) | Coordinate handoffs, track gates, compile status | No | No |
| `architect` (subagent) | Inspect constraints, design technical solution, draft ADR/proposed AC map | No | No |
| `developer` (subagent) | Implement authorized work in TDD increments, maintain tests and evidence | Yes, after PO-approved scope | No |
| `qa` (subagent) | Independent code review, run checks, inspect acceptance/economy/migrations | No source edits | No |

Role permissions are guidance plus OpenCode tool restrictions, **not** a substitute for GitHub branch protection and human review. In particular, shell and external GitHub tools may need organization-level protection. Configure required CI/status checks and human approvals on `develop` in GitHub settings.

## Operational workflow

1. **Intake** — PO provides issue/version, objective, constraints, acceptance criteria and whether scope is approved. Studio inspects current branch, open PRs, frozen spec, ADRs, CI and pending gates.
2. **Design** — Architect loads `specification-audit` and (for engine changes) `deterministic-simulation`. Produces bounded work packages, AC-to-test mapping, risks, migration impact and proposed ADRs. Changes to economics or approved design stop for PO approval.
3. **Authorization** — PO explicitly approves the plan, frozen numbers and one work package/phase as required. An unapproved suggestion does not become an implementation task.
4. **Implement** — Developer loads `tdd-delivery` and relevant engine skill. Adds RED test before changing behavior, records failing assertion, implements GREEN, refactors, and reports commit/CI evidence. Work stays on feature branch; no implementation of later work packages by implication.
5. **Verify** — QA independently loads `game-qa`, checks change diff at a named commit, regression/acceptance matrix, and synthetic versus authentic saves; logs blockers. Failure returns to Developer; a clean QA report proceeds to PO review.
6. **Human acceptance** — PO performs actual gameplay, UX, accessibility and migration validation; QA can provide a reproducible checklist and analyze genuine exported recorder data using `human-playtest`. Never translate engine-only tests into player sign-off.
7. **Release gate** — QA uses `release-readiness` on exact proposed HEAD. Only the PO can separately authorize PR merge, tag and publishing. A WP approval is not release authorization.

For independent tasks, the studio can run read-only Architect and QA analysis in parallel. For implementation, preserve ordered **design → PO approval → Developer → QA → PO acceptance** handoffs. No agent may silently proceed through a missing gate.

## Handoff contract

Use [work-package template](work-package-template.md) in PR descriptions or validation reports. Every handoff should identify:
- source branch and **exact SHA**, spec/ADR revision and relevant GitHub issues;
- permitted scope and out-of-scope items;
- acceptance criterion IDs, tests and actual results (not just test intent);
- runtime and save-schema/migration effects, economics and determinism risks;
- CI URL attached to the **same SHA** (or clearly `NOT RUN`);
- human observations and missing data, explicitly marked;
- recommendation: **READY FOR PO / CHANGES REQUIRED / BLOCKED**.

QA must disagree with Developer if evidence is weak. `PASS` applies only to an executed check, `BLOCKED` to unsatisfied external/human gates, and `NOT RUN` to omitted verification. Archive any waiver explicitly.

## OpenCode usage

Run from the repository root with OpenCode v2. Project files auto-discover, and no model/provider is pinned: each subagent inherits the selected parent model unless local config overrides it. Use a stronger model for architecture/independent risk analysis and a cheaper appropriate model for bounded coding when desired.

- `/studio <goal or issue>` starts the coordinating `studio` primary agent.
- Alternatively select `studio` as the primary agent and ask it to delegate to `architect`, `developer`, and `qa`.
- Specialists are configured as subagents. Do not expect them to independently own a release.
- Skills load on demand by ID, e.g. `specification-audit`, `tdd-delivery`, `game-qa`.

OpenCode cannot enforce a **semantic** PO approval decision through Markdown alone. Preserve GitHub's required human review and protected release process.

## Repository-specific release caution

The v0.4 feature branch/PR must be assessed independently of the last merged `develop` release. v0.4's human playtest criterion V04-AC-17, authentic historical save validation and manual UX/deployment checks are distinct from automated success. Confirm current status from the live PR/validation files, rather than carrying these historical blockers forward without checking.
