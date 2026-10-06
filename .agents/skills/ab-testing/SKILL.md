---
name: ab-testing
description: "Use when asked to build, extend or judge an A/B test in this shop: how assignment, exposure, the report and the decision fit together, which past experiments and incidents to check first, and how to prove the work with the acceptance check."
---

# Building an A/B test in this shop

`docs/ab-testing.md` says what the shop must do. This is how to get there
without repeating what went wrong before.

## 1. Ask memory first

- `cortex_recall` for `experiments`, `exposure`, `sticky` and `guardrail`: the
  incidents and past results are there. The pattern to expect: a discount lifts
  conversion and costs margin.
- `cortex_impact` on `storefrontConfig` and on `EVENT_NAMES`: those are where
  assignment and exposure attach.
- `cortex_impact` on `shippingFor` before any test that moves the free-shipping
  threshold.

## 2. Plan the pieces, each small

| piece | where it belongs |
|---|---|
| the experiments and their variants | one new module, `src/experiments.mjs` |
| assignment from visitor id and experiment key | the same module; a pure function |
| what each variant changes on the page | `src/flags.mjs`, which already builds the storefront settings |
| the `exposure` event | `src/events.mjs` registers event names; record it once per visitor and experiment |
| the numbers per variant | `src/analytics/experiments.mjs`, built on `orderEconomics` for margin |
| the statistics | `src/analytics/stats.mjs`: two-proportion z-test, a normal approximation for means, a sample-ratio check |
| the route | `src/app.mjs`, in the route table |
| the tab | `web/admin.js` (see the `analytics-dashboards` skill) |

## 3. Rules the history teaches

- **Sticky, by hash.** Assignment is a pure function of visitor id and
  experiment key. A random draw per request puts one person in both arms.
- **Independent.** The experiment key is part of the hash.
- **Log exposure once.** Count a visitor from their first exposure.
- **Check the split before the result.** A broken split makes every other
  number meaningless.
- **Judge on what the shop keeps.** Conversion alone is a vanity metric here;
  the guardrail is margin per visitor.
- **Do not ship on one p-value.** Respect the minimum sample, and remember
  that three experiments mean three chances for a false win.

## 4. Prove it

1. `npm test`, with tests for assignment (sticky, even, independent), exposure
   (once) and the decision (each branch, with a control where it should not
   fire).
2. `npm run accept`. Read the failures: each names what is missing.
3. Open the admin page and the Experiments tab.

## 5. Keep what you learned

When the three decisions are in, `cortex_remember` one fact per experiment:
its key, what happened, and the decision, so the next test starts from it.
