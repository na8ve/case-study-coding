# How memory works in this case study

A guide for using the shop with a coding agent that remembers. It covers what
your memory holds, how the agent uses it, how it stays true while you change the
code, and what you decide yourself.

*The examples below use placeholders such as `<its value>` where a real value would
appear, because this guide is seeded into memory too, and a value written here would
be a second copy of what the code says.*

## 1. What is in memory

When you run `/demo coding` (or seed this folder), three kinds of knowledge go
into a space of your own:

| | where it comes from | what it says |
|---|---|---|
| **the code** | `memory/code/`, written by `tools/code-graph.mjs` from the source | what defines, calls, reads, requests and tests what, each with its file and lines. A constant carries its value: `constant FREE_SHIPPING_THRESHOLD_CENTS = <its value>` |
| **what the team learned** | `memory/knowledge/` | decisions (`DEC-…`), incidents and their causes (`INC-…`), and what earlier experiments found (`EXP-…`), each tied to the code it is about |
| **the documents** | `docs/` | the A/B testing task and the definitions of the metrics |

Each of these is one **fact**: two things and how they relate, with a sentence a
person can read, for example

```
orderTotals | calls | shippingFor | orderTotals (src/pricing.mjs line 31) calls shippingFor.
```

Facts that name the same thing are connected, so memory can follow them: from
`shippingFor` to whatever calls it, and from there onward. The
[toy model](https://na8ve.com/toy-model) shows the same idea at a size you can
watch.

Along the way, memory also keeps what you decide (when you or the agent use
`cortex_remember`) and what you and the agent say to each other.

## 2. How the agent uses it

| it wants to know | it uses | and gets |
|---|---|---|
| what a change to a function, constant, route or module touches | `cortex_impact` | what needs it (nearest first, with `file:lines`), the routes that reach it, the tests that cover it, and what the team wrote about it |
| what is known about something, by meaning | `cortex_recall` | memories close to the question, each with a ref |
| *why*, when a question names two or more things memory holds | `cortex_explain` | what they lead to, and the facts behind it |

Every answer carries **refs** (like `[k57a…]`), so you can see which memory it
came from and read it in full. The agent then opens only the lines it was given,
not whole files.

You can ask the same thing yourself: `/code impact shippingFor`. Or, with no
account at all, `node tools/code-graph.mjs --impact shippingFor` prints the same
answer from the source in this folder.

## 3. Keeping memory in step with the code

When the code changes, its facts must change with it. Otherwise memory would tell
the agent about code that is gone.

With na8ve agent:

| how | what happens |
|---|---|
| **by hand** | `node tools/code-graph.mjs`, then `/code sync` (or the agent's `cortex_code_sync`) |
| **after every turn** | `/code auto on` (it asks first). At the end of each turn in which the agent edited files, it runs the script and syncs. `/code auto off` stops it |
| **at every commit** | `git config core.hooksPath tools/hooks`. The graph goes into the same commit as the code, and memory is synced after the commit. With `NA8VE_SYNC_BRANCH=main` set, only commits on `main` are synced: right for a space several people share |

A sync sends this folder's facts again. What is unchanged stays as it is, a fact the
edit made false is withdrawn, the new facts are written, and the facts of a deleted
file leave memory. Running it twice changes nothing the second time.

**A sync reports what changed in the code.** A function that only moved lines is not a
change. A new value, a changed signature, a new or removed function is:

```
What changed in the code: FREE_SHIPPING_THRESHOLD_CENTS <old value> → <new value>.
```

Only a plain value is carried: a number, `true`, `false`, `null` or a short string.
A constant computed from an expression is in memory without its value, so changing it is not reported as a change.

## 4. When the code changes something the team wrote about

The team's notes are history. If you lower the free-shipping threshold, EXP-003
still happened: it tested a lower threshold against the one in the code at the time,
and that result does not become false.
So a sync **never changes or withdraws what the team wrote**. It lists the notes
that name the code you changed:

```
Notes that name it, which may describe it as it was:
  EXP-003 informs FREE_SHIPPING_THRESHOLD_CENTS [k57…]: a test varies the threshold passed to shippingFor, …
```

What to do with that is your decision:

- **If the change is a decision,** keep it: ask the agent to remember it, with a
  subject key such as `free-shipping-threshold|decision`. A later decision with the
  same key replaces it; the notes and experiments behind it stay.
- **If it was a trial,** nothing needs doing: memory already holds the new value
  through the code.

Two things the agent should never do, and you can hold it to them:

- **withdraw what the team wrote because the code changed**, and
- **write a value from the code into a memory of its own.** The code graph already
  holds it, and the next sync updates it; a copy goes stale.

## 5. Withdrawing a memory

`cortex_retract` withdraws a memory for good: it can never be retrieved again, and
it cannot be undone. The agent asks you to confirm every time. Use it for something
that is **wrong**, or that you want forgotten, not for something that is merely out of
date. Out of date is what a sync and a decision are for.

## 6. What leaves your machine

- `/demo` and a sync send this folder's **text files**: the `.facts` files, the
  documents and other `.md` and `.txt` files. With na8ve agent, hidden folders and the
  repository's own files (README, licences) are not sent.
- **The source code itself is not sent.** What is sent about it is the graph: names,
  how they relate, file paths, line numbers, and the values of plain constants.
- Anything shaped like a credential is removed before it is sent.
- `tools/code-graph.mjs` sends nothing. It only reads the source and writes
  `memory/code/`.

## 7. Using this on your own project

`tools/code-graph.mjs` reads `.js`, `.mjs`, `.cjs` and `.ts` files. Copy it into
`tools/` in your own project and run it there: it writes `memory/code/`. Then
`/code sync` sends just that folder to the space you choose with `/cortex space`,
and `/code auto on` and the hooks work the same way. It reads source text, not a
compiled program, so a name built at run time is not seen. It follows fields whose
names end in `Cents` or `Rate`, the convention this shop uses for money and rates.

## Words you will see

| | |
|---|---|
| **space** | where your memory for one project lives, chosen with `/cortex space` |
| **fact** | two things and how they relate, with a sentence |
| **ref** | the id of one memory, shown in answers so you can check them |
| **sync** | sending the code graph again so memory matches the code |
| **subject key** | a name for something that has one current value, so a newer memory replaces the older one |
| **withdraw** (retract) | remove a memory for good, after you confirm |
