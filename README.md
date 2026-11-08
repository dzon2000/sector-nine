# SEKTOR 9

A single-player, browser-based idle factory and economic strategy game. Design compact production lines, route physical goods, maximize **operating profit**, and unlock increasingly complex technologies while uncovering the history of an abandoned industrial colony.

**Project phase:** design and assumptions validation, before v0.1 implementation.

## Key documents

- [Game Design Document](docs/GDD.md) — product vision and long-term game systems
- [v0.1 Specification](docs/specifications/v0.1.md) — first playable version and acceptance tests
- [Economy](docs/economy.md) — economic assumptions and reference production line
- [Validation Plan](docs/validation-plan.md) — tests to run before building game UI
- [Tutorial and Story](docs/tutorial-and-story.md) — narrative opening and guided onboarding
- [Architecture](docs/architecture.md) — technical structure and design constraints
- [Roadmap](docs/roadmap.md) — incremental releases
- [Agent guidelines](AGENTS.md) — conventions for implementation agents

## Technology (approved)

TypeScript, React, PixiJS, Vite, Vitest, IndexedDB. Playwright is proposed for browser end-to-end testing. No backend for v0.1.

## Project workflow

1. Brainstorm, discuss balance, and approve specifications in the dedicated **design chat**.
2. Commit approved English-language documents to this repository; treat GitHub as the source of truth.
3. Open a **separate implementation chat per version**. Implement against its frozen specification.
4. Validate determinism, economics, and acceptance criteria before focusing on graphics or expanding gameplay.
5. Develop on a feature branch; review via Pull Request into `develop`. Tag released versions separately.

The repository deliberately contains **documentation and directory placeholders only** at this stage. Application bootstrap, simulation code, and build dependencies belong to the v0.1 implementation phase.

## Status

All economic figures are provisional hypotheses pending headless simulation and playtests. No claims of functional gameplay are made by this initialization commit.

## License

See [LICENSE](LICENSE).
