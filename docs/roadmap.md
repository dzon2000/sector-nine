# Roadmap — SEKTOR 9

**Rule:** each version receives its own implementation chat and its own specification. The dedicated design chat owns brainstorming and specification review.

| Version | Focus | Demonstrable outcome |
|---|---|---|
| Pre-v0.1 | Design and assumptions validation | Reference layout/ledger model, clear invariants, approved spec |
| v0.1 | First factory | 12x12 grid, mine, furnace, belts, terminal, opening story, tutorial, four prologue missions, autosave |
| v0.2 | Advanced metallurgy and technology unlocks — **delivered** | Coal, steel, gears, multi-input recipes, achievement + credit unlocks, M5–M7 |
| v0.3 | Sustained throughput and factory optimization — **delivered** | M6/M7 rolling-window missions, bottleneck diagnostics, deterministic compatibility, local playtest evidence |
| v0.4 | Electronics and energy — **in progress** | Copper, silicon, circuits, generators and power constraints |
| v0.5 | Campaign expansion | New chapters, contracts, rewards and consequential decisions |
| v0.6+ | Industrial empire | Robots, map expansion, future technologies and advanced objectives |

**Deferred without a scheduled release:** storage and bounded offline progress. Neither is part of v0.3; a later design decision must explicitly reschedule them.

## Exit gates

Before a version can be considered complete:
1. Its acceptance criteria pass.
2. Core simulation remains deterministic.
3. There is no unexplained loss/duplication of items or money.
4. Save/restore remains valid and documented.
5. Regressions of earlier mechanics have automated coverage.
6. A human can complete the new gameplay loop without developer tools.

For v0.1 specifically, **simulation validation precedes visual gameplay work**.

## v0.3 implementation handoff

The approved contract is [v0.3 Specification](specifications/v0.3.md), task breakdown in [v0.3 Implementation Backlog](implementation/v0.3-tasks.md), and migration rationale in [ADR-0003](decisions/0003-sustained-throughput-missions.md).

- Begin from merged v0.2 on `develop` and implement on `feature/v0.3-throughput-logistics`.
- Preserve the original M6/M7 rules for legacy saves already active in these missions; use v0.3 rules for new campaigns.
- Maintain deterministic physical sales, fixed economics, and save/restore behavior. No new mechanics outside the approved scope.

## v0.2 implementation baseline (historical)

The approved contract is [v0.2 Specification](specifications/v0.2.md), decision rationale in [ADR-0002](decisions/0002-v0.2-metallurgy-and-unlocks.md).

- v0.2 was implemented after merged v0.1 on `develop` in a separate feature branch.
- Preserve deterministic production, the 58.50 Cr/min v0.1 reference baseline, and all v0.1 saves.
- Run typed-input, two-source, coal, gear, steel, conservation, and payback scenarios before adding UI.
- The numerical economy model is an approved starting hypothesis, **not** a verified result; any balance change must be recorded and reviewed.

## v0.4 First Signal — in progress

The [approved specification](specifications/v0.4.md) and [implementation backlog](implementation/v0.4-tasks.md) govern the feature branch `feature/v0.4-first-signal`. [ADR-0004](decisions/0004-electronics-and-power.md) is a proposal, not an accepted numerical freeze. [WP0 baseline and traceability](validation/v0.4-wp0-baseline.md) identifies evidence gaps and candidate-only economics. Work package order: WP0 → WP1 → WP3 → WP2 → WP4 → WP5 → WP6; require owner approval after each WP and explicit economic/coordinate approval after WP3. v0.4 is **not released**.
