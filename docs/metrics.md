# Metrics

The words the dashboards and the experiments report use.

| metric | definition |
|---|---|
| visitor | one visitor id with a `page_view` |
| conversion rate | visitors with at least one order, divided by visitors |
| revenue | subtotal, less discount, plus shipping charged. Tax is collected for the state and is never revenue |
| refund | reverses the revenue of the order. The goods and the carrier cost are not recovered |
| cost of goods | the catalogue's cost for each item sold |
| carrier cost | what the shop pays the carrier for an order (`CARRIER_COST_CENTS`), whether or not the shopper paid for shipping |
| payment fees | `FEE_RATE` of the order total plus `FEE_FIXED_CENTS` |
| contribution margin | revenue kept, less cost of goods, carrier cost and payment fees |
| margin per visitor | contribution margin divided by visitors |
| average order | revenue kept divided by orders |
| CAC | channel spend divided by the customers that channel brought |
| ROAS | channel revenue divided by channel spend |
| funnel | unique visitors at `page_view`, `product_view`, `add_to_cart`, `checkout_start`, `purchase` |

Money is stored and computed in whole cents. A float never holds a price.

These definitions name the constants in the code rather than repeating their values: the code
is where a value lives, and the code graph carries it into memory.

## Experiments

- At least 400 visitors in every variant before a decision.
- The sample-ratio check runs first. If the split is off, the experiment is
  `invalid` and its numbers are ignored.
- The guardrail is margin per visitor: a treatment may not cost more than 2% of
  it, however well it converts.
- One experiment's visitors are split independently of another's.
