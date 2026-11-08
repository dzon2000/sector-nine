# Roadmap — SEKTOR 9

**Rule:** each version receives its own implementation chat and its own specification. The dedicated design chat owns brainstorming and specification review.

| Version | Focus | Demonstrable outcome |
|---|---|---|
| Pre-v0.1 | Design and assumptions validation | Reference layout/ledger model, clear invariants, approved spec |
| v0.1 | First factory | 12x12 grid, mine, furnace, belts, terminal, opening story, tutorial, four prologue missions, autosave |
| v0.2 | Advanced metallurgy and technology unlocks — **approved specification** | Coal, steel, gears, multi-input recipes, achievement + credit unlocks, M5–M7 |
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

## v0.2 implementation handoff

The approved contract is [v0.2 Specification](specifications/v0.2.md), decision rationale in [ADR-0002](decisions/0002-v0.2-metallurgy-and-unlocks.md).

- Begin from the merged v0.1 `develop` branch; implement in a separate chat and feature branch.
- Preserve deterministic production, the 58.50 Cr/min v0.1 reference baseline, and all v0.1 saves.
- Run typed-input, two-source, coal, gear, steel, conservation, and payback scenarios before adding UI.
- The numerical economy model is an approved starting hypothesis, **not** a verified result; any balance change must be recorded and reviewed.
