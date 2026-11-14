# SEKTOR 9

A single-player, browser-based idle factory and economic strategy game. Design compact production lines, route physical goods, maximize **operating profit**, and unlock increasingly complex technologies while uncovering the history of an abandoned industrial colony.

## Key documents

- [Game Design Document](docs/GDD.md) — product vision and long-term game systems
- [Architecture](docs/architecture.md) — technical design and deterministic simulation boundaries
- [Roadmap](docs/roadmap.md) — incremental releases
- [Specifications](docs/specifications/) — version-specific approved gameplay scope
- [Decisions](docs/decisions/) — architecture and product decision records
- [Validation](docs/validation/) and [Releases](docs/releases/) — acceptance and release evidence
- [Studio Playbook](docs/studio/README.md) — AI roles, skills, work-package handoffs and human gates
- [Agent Guidelines](AGENTS.md) — engineering rules

## Stack

TypeScript, React, PixiJS, Vite, Vitest, IndexedDB and Playwright. Game simulation is headless, deterministic and tick-based; no backend is required for local gameplay.

## AI Game Development Studio (OpenCode v2)

The human **Product Owner** owns gameplay decisions and every release authorization. The repo provides a read-only `studio` coordinator and specialist subagents for architecture, TDD development and independent QA.

1. Run OpenCode from the repository root and enter `/studio <your goal or GitHub issue>` (or select the `studio` primary agent).
2. Studio delegates to `architect` to propose bounded design/work packages and maps acceptance criteria.
3. Product Owner approves scope. Studio delegates only approved packages to `developer` (RED → GREEN → refactor).
4. `qa` independently checks exact commits, CI, regressions and acceptance, and identifies human-only gates.
5. Product Owner performs gameplay validation, signs off, and separately authorizes merge/release.

Agent definitions: `.opencode/agents/`; reusable task skills: `.opencode/skills/`; `/studio` entry point: `.opencode/commands/studio.md`. See [playbook](docs/studio/README.md) for permissions, handoff template and gates.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
npm run test:e2e
```

Develop from a feature branch and open a Pull Request into `develop`. Do not assume a version is released based on its existence in an unmerged feature branch. Check current PRs and release records; automated CI does **not** replace hands-on Product Owner acceptance.

## License

See [LICENSE](LICENSE).
