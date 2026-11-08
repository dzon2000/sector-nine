# Economy — Initial Hypotheses

**Status: unvalidated.** All values here are proposed for v0.1, not confirmed balance.

## Currency and accounting

- Currency: `Cr` (credits).
- Internal storage: integer cents (e.g. 300 Cr = 30,000 cents).
- Initial cash: **300.00 Cr**.
- Capital expenditure: buying machines; reduces cash, not operating profit.
- Operating costs: charged when a unit is successfully produced or enters a conveyor cell.
- Revenue: booked only when an item is consumed by the sales terminal.
- Operating profit: revenue minus production and transport costs, shown over a rolling 60-tick window after the window is complete.
- Operational debt is allowed; new capital purchases require sufficient cash.
- Demolition refunds 75% of original construction cost, rounded down to a cent.

## Draft balancing table

| Asset | Build cost | Capacity or rate | Operating cost |
|---|---:|---|---:|
| Iron mine | 45.00 Cr | 1 ore / 2 ticks; output buffer 1 | 0.60 Cr / ore |
| Furnace | 80.00 Cr | 2 ore -> 1 ingot / 4 ticks; input 4, output 1 | 1.60 Cr / ingot |
| Conveyor | 5.00 Cr | 1 item per tile, up to 1 tile per tick | 0.05 Cr / accepted item |
| Sales terminal | Prebuilt/free | Up to 1 sale per tick | 0 |

**Static sale prices:** iron ore 2.00 Cr; iron ingot 7.00 Cr.

## Reference line

Build on the fixed 12x12 map:

```text
(3,5)       (4,5)       (5,5)       (6,5)-(9,5)      (10,5)
iron mine -> belt    -> furnace  -> four belts    -> sales terminal
   E           E           E             E
```

Capital cost: 45 + 80 + 5 * 5 = **150 Cr**.

Expected after warm-up with no congestion:

| Metric | Per 60 ticks |
|---|---:|
| Ore extracted | 30 |
| Ingots sold | 15 |
| Revenue | 15 * 7.00 = 105.00 Cr |
| Mining cost | 30 * 0.60 = 18.00 Cr |
| Smelting cost | 15 * 1.60 = 24.00 Cr |
| Ore transport cost | 30 * 1 * 0.05 = 1.50 Cr |
| Ingot transport cost | 15 * 4 * 0.05 = 3.00 Cr |
| **Operating profit** | **58.50 Cr** |

This is a **theoretical steady-state target**, not a verified result. It excludes one-time construction cost from operating profit. Warm-up, phase boundaries, and conveyor semantics must be tested before approval.

## Economic challenges to validate

1. Does the reference line reliably reach expected output after initial buffering?
2. Can the player complete the ore-selling tutorial task without being left unable to afford the furnace?
3. Is direct ore selling economically inferior to efficient smelting at reasonable path lengths?
4. Can a player rebuild after mistakes without hard-locking progress?
5. Are blocked buffers charged only for actual successful work?
6. Does the M4 profit target remain achievable in a simple, understandable layout?

No balance number is final until the [Validation Plan](validation-plan.md) passes.
