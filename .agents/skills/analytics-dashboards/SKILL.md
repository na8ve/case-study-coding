---
name: analytics-dashboards
description: "Use when asked to add or change an analytics dashboard in this shop (customer behavior, marketing, finance, experiments): where the numbers are computed, how a tab is registered, the drawing helpers to reuse, and the checks that keep a dashboard honest."
---

# Dashboards in this shop

Three dashboards exist: **customer behavior**, **marketing** and **finance**.
Each is a report function, a route, and a tab.

## The shape

1. **A report function** in `src/analytics/`, taking the store and returning
   plain numbers and arrays. It reads `store.events` and `store.orders` and
   writes nothing. Margin and revenue come from `orderEconomics`: never
   recompute them.
2. **A route** in the route table in `src/app.mjs`: `GET /api/admin/<name>`
   with a small handler that calls the report function.
3. **A tab** in `web/admin.js`: an entry in `VIEWS` with a `label`, an
   `endpoint` string and a `render(report)` that returns DOM nodes.

The browser never works from raw events: the report is computed on the server.

## Reuse, do not rewrite

- `tileRow`, `drawBars`, `drawLine` and `table` already draw what the three
  dashboards need. Put text in with `textContent`, never `innerHTML`.
- `money` formats whole cents. A dashboard never divides cents by 100 itself.
- Colours come from the CSS variables in `web/styles.css`, so light and dark
  both work.

## Ask memory before you add a number

- `cortex_impact` on the report function you will call or the field you will
  read. A field ending in `Cents` or `Rate` is followed from where it is built
  to everything that reads it.
- `cortex_recall` for the metric's name: a definition or a past incident may
  already say how it is counted.

## Checks

- A test for the report function with the simulator's traffic: a number that
  must add up (channels to total revenue, funnel stages that only narrow) and a
  control where the answer should be zero or empty.
- Open the page and read every number once against the report's JSON.
- `npm test` and `npm run accept` still pass.

## Marketing and customer-behavior ideas the data supports

Cohorts by first channel, repeat purchase rate, cart abandonment by device,
CAC against average order, payback by channel, refund rate by coupon. Each is
a report function over the same store.
