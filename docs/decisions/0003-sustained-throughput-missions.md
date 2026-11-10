# ADR-0003 — Sustained Throughput Missions and Legacy Save Compatibility

**Date:** 2026-11-10  
**Status:** accepted  
**Specification:** [SEKTOR 9 v0.3](../specifications/v0.3.md)  
**Implementation backlog:** [v0.3 TDD Tasks](../implementation/v0.3-tasks.md)  
**Design issue:** [#3](https://github.com/dzon2000/sector-nine/issues/3)

## Context

The v0.2 M6 and M7 objectives require cumulative deliveries and can be completed largely by waiting for credits and production. The v0.2 playtest reported 423 active simulation ticks over 8 minutes for M5–M7, with little meaningful factory reconfiguration. v0.3 must require deliberate capacity expansion and parallel production, while preserving previous players' progress and the established deterministic economy.

## Decision

- Keep M5 unchanged: 10 actual coal sales through the terminal.
- For new campaigns, M6 requires **at least 9 gear terminal sales in each trailing 60 active ticks for 120 consecutive active ticks**.
- For new campaigns, M7 requires the permanent `advanced_smelting` unlock and, simultaneously, **at least 7 gears, 7 steel and 17,500 cents of operating profit in each trailing 60 active ticks for 120 consecutive active ticks**.
- All mission rolling windows start after mission activation; only a full 60-tick mission-local window may be evaluated. Failed evaluated ticks reset the stability streak. Paused time, hidden-tab inactivity, and elapsed wall-clock time never advance simulation.
- Physical terminal sales are the source of item counts. Operating profit excludes construction, demolition refunds, and research payments.
- Persist the mission rule version, activation/window state, and streak in a validated versioned save schema. Preserve the existing money, inventories, reservations, arbitration state, unlocks, counters and completed missions.
- Existing v0.2 saves active in M6 or M7 retain the original cumulative sell-8-gears or sell-8-steel rules and earned partial progress. Existing active M5 saves finish M5 unchanged, then adopt v0.3 M6. Existing `DONE` saves remain completed.
- Provide deterministic, simulation-derived bottleneck and throughput diagnostics. Keep playtest wall-clock and player-decision measurements optional and outside the simulation.
- Do not change prices, recipes, cycle times, construction costs, refunds, technology costs, map geography, or physical transport rules. Storage, offline progression, generators, new resources and chapters are out of scope.

## Rationale

A one-chain gear setup produces approximately 7.5 gears/minute and cannot sustainably satisfy the 9-gears/minute threshold; additional ore and smelting capacity is required. M7's concurrent product and profit conditions encourage allocation across two independent chains. Using mission-local, event-based measurements prevents old sales from satisfying new missions. Retaining legacy rules for already-active missions avoids retroactive difficulty increases.

Exploratory reference fixtures and profit projections in the specification are planning evidence, **not confirmed TypeScript engine test results**. WP3 must independently validate feasibility, cash recovery and stockpile resistance before release.

## Consequences and validation

- WP1 introduces headless deterministic rolling metrics and save versioning; WP2 applies mission rules and migration compatibility.
- WP3 must prove qualifying layouts using the real engine and retain v0.1/v0.2 reference economy regressions.
- WP4 and WP5 expose actionable diagnostics and opt-in playtest measurements without affecting engine determinism.
- Stop for product-owner review if frozen thresholds prove infeasible, migration loses state, stockpiling bypasses the stability gate, or unavoidable softlocks are discovered.
- No silent retuning or completed-mission revocation is permitted.
