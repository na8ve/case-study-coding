# A/B testing in the shop

The shop cannot run experiments yet. This is what it has to do, and
`npm run accept` checks every line of it.

## Three experiments

| key | variants | what the shopper sees |
|---|---|---|
| `free_ship_banner` | `control`, `banner` | `banner`: a line above the page naming the free-shipping threshold, taken from `FREE_SHIPPING_THRESHOLD_CENTS` so the two cannot disagree |
| `first_order_discount` | `control`, `fifteen_off` | `fifteen_off`: the coupon `WELCOME15` is applied at checkout without the shopper typing it |
| `button_color` | `control`, `green` | `green`: the add-to-cart button is green instead of blue |

Each experiment splits visitors 50/50.

## Assignment

- A visitor's variant is **sticky**: the same visitor always gets the same
  variant of an experiment, on every request and on every day.
- Experiments are **independent**: being in `banner` says nothing about being
  in `fifteen_off`.
- The split comes from the visitor's id and the experiment's key, never from a
  random number drawn per request.

## What the storefront returns

`GET /api/storefront?visitor=<id>` already returns the page's settings. It
must also return:

```json
{
  "banner": null,
  "autoCoupon": null,
  "cta": { "label": "Add to cart", "color": "<the button colour>" },
  "freeShippingThresholdCents": "<FREE_SHIPPING_THRESHOLD_CENTS>",
  "experiments": { "free_ship_banner": "control", "first_order_discount": "control", "button_color": "control" }
}
```

- `banner` is a string for `banner` visitors and `null` for everyone else.
- `autoCoupon` is `"WELCOME15"` for `fifteen_off` visitors and `null` for
  everyone else. Checkout and the quote use it; the existing coupon rules still
  decide whether it applies.
- `cta.color` differs for `green` visitors.
- `experiments` names the visitor's variant in every experiment.

## Exposure

The first time a visitor is given a variant, record an `exposure` event with
`props: { experiment, variant }`. Record it **once** per visitor and
experiment, however often the storefront is requested.

## The report

`GET /api/admin/experiments` returns `{ experiments: [...] }`, one entry per
experiment:

```json
{
  "key": "first_order_discount",
  "variants": [
    { "name": "control", "visitors": 0, "purchasers": 0, "conversionRate": 0,
      "revenuePerVisitorCents": 0, "marginPerVisitorCents": 0 }
  ],
  "lift": 0,
  "pValue": 1,
  "srm": { "pValue": 1, "ok": true },
  "decision": "keep_running"
}
```

- A visitor counts in the variant of their **first** exposure, and a purchase
  counts for them whenever it happens.
- `lift` is the relative change in conversion rate of the treatment over
  `control`; `pValue` is for that conversion difference.
- `marginPerVisitorCents` uses the same contribution margin as the finance
  dashboard (`docs/metrics.md`).
- `srm` is the sample-ratio check: whether the visitors split the way the
  weights say they should.

## The decision

| decision | when |
|---|---|
| `invalid` | the sample-ratio check fails (p below 0.001): the split is broken, so nothing else can be trusted |
| `keep_running` | fewer than 400 visitors in any variant, or no clear result |
| `stop` | margin per visitor is below control by more than 2%, and the drop is statistically clear (one-sided, 5%) |
| `ship` | not stopped, and conversion or revenue per visitor is clearly higher (5%) |

A treatment that lifts conversion can still be stopped: the guardrail is about
what the shop keeps, not what it sells.

## The dashboard

The admin page gets an **Experiments** tab showing each experiment's variants,
lift, p-value, sample-ratio check and decision.

## Done means

- `npm test` passes, with tests for assignment, exposure and the decision.
- `npm run accept` passes.
- The Experiments tab loads in the browser.
