# SEKTOR 9 — AI Development Studio Instructions

This repository is the canonical source of truth. Read [Studio Playbook](docs/studio/README.md) before starting work. Product Owner (human) retains final decision authority. Product discussions may happen in a separate chat; only approved decisions committed to GitHub are implementation authority.

## Roles and execution

- **Studio** (`.opencode/agents/studio.md`): read-only coordinator; delegates to Architect, Developer, and QA and preserves approval boundaries.
- **Architect** (`.opencode/agents/architect.md`): read-only technical design, ADR proposals, risk and acceptance mapping.
- **Developer** (`.opencode/agents/developer.md`): implementation under an approved scope; strict red/green/refactor TDD.
- **QA** (`.opencode/agents/qa.md`): independent read-only audit, regression and acceptance evidence; can execute tests.
- **Product Owner (human)**: approves specifications, economic tuning, architecture decisions affecting scope, work-package progression, human playtests and release authorization.

OpenCode discovers reusable skills under `.opencode/skills/`. Load only those relevant to the task. A role is not allowed to approve its own handoff, approve human evidence, or infer approval from passing CI.

## Non-negotiable engineering rules

- Write specifications, docs, source comments, identifiers, commits and PR descriptions in **English**.
- Read `docs/GDD.md`, `docs/architecture.md`, applicable `docs/specifications/<version>.md`, `docs/decisions/`, and the active validation record before making a proposal or editing code.
- Follow the **currently approved, frozen, version-specific specification**. No new mechanics, altered economic constants, modified map coordinates, or redefined acceptance criteria without explicit Product Owner approval and an ADR/spec update.
- Keep `src/simulation/` independent of React, PixiJS, DOM, timers, wall-clock time and persistence. Advance with explicit deterministic integer ticks. Represent money in integer cents.
- Keep production, physical logistics, accounting, commands/progression, rendering and persistence separately testable; preserve material conservation and backpressure.
- Preserve existing games and rule versions. Never discard, reset or silently upgrade a save after failed migration; validate real historical saves separately from synthetic fixtures.
- Use strict TDD for functional changes: failing regression/acceptance test first (RED), minimal change (GREEN), refactor with tests. No speculative future-release work.
- Run relevant Vitest, TypeScript/Vite build and Playwright checks. For release candidates, use the full repository CI suite and map every acceptance criterion to evidence.
- Do not fabricate playtest observations, archived save coverage, CI success, commit provenance, or release readiness. Automated engine campaigns are **not** human gameplay.

## Delivery and release policy

1. Architect proposes a bounded plan, AC-to-test mapping, ADRs and identified risks; Product Owner approves any new/frozen design or work-package plan.
2. Developer implements only authorized scope on a feature branch, produces test evidence and requests QA review.
3. QA independently audits exact branch/commit and reports PASS, FAIL, BLOCKED or NOT RUN per criterion, including regression/migration/economic risks.
4. Product Owner performs hands-on playtesting and explicitly approves or rejects relevant human acceptance criteria and each requested work-package boundary.
5. PRs target `develop`. No agent may merge, tag, publish, close release issues or deploy a release without **separate explicit Product Owner authorization**. Read-only review and green CI are not release approval.

Do not modify a concurrent release branch or assume it is merged. Current release status must be read from PRs and release documents, not inferred from stale README/package versions.

## Source layout

- `docs/`: GDD, architecture, economics, approved specs, decisions, validations, story, releases and studio playbook
- `src/domain/`, `src/simulation/`, `src/game/`, `src/rendering/`, `src/ui/`, `src/persistence/`: application boundaries
- `tests/`: unit, integration, gameplay campaign and browser tests
- `.opencode/agents/`: runnable OpenCode role profiles
- `.opencode/skills/`: task-specific reusable instructions
- `.opencode/commands/`: optional studio entry points
