# ADR-0005 — Experimental Directional Splitter for First Signal

**Status:** PROPOSED — Option A investigation authorized on 2026-11-14; **not approved/frozen**.
**Scope:** WP3 physical economic validation only. No WP2 progression, game UI, PR merge or release.
**Related:** [ADR-0004](0004-electronics-and-power.md), [WP3 amendment evidence](../validation/v0.4-option-a.md), [original WP3 report](../validation/v0.4-economy.md).

## Problem

With one candidate copper deposit extracting one ore per three ticks, total copper production is 20/60; eleven circuits consume 22 ore/60. The old conveyor transport has one fixed directional output and cannot distribute a single ore stream across two fabricators while preserving per-item physical movement. M10's approved *design intent* is an expanded, genuinely powered electronics line rather than a threshold that a lone fabricator can satisfy.

## Experimental design: splitter (new type, not approved content)

- Candidate price **900 cents (9.00 Cr)**. Uses ordinary single-slot `belt: Item|null`; never stores extra or duplicates cargo.
- Facing direction F determines two legal outputs: **F (forward)** and **clockwise(F)**. Input can arrive from adjacent machines under existing target occupancy/arbitration semantics.
- A persistent `splitterNext: 0|1` determines the preferred outlet (0 forward, 1 clockwise).
- On each active tick, a nonempty splitter proposes **at most one** transfer, preferring its saved outlet. If that destination is not immediately accepting, attempt the other. If neither is accepting, retain the item and cursor, with no movement or operating cost.
- **Only on an approved physical transfer:** clear source once, accept at the chosen target once, charge the existing conveyor movement fee **5 cents** if destination is a conveyor/splitter, and set cursor to the *other* outlet. No cursor advancement for an unapproved transfer.
- Destination arbitration is still stable numeric entity ID; an occupied moving belt does not become a speculative splitter destination in the current prototype (conservative rather than predictive backpressure). A newly received splitter item can leave no earlier than next active tick.
- Rotation changes which two tiles are legal outputs but does not reset cursor, contents or ID. Demolition explicitly destroys any held material through the existing ledger, with 75% normal price refund.
- Save snapshots retain `splitterNext`. `validateSave` rejects missing/invalid cursor, nonempty non-belt inventory, incompatible cycle/output fields, or a splitter cursor attached to another kind. The WP2 full v4 schema migration is explicitly deferred.

## Provisional extraction adjustment

**Copper Mine: 1 ore / 2 active ticks instead of 1 / 3**, while the existing provisional 70-cent operating cost per produced ore remains unchanged. Upper steady-state supply becomes 30 ore/60 ticks, enough for up to 15 circuits/60 at the approved 2:1 circuit ingredient ratio. This changes **only** new copper extraction, not the prior iron/coal/gear/steel economy.

The other new-system candidates remain as in [WP0](../validation/v0.4-wp0-baseline.md): silicon 1/4 ticks, circuit 2 copper + 1 silicon / 6 powered processing ticks, generator 1 unit/tick, 12 ticks/coal, copper/silicon sites (8,2)/(8,9), original terminal (10,5), candidate new equipment and research fees, and M8/M9/M10 thresholds. All remain provisional.

## Physical validation requirements before sign-off

1. Two real circuit fabricators, two coal-fed generators, split copper and silicon feeds, and a real steel line must fit 12×12 with no overlapping entities, old-deposit edits, injections or terminal bypass.
2. Once warmed, a complete 60-tick trailing window must have >=11 physical circuit sales, >=5 steel sales and >=57 covered *nonzero demand* ticks, **for >=60 consecutive evaluated ticks**; zero demand never counts.
3. Both outputs are audited, alternating when both available, deterministic after save/reload and object reorder, and conserve every material item.
4. One fabricator, one generator, fuel-starved, steel-less, and inactive-power/stockpile-only variants must fail qualification.
5. Rebuild the expanded layout from an engine-derived v0.3 DONE factory with actual paid commands and a separately labeled *projected* fee debit for the three WP2 research actions that do not yet exist. No 1,000,000-cent isolated fixture counts as economic evidence.
6. Explicit owner approval is required to move from experimental prototype to normative splitter, copper rate, price, coordinates and the original M8–M10 numerical targets. Confirm a separate answer for the stockpile anti-exploit policy.

## Trade-offs and open questions

- A 12×12 physically viable design may be expensive in board operations; one validated proof requires roughly 73 post-demolition placements. It is not necessarily an enjoyable UI experience.
- The prototype preserves conservative transfer rules for blocked outputs; more sophisticated predictive chain scheduling is out of scope.
- Current WP1 `place()` does not enforce future Chapter II unlocks. Propose exposing Splitter after **Circuit Fabrication** in WP2, but this is a separate progression decision, not implemented.
- **Confirmed:** four pre-activation circuits routed during M10 plus one real powered under-capacity fabricator yield 63 consecutive sales-only qualifying windows. A separate **new-mission-only circuit production-window condition (>=11 newly produced circuits/60 active ticks)** is proposed; owner approval required before WP2 implementation. Do not change old mission rules.
- The new kind is mapped to a placeholder renderer glyph solely to keep the TypeScript build exhaustive; WP4/WP5 own actual interaction and presentation.

**Disposition:** ADR remains proposed pending owner review. Keep WP2, old economy, map expansion, merges and release blocked.
