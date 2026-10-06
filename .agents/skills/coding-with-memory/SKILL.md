---
name: coding-with-memory
description: "Use for any change to this shop's code: ask memory what depends on the code before reading files, open only the cited line ranges, run the tests, then refresh the code graph so memory matches what you wrote."
---

# Changing this shop's code with memory

Memory holds two things about this repository: **the code's structure** (what
defines, calls, reads and covers what, with file and line ranges) and **what
the team learned** (decisions, incidents, past experiments). Reading files to
rediscover either is the expensive way.

## Before you change anything

1. **Ask memory what the change touches.** Call `cortex_impact` with the
   function, constant, route or module you plan to change. It returns what
   depends on it, the routes that reach it, and the tests that cover it, each
   with `file:lines`. For a *why* or *what went wrong before* question that
   names two or more things, call `cortex_explain`.
2. **Ask memory what is known.** Call `cortex_recall` with the thing's name for
   decisions, incidents and earlier experiments. Cite the refs you rely on.
3. **Open only what it cited.** Read the line ranges memory gave you, not whole
   files. If memory does not know a name, read the file: the graph may be
   behind your edits (see below).

## While you change it

- Money is whole cents. Never use a float for a price.
- Keep the change inside the places memory named; if you find you must touch
  somewhere it did not name, say so and look at why.
- Write or update the test for what you change, then run `npm test`.

## After you change it

1. `node tools/code-graph.mjs` rewrites `memory/code/` from the source and
   prints which files changed.
2. Call `cortex_code_sync` (or the person runs `/code sync`) so memory drops the
   facts your edit made false and learns the new ones.
3. Keep a decision with `cortex_remember` when you made one that someone would
   otherwise have to rediscover: what was chosen and why, in one sentence.

If the person turned on `/code auto`, steps 1 and 2 happen by themselves at the
end of each turn that edits files.

## When the code changes what the team wrote about

The code graph holds what the code says, values included
(`constant FREE_SHIPPING_THRESHOLD_CENTS = <its value>`), and a sync keeps it current.
What the team wrote, `memory/knowledge/`, is history: a change to the code makes
a decision or an experiment's result old, not false.

- After a sync, read *Notes that name it*. Tell the person which notes describe
  the code as it was.
- If the change is a decision, ask whether to keep it, and keep it with
  `cortex_remember` and a subject key such as `free-shipping-threshold|decision`,
  so a later decision replaces it. The notes stay.

## What not to do

- Do not read the whole repository to "get oriented". Ask memory.
- Do not edit anything under `memory/code/`: it is generated.
- **Do not retract what the team wrote because the code changed.** Retraction
  cannot be undone, and the experiment still happened.
- **Do not copy a value from the code into a memory of its own.** The code graph
  holds it and the next sync updates it; a copy goes stale at the next edit.
- Do not retract memories to make a plan fit.
