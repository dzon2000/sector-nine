# Roadmap — SEKTOR 9

**Rule:** each version receives its own implementation chat and its own specification. The dedicated design chat owns brainstorming and specification review.

| Version | Focus | Demonstrable outcome |
|---|---|---|
| Pre-v0.1 | Design and assumptions validation | Reference layout/ledger model, clear invariants, approved spec |
| v0.1 | First factory | 12x12 grid, mine, furnace, belts, terminal, opening story, tutorial, four prologue missions, autosave |
| v0.2 | Metallurgy and research | Coal, steel, gears, multi-input recipes, basic technology unlocks |
| v0.3 | Quality of idle play | Storage, bottleneck diagnostics, consistent bounded offline progress |
| v0.4 | Electronics and energy | Copper, silicon, circuits, generators and power constraints |
| v0.5 | Campaign expansion | New chapters, contracts, rewards and consequential decisions |
| v0.6+ | Industrial empire | Robots, map expansion, future technologies and advanced objectives |

## Exit gates

Before a version can be considered complete:
1. Its acceptance criteria pass.
2. Core simulation remains deterministic.
3. There is no unexplained loss/duplication of items or money.
4. Save/restore remains valid and documented.
5. Regressions of earlier mechanics have automated coverage.
6. A human can complete the new gameplay loop without developer tools.

For v0.1 specifically, **simulation validation precedes visual gameplay work**.
