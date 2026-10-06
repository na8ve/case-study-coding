# Memory for a coding agent

### A case study of one working session: planning a change, keeping memory true, and analyzing a live shop

*Case study whitepaper. System under study: na8ve agent with Cortex memory, working in the
Tidewell Goods repository. The shop, its customers and its orders are synthetic.*

---

## Abstract

A coding agent is usually asked two kinds of question: *what will this change touch?* and *what is
the business doing?* The first is a question about code and the team's history. The second is a question
about a running system. This case study follows one terminal session of five prompts in which na8ve
agent, with its memory held in Cortex, answered both about a small online shop.

On the code question, memory turned a one-function question into a ranked reach (callers, tests, the
money fields the dashboards read through it) and the team's decisions, incidents and experiments
about it, so the agent opened about 5 KB of a 43 KB codebase and named seven of the team's notes by id. On
keeping memory true, the session exposed a gap: after a one-line change, the agent withdrew part of the
team's record and wrote a hand-made copy of a value. On the business question, the agent read the live
shop's reports through its shell and produced a useful analysis, **without consulting memory**, and the
analysis contains four errors that the shop's own reports and code reveal. Memory held what would have
prevented or qualified several of them.

The study reports what happened, measures what can be measured, and states what it cannot show.

## Key findings

1. **Memory made the change plan small and specific.** One question produced 4 recalls, 3 impact reads,
   3 short code reads and a seven-step plan that named DEC-0003, DEC-0007, DEC-0011, DEC-0012,
   INC-014, INC-021 and EXP-003, and applied the margin guardrail, the 400-visitor floor and the
   sample-ratio check from `docs/metrics.md`.
2. **Memory that repeats a value from the code goes stale, and an agent will repair it by
   retracting.** A threshold's value sat in a team note; the code graph held no values. The agent
   retracted the note, which was history, and added a second copy of the value.
3. **The agent used memory for the question that named code and not for the one that named money.**
   No memory call was made in the growth analysis, although the team's notes bear on four of its
   six recommendations.
4. **Live data and memory answer different questions.** The shop's routes say what happened; memory
   says what the code does and what the team decided. A growth analysis needs both, and the agent
   used one.
5. **The analysis was a good first pass with checkable errors.** The marketing report spanned 35
   days against 14 simulated, inflating spend by 2.5 times; "best selling" was answered without units
   sold; one product was misattributed; a flat margin line was called a decline.
6. **A single added sentence in the prompt is the cheapest remedy:** *recall what this team has
   learned before you recommend.*

---

## 1. Introduction

### 1.1 The questions

| | question | where the answer is |
|---|---|---|
| RQ1 | Can an agent plan a change to unfamiliar code by reading little of it? | the code graph and the team's notes in memory |
| RQ2 | Does memory stay true when the code changes? | the sync between the repository and memory |
| RQ3 | Does the agent bring the team's history to a business decision? | memory, if the agent asks it |

### 1.2 Why a shop

Tidewell Goods is small enough to read in an afternoon and large enough to have the shape of a
real application: a storefront, an order pipeline, three analytics dashboards, a traffic simulator, and
a team's history of decisions, incidents and experiments. It can run no A/B tests yet, so there is a
real feature to plan. It reports money in several places, so there are real numbers to reconcile.

## 2. The system under study

### 2.1 The webapp

Tidewell Goods is written in plain Node with no framework and no database. Its store lives in the
server's memory, so restarting the server empties the dashboards.

| part | what it is |
|---|---|
| storefront | `/`: twenty products in four categories (kitchen, outdoor, desk, home), a cart, a quote and a checkout. Each page load records a `page_view` carrying the visitor's channel (from `utm_medium`) and device (from the viewport) |
| storefront settings | `GET /api/storefront?visitor=…`: the free-shipping threshold, an optional banner and an optional automatic coupon a visitor sees. It is where an experiment's variant would attach |
| checkout | `POST /api/quote` and `POST /api/checkout` apply the discount, judge shipping on the discounted subtotal, then add tax, and write an order. `POST /api/orders/refund` reverses one |
| dashboards | `/admin`: **behavior**, **marketing** and **finance** tabs. Each is drawn from the report its route returns; the browser never computes a metric |
| simulator | `sim/`: deterministic shoppers who react to the page and the price. **Simulate 1,000 shoppers** on the admin page adds them to the running store |
| definitions | `docs/metrics.md`. Money is whole cents everywhere |

### 2.2 The metrics the shop generates

| report | route | contents |
|---|---|---|
| behavior | `GET /api/admin/behavior` | unique visitors; the funnel (`page_view`, `product_view`, `add_to_cart`, `checkout_start`, `purchase`) as unique visitors with the rate from the start and from the previous stage; conversion by device; five products with views, adds and add rate, ranked by views; page views per day |
| marketing | `GET /api/admin/marketing` | per channel (organic, paid search, email, social, referral): visitors, orders, customers, conversion, revenue, spend, CAC, ROAS; and the number of days spanned |
| finance | `GET /api/admin/finance` | orders, revenue, cost of goods, carrier cost, payment fees, discounts, refunds, contribution margin and its rate, average order, daily revenue and daily margin |

Four properties of these reports govern how any number from them should be read:

- **Revenue is what the shop keeps.** A refunded order counts as zero revenue, but its goods and its
  carrier cost remain in the costs. The finance report's `orders` includes refunded orders; the
  marketing report counts only the kept ones.
- **Contribution margin** is revenue kept, less cost of goods, carrier cost and payment fees. Marketing
  spend is not in it.
- **Marketing spend is a daily rate multiplied by the number of days the events span**, from the first
  event to the last.
- **The behavior report ranks products by views** and returns five. No report gives units sold or
  revenue per product.

### 2.3 The agent and its memory

**na8ve agent** is a terminal agent: a model of the developer's choice, a shell, file tools, and an
extension that connects it to Cortex. The case study's folder adds three skills (changing the shop with
memory, building an A/B test, building a dashboard).

**Cortex** holds the case study as memory in three parts:

| part | what it holds | how it is written |
|---|---|---|
| **the code graph** | what defines, imports, calls, reads, handles, requests and tests what, each with a file and line range, and the value of a plain constant | generated from the source by `tools/code-graph.mjs` |
| **the team's notes** | twenty notes (eleven decisions, five incidents, four experiments), written by people | `memory/knowledge/` |
| **the docs** | the metrics' definitions, the A/B task, the user guide | `docs/` |

The agent reaches it through six tools:

| tool | use |
|---|---|
| `cortex_recall` | search memory; each result carries a reference the agent cites |
| `cortex_impact` | for a function, route or module: what depends on it, which tests cover it, what the team wrote about it, with `file:lines` |
| `cortex_explain` | resolve a *why* question over what memory holds |
| `cortex_remember` | keep a fact; a subject key replaces an older fact on the same subject |
| `cortex_show` / `cortex_retract` | read one memory; withdraw one for good, after confirmation |
| `cortex_code_sync` | after an edit and a refreshed code graph, bring memory in step |

### 2.4 The two sources

The agent has two ways to learn about the shop, and they answer different questions.

| source | how it is read | answers |
|---|---|---|
| **the live shop** | the shell: `curl` to the running server's routes, and reading files | *what happened*: visitors, funnel, revenue, margin by day |
| **Cortex** | the memory tools | *what the code does and what the team decided*: what depends on a rule, what a guardrail is, what was tried |

## 3. Method

### 3.1 The session

One terminal session in the shop's folder, five prompts, run on one date. The agent's model was the
developer's own. Nothing in the session was scripted or rehearsed.

| # | prompt | purpose |
|---|---|---|
| 1 | What would an A/B test of the free-shipping threshold touch, what could break, what has gone wrong before? | RQ1 |
| 2 | Launch the site on localhost | setup |
| 3 | Change the threshold | a change to keep memory true after |
| 4 | Has our memory been updated with this change? | RQ2 |
| 5 | Analyze 143,064 simulated visitors: lifetime value, best sellers, the flat daily revenue and margin trends | RQ3 |

### 3.2 What was measured

- **Tool calls per prompt**, from the session's own record, and which of them were memory calls.
- **Tokens per prompt**, as the model provider reported them (new input and output).
- **Code read**, in bytes, against the size of the shop's source, simulator and pages (about 43 KB).
- **The claims of the analysis**, checked against the three reports the agent had fetched and the code
  that produces them.

### 3.3 What was not done

Nothing was re-run for this study. The simulation was not repeated, no experiment was built, and the
figures in §4.4 that differ from the agent's are arithmetic on the reports it fetched and a reading
of the code behind them.

## 4. Results

### 4.1 The session at a glance

| # | what the agent did | memory calls | model turns | tokens in / out |
|---|---|---|---|---|
| 1 | read the A/B skill, recalled, asked the code graph for the reach of three names, opened three short code ranges, answered | 4 recalls, 3 impact | 5 | 13,586 / 1,954 |
| 2 | read `package.json` and the head of `server.mjs`, ran `npm start` | none | 4 | 13,239 / 376 |
| 3 | one edit; eight shell commands to restart on Windows; checked the storefront setting | none | 10 | 18,017 / 1,106 |
| 4 | recalled; ran the code-graph script; wrote a fact; withdrew one | 1 recall, 1 remember, 1 show, 1 retract | 7 | 9,490 / 1,149 |
| 5 | read the app's routes and catalog; fetched the three reports and the product list; answered | none | 5 | 24,271 / 4,651 |

Between prompts the conversation was served largely from the provider's cache, so the input column
is smaller than the conversation grew.

### 4.2 RQ1: planning the A/B test (prompt 1)

The agent called `cortex_impact` for `shippingFor`, `storefrontConfig` and `EVENT_NAMES`. The answer
for `shippingFor` was a ranked reach and not a search result:

- **what needs it, nearest first:** `orderTotals` (one step), `priceCart` (two), then `createOrder`,
  `marketingReport`, `orderEconomics`, `pBuy`, `placeOrder`, `postCheckout`, `postQuote`,
  `renderCart` and `startCheckout` (three);
- **through what it builds:** the order's money fields, which is how the finance and marketing
  dashboards depend on a shipping rule they never call;
- **the tests that cover it:** the cart and pricing tests;
- **what the team wrote about it:** DEC-0007 and EXP-003.

The agent then opened `pricing.mjs`, `flags.mjs` and `events.mjs` at the ranges memory named: about
5 KB of roughly 43 KB (12%). It did not search the repository.

The answer named what an experiment on the threshold touches: `shippingFor`, which already takes the
threshold as an argument; `storefrontConfig`, where a variant attaches; the registered list of event
names, where an exposure event must be added first; and the routes that read the setting. The answer named
DEC-0003, DEC-0007, DEC-0011, DEC-0012, INC-014, INC-021 and EXP-003 by id, and stated the margin guardrail,
the 400-visitor floor and the sample-ratio check from `docs/metrics.md` without ids. The table gives the
team's rule behind each risk it listed, with the notes that record it:

| risk | the team's rule, and the notes that record it |
|---|---|
| one visitor in both arms | INC-021, fixed by DEC-0011: a variant is a hash of visitor id and experiment key, never a draw per request |
| coupons giving away shipping | INC-014, fixed by DEC-0007: free shipping is judged on the discounted subtotal |
| a variant that wins on conversion and loses money | DEC-0014: margin per visitor may not fall more than 2% below control, however well conversion rises. EXP-002 is the case: a first-order offer lifted conversion and lost margin, and the guardrail stopped it |
| a split that is not the split it claims | DEC-0015 and INC-030: at least 400 visitors per variant and a sample-ratio check before any result is read |
| exposure counted wrongly | DEC-0012: one exposure event per visitor and experiment, registered in the event list first |
| floats in money | DEC-0003: integer cents |
| tests that interfere | DEC-0016: each experiment's key is part of the hash |

**The A/B test plan** the agent gave:

1. register the exposure event;
2. write a pure assignment function in its own module;
3. make `storefrontConfig` return the variant's threshold;
4. record exposure once per visitor and experiment;
5. test stickiness, evenness, independence and single exposure, and that `shippingFor` still receives the
   discounted subtotal and money stays in integer cents;
6. judge on margin per visitor, not on conversion;
7. wait for 400 visitors per variant.

**The test was planned in this session and not built.** `npm run accept` runs the shop's acceptance
task for it and fails until the experiment module, the assignment and the Experiments tab described in
[`ab-testing.md`](ab-testing.md) exist.

**RQ1 result:** yes. One question became a ranked reach, the tests, and the team's rules about the
function in seven memory calls, and the agent read 12% of the code, at the ranges it was given.

### 4.3 RQ2: keeping memory true (prompts 3 and 4)

Prompt 3 was one edit to the threshold's constant. It took one call to make. Restarting the shop on
Windows took eight: the shell was Git Bash, where `pkill` does not exist, `taskkill` read its flags as
paths, and `$null` is not a redirect target. The agent worked through each, found the process holding
the port with `netstat`, stopped it with PowerShell, restarted, and confirmed the new setting from the
storefront route. This is the shape of most of a coding session: a few memory calls, and the shell for
the rest.

**Prompt 4: what the agent did.** It recalled by the constant's name. The recall returned EXP-003's
note about the constant, which stated the threshold's old value in its text, so memory did say the
old number. It ran `tools/code-graph.mjs`, which answered *Nothing changed*: **the code graph held
names, calls and line ranges, and not the values of constants.** It concluded that memory was stale and
made two changes by hand:

1. `cortex_remember`: a new fact giving the constant's new value, under the subject key
   `FREE_SHIPPING_THRESHOLD_CENTS|value`;
2. `cortex_retract`: it showed EXP-003's note and withdrew it.

**Why this was wrong, twice.**

- **EXP-003's note was part of the team's record.** An earlier experiment happened. A code change
  makes its note old, not false, and a withdrawn memory cannot be brought back. The note was
  withdrawn because it happened to contain a number that had changed.
- **The new fact was a second copy of the truth.** It restates by hand what the code says. It is right
  today and wrong at the next edit, and nothing will sync it.

**Cause.** The cause was in the data and the instructions, not in the agent's reasoning: the graph
carried no values, a note repeated one, and no instruction said that a team note must outlive a change
to the code it mentions.

**Remediation**, made to the case study after the session:

| change | effect |
|---|---|
| the code graph carries the value of a plain constant in the fact that defines it | a changed value changes exactly one fact, and a sync replaces it |
| notes and docs name a constant and never repeat its value | there is no number in a note to go stale |
| after a sync the agent reports what changed in the code and lists the team's notes that name it, as history | the team's record stays; a person decides whether the change is a decision |
| a decision is kept under a subject key | a later decision replaces it and the experiments behind it stay |
| the skills forbid withdrawing a team note because code changed, and copying a value from code into a memory | the two mistakes are named |

[`how-memory-works.md`](how-memory-works.md) is the user's guide to this.

**RQ2 result:** not in this session. Memory went stale, and the agent's repair damaged the record. The
remediation addresses the cause; it was not exercised in a live session of this kind (§7).

### 4.4 RQ3: the analysis of the live shop (prompt 5)

#### 4.4.1 How the agent read the live shop

The shop had been running on localhost since prompt 2, with the simulated traffic in its store. The
agent had no data file and no special connection. It used its ordinary shell and file tools.

| step | what it ran | what came back |
|---|---|---|
| 1. look for data | `find` for JSON files and a `data` folder, then `ls data/` | nothing: the store lives in the server's memory |
| 2. guess a route | `curl http://127.0.0.1:8080/api/admin/dashboard` | `{"error":"not found"}` |
| 3. learn the routes | read the first 100 lines of `src/app.mjs`; `cat demo.json` | the `ROUTES` table: three reports under `/api/admin/` |
| 4. read the reports | `curl` of `/api/admin/finance`, `/marketing` and `/behavior` | the three reports described in §2.2 |
| 5. read the catalog | `curl /api/products`, then the first 100 lines of `src/catalog.mjs` | each product's name, category, price and cost |

The reports are plain JSON that a person could read in a browser at `/admin`; the agent took the same
numbers from the same routes. **na8ve agent can read whatever the running application will tell a
`curl`.** Step 2 is also where memory would have saved a guess: the code graph records which handler
serves each route, so *which routes do the dashboards read?* would have found the three report routes
without reading the start of `app.mjs`. The agent made no memory call in this prompt.

#### 4.4.2 What it reported

| | the agent's answer |
|---|---|
| lifetime value | $68.74 per customer: $632,618 of revenue over 9,203 customers, 10,424 orders, 1.13 orders each, a 13% repeat purchase rate |
| best sellers | five products by add-to-cart rate, 16.0% to 16.6%, with price, cost and margin from the catalog |
| trends | revenue steady at about $45,000 a day; margin "a slight decline"; overall margin rate 42.9% |
| recommendations | repeat purchases (email sequences, loyalty offers); the channel mix (scale email, reconsider social); feature high-margin products; the lowered threshold (watch margin for two weeks, consider testing a middle value); mobile conversion; funnel leakage and cart-abandonment email |

#### 4.4.3 The claims, checked against the reports and the code

Most of the arithmetic holds: the funnel's drop-offs, the 60% mobile share, the conversion gap between
mobile and desktop, the overall margin rate and the week's extremes. These did not:

| claim | what the reports and the code show |
|---|---|
| **LTV is $68.74** | It is revenue kept per purchaser: $632,618 over 9,203. That is a **revenue** figure, and "lifetime" is the simulated fortnight. Per purchaser, contribution margin is about $29.49, and margin is what the team's own rules judge by. |
| **13% repeat purchase rate** | The 1,221 is *orders beyond the first*: 10,424 orders less 9,203 purchasers, so repeat orders per purchaser, not the share of customers who came back. The simulator also fixes how many visitors return, so the dashboards cannot show whether email or a loyalty offer would change it: nothing in the simulator responds to them. |
| **Best sellers** | The behavior report ranks five products by views, which differ by under 2% (12,221 to 12,421). **No report gives units sold or revenue per product**, so "best selling" was answered with the add-to-cart rate of the five most viewed. In the answer, the fifth product, the Brass Pen (DK-002, 15.8%), is missing and the Pour-over Kettle appears with an add rate that belongs to the Carbon Steel Pan. |
| **Daily margin shows a slight decline** | Daily margin averaged $19,371 in the first week and $19,394 in the second: flat, up 0.1%. The answer gave $19,250. Daily revenue was $45,066 and $45,308, up 0.5%. Both sit well inside the day-to-day range ($42,020 to $48,104 for revenue). |
| **Why the lines are flat** | The simulator spreads its shoppers evenly over fourteen days, and the behavior report's daily visitors alternate between two values (11,664 and 11,502). With constant traffic and fixed shopper behavior, flat revenue and margin are what the model produces. The levers that move them are those it can vary: traffic, conversion, order value, cost. |
| **Channel ROAS and CAC** | **The marketing report spans 35 days and the simulation spans 14.** The span runs from the first event to the last, and four page views were recorded on the live clock after the simulated fortnight (the behavior report lists them on the last two days; they come from the storefront opened in a browser). Spend is a daily rate times the span, so each channel's spend is 2.5 times what 14 days cost. |
| **Refunds** | Not mentioned. The finance report's `refundedCents` is $24,722, which is 3.8% of revenue before refunds. The marketing orders (10,031) against the finance orders (10,424) differ by 393: the refunded orders, which marketing leaves out. Their goods and carrier cost remain in margin. |
| **Where each dollar goes** | From the finance report: goods 46.0%, carrier cost 7.4%, payment fees 3.7%, leaving 42.9% as contribution margin. The carrier cost is paid on every order, whether or not the shopper paid for shipping. |

**Marketing figures with the window corrected** (14 days of spend, scaled from the report's 35):

| channel | ROAS reported | ROAS, 14 days | CAC reported | CAC, 14 days |
|---|---|---|---|---|
| email | 65.6 | 164.1 | $1.05 | $0.42 |
| referral | 43.5 | 108.7 | $1.48 | $0.59 |
| paid search | 9.7 | 24.1 | $6.74 | $2.70 |
| social | 7.5 | 18.9 | $8.23 | $3.29 |

The order of the channels does not change: email returns the most per dollar and social the least, so the
direction of the advice stands. Its size does not. A report that says social returns 7.5 for each dollar
and one that says 18.9 would be read very differently.

**RQ3 result:** the agent produced a useful analysis from the live reports and did not bring the team's
history to it. Four of its figures needed correcting or a qualifier, and the memory that bears on the
advice was not consulted.

### 4.5 Memory across the session

| prompt | memory used | effect |
|---|---|---|
| 1, the change | recall ×4, impact ×3 | a small, specific plan citing the team's rules; 12% of the code read |
| 3, the edit | none | none needed |
| 4, keeping memory true | recall, remember, show, retract | exposed a gap; damaged the record (§4.3) |
| 5, the analysis | none | none; the team's history was not brought to the advice |

## 5. Discussion

### 5.1 Where memory helped

Memory helped most where the question named code. A question about one function became its callers, the
money fields the dashboards read through it, the tests that cover it, and the decisions, incidents and
experiments about it, in a few calls, with line ranges the agent then opened and nothing else. The answer
cited the team's rules by name because it had been handed them.

### 5.2 Where it did not, and what it held

Memory held the following, each bearing directly on advice the agent gave:

| recommendation in the analysis | what the team's notes say |
|---|---|
| loyalty discounts on second orders | EXP-002: a first-order offer lifted conversion by 9% and cut margin per visitor by 7%, and DEC-0014 says a treatment that loses more than 2% of margin per visitor does not ship. A loyalty offer is the same trade, and the guardrail is how to test it |
| watch margin for two weeks, perhaps test a middle threshold | DEC-0015 and DEC-0014 are more specific: at least 400 visitors per variant, a sample-ratio check first, margin per visitor as the verdict. EXP-003 is the earlier result for the same lever |
| (margin was flat, and not discussed further) | DEC-0009: a refund reverses the revenue and not the costs, so a refunded order's margin is negative. Refunds are a lever on margin that the answer did not mention |
| (every figure taken as reported) | INC-014 and INC-026: two incidents in which a dashboard overstated money until someone checked it against something else. Reconciling reports is the habit they ask for |

### 5.3 Why

The agent used memory for what it thought to ask. The first prompt named a function and a past, and the
agent reached for memory. The last named a business outcome and did not. The cause is not capability:
the same agent, in the same session, used memory well four prompts earlier. The cause is that nothing in
the question or the instructions linked "growth" to "what this team has learned".

### 5.4 Tokens

The first prompt, which memory answered, used 13,586 tokens in and 1,954 out and opened about 5 KB of code.
The last used 24,271 in and 4,651 out, most of it the reports and the catalog it read in, and called no
memory. These two numbers do not show that memory saves tokens in general. They show that when a question is
about code, the agent can be pointed at the lines that matter instead of the files that contain them.

## 6. Recommendations

### 6.1 The loop

1. **Ask memory about code before opening files**, and open the ranges it gives.
2. **Read the live system for what happened**, through the routes it already has.
3. **Name both in the prompt.** For a business question, tell the agent to recall the team's history
   first.
4. **Never withdraw a team note because code changed.** Keep a decision as a decision, under a subject key.
5. **Reconcile reports before trusting them**: the orders in two reports, the days a window spans, and who
   is counted in a rate.
6. **Say what a report cannot show.** "Best selling" needs units; "lifetime" needs time.
7. **Keep memory in step at a boundary**: the end of a turn that edited files (`/code auto on`) or a
   commit (`tools/hooks`).

### 6.2 A prompt that uses both

> I've simulated visitors on the local shop. Read the finance, marketing and behavior reports from
> `/api/admin/`. Before you recommend anything, recall what this team has learned about discounts,
> shipping and margin, and judge against it. Give me lifetime value as contribution margin, say what each
> report cannot show, check that the marketing report's days match the simulation's, and tell me which
> change you would put through an A/B test first, with the team's guardrail.

### 6.3 Follow-ups worth running

1. **Build the A/B test.** *Build the A/B testing described in `docs/ab-testing.md`.* Then `npm run accept`.
   The plan in §4.2 is the plan to follow.
2. **Make the analysis stand on the team's history.** Run the analysis prompt with the sentence above and
   compare its recommendations with §4.4.2.
3. **Ask for what the reports cannot give.** *Which products sold the most units and the most margin?* A good
   answer proposes a report for it: a dashboard tab, drawn from a route, with the numbers computed on the
   server.
4. **Fix the marketing window.** The report should span the simulation's days, or take them as input, and a
   test should say so. It is a real defect in the shop, and a good small change to make with memory: ask
   what depends on `daysSpanned`.

## 7. Limitations: what this study cannot show

- **One session, one model, one shop.** The agent's behavior is that of the model the developer chose, on
  one occasion. A different model, or the same one on another day, may use memory differently.
- **The shop and its traffic are synthetic.** The simulator fixes the share of returning visitors, the
  response to price and shipping, and an even spread of traffic. The business conclusions of §4.4 are
  conclusions about a model, not about customers.
- **The remediation in §4.3 was not exercised in a live session of this kind.** The changes were made to
  the case study's files after the session. This study shows the cause and the change, not a second
  session in which the agent behaves differently.
- **The corrected marketing figures are arithmetic, not a re-run.** They scale the report's spend by the
  ratio of the days simulated to the days the report spanned.
- **The token counts are one session's.** They do not compare memory with no memory, and they are not a
  cost comparison.
- **The A/B test was planned and not built.** No result of an experiment is reported.
- **Whether the agent would have used memory for the analysis if asked to** is untested here. The
  recommendation in §6.2 follows from the first prompt's behavior, not from a run.

## 8. Reproducing the session

1. **Install na8ve agent** (Node.js 22.19 or newer, and git). In a terminal, run `na8ve-agent demo coding`.
   It fetches this case study and starts the agent in its folder; `/login` signs you in with your browser.
2. **`/demo coding`** seeds the code graph, the team's notes and these docs into a space of your own, and
   asks the first question.
3. **Start the shop**, or ask the agent to: `npm start` serves http://127.0.0.1:8080, with the dashboards
   at `/admin`.
4. **Put traffic through it** with **Simulate 1,000 shoppers**, as many times as you like. Each press adds
   shoppers to the same store.
5. **Ask the five prompts of §3.1**, then the prompt in §6.2.

---

## Appendix A: the commands the agent ran to read the live shop

```
find . -name "*.json" -o -name "data" -type d | grep -v node_modules | head -20
ls -la data/ 2>/dev/null || echo "No data directory"
curl -s "http://127.0.0.1:8080/api/admin/dashboard" | head -100      # not a route
cat demo.json
curl -s "http://127.0.0.1:8080/api/admin/finance"
curl -s "http://127.0.0.1:8080/api/admin/marketing"
curl -s "http://127.0.0.1:8080/api/admin/behavior"
curl -s "http://127.0.0.1:8080/api/products" | jq '.products[] | {sku, name, priceCents, category}' | head -50
```

Plus two file reads: the first 100 lines of `src/app.mjs` and of `src/catalog.mjs`.

## Appendix B: the memory calls of the session

| prompt | call | arguments |
|---|---|---|
| 1 | `cortex_recall` ×4 | the threshold and `shippingFor`; experiments and tests; incidents; EXP-003 |
| 1 | `cortex_impact` ×3 | `shippingFor`, `storefrontConfig`, `EVENT_NAMES`, each three steps deep |
| 4 | `cortex_recall` | *free shipping threshold cents value* |
| 4 | `cortex_remember` | a fact under the subject key `FREE_SHIPPING_THRESHOLD_CENTS\|value` |
| 4 | `cortex_show`, `cortex_retract` | EXP-003's note about the constant |

## Appendix C: glossary

| term | meaning |
|---|---|
| code graph | the shop's source as typed facts: what defines, calls, reads, handles and tests what, with file and line range |
| team's notes | the decisions (DEC), incidents (INC) and experiments (EXP) people wrote |
| subject key | a name for something with one current value, so a newer memory replaces the older |
| contribution margin | revenue kept, less cost of goods, carrier cost and payment fees |
| CAC | channel spend divided by the customers the channel brought |
| ROAS | channel revenue divided by channel spend |
| guardrail | the rule that a treatment may not cost more than 2% of margin per visitor, however well it converts |
