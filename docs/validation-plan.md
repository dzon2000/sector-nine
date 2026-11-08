# Validation Plan — Before Playable v0.1

**Objective:** validate the mathematical and systemic assumptions before investing in a full UI.

## Validation order

### Phase A: Formalize state and invariants
- Agree on the one-second tick contract and precise machine/belt buffer behavior.
- Every unit has one owner at a time: production output, conveyor, machine input, or terminal consumption.
- Each item moves at most one tile per tick.
- Monetary entries are integer cents.
- No revenue without a sale; no operating cost without a successful operation.
- Collision resolution is deterministic and fair.
- Pausing and save/restore do not alter the result of a fixed logical sequence.

### Phase B: Headless model
Implement a minimal non-visual test harness for input sequences, ticks, and periodic state snapshots (in the dedicated implementation chat, not this design chat).

Required experiments:
1. **Reference line:** mine (3,5), belt (4,5), furnace (5,5), belts (6–9,5), terminal (10,5).
2. **Direct sale:** compare ore-only path and smelting path after steady-state.
3. **Blocked output:** verify backpressure; no item duplication/loss or charged failed production.
4. **Contested inputs:** two upstream sources, one downstream belt; test fair arbitration.
5. **Budget recovery:** sell ore, purchase furnace, rebuild while keeping a route to revenue.
6. **Save equivalence:** run X ticks, snapshot and restore, run Y ticks; compare with uninterrupted X+Y.
7. **Tutorial feasibility:** simulate the M1–M4 goals without external balance adjustments.

### Phase C: Criteria for economic approval
- Reference layout reaches ~30 ore mined and ~15 ingots sold per steady-state minute.
- Reference steady-state operating profit matches **58.50 Cr/min** within explicit tick-window conventions.
- No items appear or disappear unexpectedly; expected consumption/sales/demolition are accounted for.
- Tutorial is feasible at **300 Cr** and can recover from foreseeable mistakes.
- M4 threshold **50 Cr/min** can be sustained; no soft-locks due to capital/debt behavior.
- Any deviations result in a revised, recorded spec and a repeatable test.

### Phase D: Human onboarding playtest
After technical gates pass, test 5–10 fresh-user runs:
- Understand goal and controls without developer assistance.
- Reach first sale and first ingot without dead ends.
- Interpret why profit changes and why a conveyor is blocked.
- Complete the prologue without repetitive clicking.

## Deliverables

- Deterministic test fixture for the reference line.
- Recorded production/revenue/cost tables.
- List of found balance/transport edge cases.
- Approved changes to spec constants, with rationale.
- Explicit decision to begin v0.1 UI work.

No numeric balance claim is considered verified until tests have actually been executed.
