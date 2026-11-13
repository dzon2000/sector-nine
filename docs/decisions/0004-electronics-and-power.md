# ADR-0004 — Deterministic Electronics and Site-Wide Power (Draft)

**Date:** 2026-11-13
**Status:** proposed; numerical values and deposit coordinates unapproved until WP3 owner sign-off
**Specification:** [v0.4 First Signal](../specifications/v0.4.md)
**Backlog:** [v0.4 TDD tasks](../implementation/v0.4-tasks.md)

## Context and decision

Chapter II adds copper, silicon and circuits without changing historical factory economics or the 12×12 terrain. A circuit fabricator consumes two physical copper ore and one physical silicon per circuit. A coal generator accepts coal through ordinary directional transport and distributes abstract site-wide power. Only circuit fabricators require power in v0.4. No cables, adjacency topology, batteries or offline simulation.

The following **phase contract is a proposed implementation decision**, to be tested headlessly in WP1 and approved alongside final parameters at WP3. All work occurs within a single deterministic `tick`, never React, real time or rendering.

## Proposed authoritative active-tick contract

1. **Precondition:** paused ticks do nothing. Clone prior state and advance integer tick once. Record available generators' *beginning-of-tick* stored fuel and fabricators' existing active cycles.
2. **Power availability:** a generator with positive carry-over `fuelTicksRemaining` supplies its full rated capacity. Decrement its fuel counter once for this powered tick, irrespective of consumer usage. Do **not** consume new coal at this stage. A generator with no prior fuel contributes zero.
3. **Demand and fair allocation:** each fabricator with a previously started, unfinished cycle (`cycle > 0`) and no blocked output requests one unit for the processing phase. Order requesting fabricators by stable numeric entity ID, with a persisted round-robin cursor selecting the first requester strictly after the last served ID; wrap, grant up to aggregate supply, and persist the last granted ID. Make results independent of array/render order. No demand from an idle/no-input/blocked-output fabricator. Supply is capacity available this tick, not electricity carried forward.
4. **Production:** granted fabricators decrement one cycle tick. Unserved fabricators do not advance, do not consume reserved inputs and increment `unpoweredProcessingTicks` once per requesting entity-tick. Completion and output-blocking obey the existing material ledger. Old processors and mines advance exactly as before.
5. **Transport:** resolve existing snapshot-based, directional requests and stable terminal/belt arbitration, one terminal intake at most per tick. Coal delivered to a generator becomes inventory now, *not active electrical supply in this tick*. Generator input is physical and subject to type/capacity and backpressure constraints.
6. **Fuel loading and cycle start:** when a generator has zero fuel remaining and physical buffered coal, consume one coal into its tracked fuel counter `fuelTicksPerCoal`. Its first powered tick is the **next** active tick. Record coal as `burned` (new additive material-ledger event) at loading, not a sale; validate material conservation. Start eligible fabricator cycles only after transport/reservation, as legacy processors do; newly started cycles first request power next tick.
7. **Accounting/observations:** aggregate generated supply, processing demand, units served, deficient fabricator-ticks, consumed coal and terminal sale events for this completed active tick. Update deterministic mission history and diagnostics. Operating costs charged only on the precisely defined new production/fuel events (subject to WP3 fee approval), never for blocked or unpowered phantom output.

**Boundary cases:** Fuel loaded at tick T generates no supply at T; first supply at T+1. A one-tick balance generates once and then expires. If output is blocked when a cycle reaches zero, preserve output and reservations without duplication. Save exact generator fuel counter, fabricator cycle/reservations, power cursor and bounded power history. Reload must produce identical state/events. Generator coal buffer capacity and overload validity need explicit tests.

**Fairness:** persisted cursor is an allocation policy, not an electricity scheduler tied to entity ordering. When capacity is one and two fabricators request continuously, allocation alternates across ticks; object order and UI refresh cannot influence results. The policy must be validated against interrupted requests and save/reload.

## M10 interpretation (draft)

A mission tick is **demand-covered** only if at least one circuit fabricator requested a processing unit *and every such request was served* (`demand > 0 && served === demand`). A tick with `demand = 0` counts as **not covered**, never as available capacity. A post-activation trailing 60 **active-tick** window must be complete before evaluation. For each evaluated tick, candidate thresholds are sales of at least 11 circuits and 5 steel within that window, and at least 57 demand-covered ticks out of the same 60. A qualifying window increments the consecutive streak by one; a failed window resets it; candidate streak threshold 60. Recorded terminal sales, not produced or stockpiled units, count. Paused/offline time never advances any window. Preserve the rolling window, activation epoch, evaluation guard and streak on reload. WP3 must prove physically possible layouts and that stockpile-only sales cannot bypass sustained-production intent.

## Compatibility and exclusions

M1–M7 use unchanged old economics and historic mission-rule semantics. Maintain existing `missionRuleVersion` 2/3 for active M6/M7. Chapter II has independent v4 rule context; `DONE` at Chapter I remains a durable achievement and explicit **Begin Chapter II** is required. Schema migration must add new item/ledger/power fields without replacing inventory, relabeling sales, relocating old structures or erasing failed loads. Occupied deposits are revealed but must not displace old entities.

Defer cable topology, wires/wafers, batteries, energy distribution loss, old-machine power requirements, offline time, random outages and new maps.

## Candidate experiments (not a release commitment)

- Copper deposit candidate A `(8,2)`; silicon candidate A `(8,9)`. Alternate B copper `(5,2)`, silicon `(9,9)`. Existing iron: `(3,5),(2,2),(2,9)`; coal `(7,9),(5,9)`; terminal `(10,5)`. Candidates are merely unoccupied *terrain locations in an empty base map*, not proof of constructibility or recoverability from occupied v0.3 DONE layouts.
- Provisional model for WP1 probes only: copper extractor 1 ore/3 active ticks, silicon extractor 1 silicon/4 ticks; circuit 2 copper + 1 silicon per 6 **powered processing** ticks; generator 1 unit/tick, 12 powered ticks/coal. Economic prices/operating costs and research fees are stated in the WP0 baseline report and require WP3 physical tests.
- Power and transport timing above, arbitration fairness and demand coverage remain subject to falsification by real-engine boundary tests.

## Validation and decision

WP1 implements red-first isolated engine tests; WP3 constructs physical M8/M9/M10 factories, tests upper bounds, failing fixtures, transfer contention and capital recovery from genuine v0.3 DONE state. No numerical/coordinate freeze or WP2 progression before explicit owner approval of the tested set. Any modification to old economics or incompatible migration is a stop condition.
