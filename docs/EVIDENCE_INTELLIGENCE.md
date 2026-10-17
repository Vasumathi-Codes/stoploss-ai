# Evidence Intelligence

A case-level workspace that turns screenshots, bank statements, chat exports and the case form into
**facts with provenance**, cross-checks them with **deterministic rules**, and shows the result as an
interactive graph: what is corroborated, what conflicts, and what is missing.

Case → **Evidence Intelligence** tab (`/cases/[id]?tab=intelligence`).

> Matching is rules, not AI. Nothing in this feature decides who did what. A phone number or UPI ID that
> appears in two places shows only that both records mention it.

## Contents

1. [Pipeline](#pipeline)
2. [Code map](#code-map)
3. [Data model and migration](#data-model-and-migration)
4. [Normalisation](#normalisation)
5. [Matching rules](#matching-rules)
6. [API](#api)
7. [Graph contract and UI](#graph-contract-and-ui)
8. [Agents (Microsoft Foundry)](#agents-microsoft-foundry)
9. [Privacy, security and retention](#privacy-security-and-retention)
10. [Testing and evaluation](#testing-and-evaluation)
11. [Known limitations](#known-limitations)

## Pipeline

```text
 Evidence added (metadata only, as before)
        │
        ▼  person clicks Read details / Read statement / Read chat (consent per file)
 ┌───────────────────────┬──────────────────────────────┬────────────────────────────────┐
 │ Screenshot (PNG/JPEG) │ Statement (digital PDF)      │ Chat export (.txt)             │
 │ existing Screenshot   │ text layer read IN THE       │ parsed IN THE BROWSER by fixed │
 │ Reader → Foundry      │ BROWSER (unpdf / PDF.js)     │ rules                          │
 │ vision, store:false   │ person ticks lines           │ person ticks messages          │
 │ result held ≤30 min   │ only ticked lines + header   │ only ticked messages sent      │
 │ under a readingId     │ sent                         │                                │
 └──────────┬────────────┴──────────────┬───────────────┴──────────────┬─────────────────┘
            ▼                           ▼                              ▼
   POST /api/incidents/:id/evidence-graph/analyze  — server re-parses and screens everything
            │  facts upserted by stable key (idempotent), evidence marked processed / no_facts
            ▼
   reconcileEvidence(): case-form facts synced → runMatching() → candidates + matches persisted
            │  (also runs when the case reference/recipient changes or evidence is removed)
            ▼
   GET /api/incidents/:id/evidence-graph — graph rebuilt from the normalised rows on each request
            │
            ▼
   Evidence Intelligence tab: metrics · source cards · graph / list · detail panel · reviews
            │  PATCH …/evidence-facts/:factId (confirm / reject / correct / conflict reviewed) → re-match
            ▼
   Evidence Agent template + Foundry input receive a value-free digest
```

No step re-sends an image to Foundry: graph refreshes, re-matching and reviews never call a model.

## Code map

| Path                                                  | What                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/evidence/types.ts`                           | Fact, match and graph types (mirror the Prisma enums); graph API contract   |
| `src/lib/evidence/normalize.ts`                       | Deterministic normalisation, masking, corrections                           |
| `src/lib/evidence/sources.ts`                         | Screenshot-reading and case-form adapters                                   |
| `src/lib/evidence/chat-parser.ts`                     | Chat export parser (WhatsApp-style)                                         |
| `src/lib/evidence/statement-parser.ts`                | Column-aware statement parser                                               |
| `src/lib/evidence/pdf-text.ts`                        | Browser-side PDF text-layer extraction (unpdf)                              |
| `src/lib/evidence/matching.ts`                        | The matching engine and its documented `RULES`                              |
| `src/lib/evidence/graph.ts`                           | Graph builder, integrity check, filters, missing-information rules          |
| `src/lib/evidence/layout.ts`                          | Deterministic three-column layout                                           |
| `src/lib/evidence/digest.ts`                          | Value-free digest for the agents                                            |
| `src/lib/validation/evidence-graph.ts`                | Zod request schemas                                                         |
| `src/server/evidence-store.ts`                        | Idempotent fact upserts, reconciliation, graph loading                      |
| `src/server/evidence-graph.ts`                        | Analyse / review operations with ownership checks                           |
| `src/server/screenshot-readings.ts`                   | Short-lived, server-held Screenshot Reader results                          |
| `src/app/api/incidents/[id]/evidence-graph/…`         | `GET` graph, `POST …/analyze`                                               |
| `src/app/api/incidents/[id]/evidence-facts/[factId]/` | `PATCH` review                                                              |
| `src/components/evidence-intelligence/`               | Tab, source cards, graph canvas, list view, detail panel, extraction dialog |
| `src/features/evidence-graph/hooks.ts`                | `useEvidenceGraph` (reload on case changes, stale-response guard)           |

The library in `src/lib/evidence` is pure: it runs unchanged in the browser (preview) and on the server
(authoritative re-parse), and is what the unit tests exercise.

## Data model and migration

Migration `prisma/migrations/20261017145145_evidence_intelligence` — **additive only**: new enums, four
new tables, three defaulted columns on `evidence_items`, and the `evidence_check` value on `FindingSource`.
Existing cases and evidence metadata are untouched.

| Table                    | Holds                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `evidence_facts`         | One fact as one source states it, with provenance and the person's review                  |
| `transaction_candidates` | A possible transaction; facts point to it via `transactionId`                              |
| `evidence_matches`       | One comparison of two facts under one rule (outcome, relation, explanation, review status) |
| `evidence_review_events` | Audit of reviews: action and from/to status — never the values                             |
| `evidence_items` (+3)    | `processingStatus`, `processedAt`, `processingError` (safe, fixed messages only)           |

Key design points:

- **Typed comparison columns.** `amountMinor` (BigInt paise), `currency`, `occurredAt` + `timePrecision`
  (`minute` / `day`) and `normalizedValue`. No unrestricted JSON.
- **Provenance.** `recordKey` groups the facts one source presents together (a screenshot, a statement line
  `p1l8`, a chat message `msg:4`, the case form). `sourceLocation` is only what the source really gives:
  "Page 1 · line 8" or "Message 4 · 15 Oct 2026, 2:36 pm". Screenshots have none, because the reader returns
  no positions.
- **Idempotency.** `@@unique([incidentId, factKey])`, `@@unique([incidentId, candidateKey])` and
  `@@unique([incidentId, matchKey])`. A match key contains the rule, both fact ids and a hash of both
  values, so a review stays attached while the data is unchanged, and changed data yields a new, open match.
- **Deletes.** Facts cascade with their evidence item or case; matches cascade with their facts; candidates
  are removed when nothing points to them; audit rows keep `factId`/`matchId` set to null.
- **No stored graph JSON.** The graph is rebuilt from these rows on every request (four queries).

Reprocessing rules (`upsertSourceFacts`):

| Situation                                   | Result                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Same key, same value                        | Nothing written; review and `updatedAt` kept                              |
| Same key, new value, unreviewed             | Value updated                                                             |
| Same key, new value, person had reviewed it | Value updated, status → `needs_verification`, audit `reextracted_changed` |
| …and the person had corrected it            | Correction kept (status stays `user_corrected`), audit written            |
| Fact no longer produced, unreviewed         | Deleted                                                                   |
| Fact no longer produced, reviewed           | Kept                                                                      |
| Case-form facts                             | Always mirror the form                                                    |

Concurrency: every write path takes `pg_advisory_xact_lock(hashtext('evidence-graph:<caseId>'))` inside its
transaction, so simultaneous analyses of one case serialise. The client applies only the newest response
(`useEvidenceGraph` sequence guard), and fact reviews can carry `expectedUpdatedAt` (409 if stale).

Apply locally:

```bash
npm run db:deploy        # applies pending migrations (this one included)
# or, while editing the schema: npm run db:migrate
```

**Rollback.** Drop `evidence_review_events`, `evidence_matches`, `evidence_facts`, `transaction_candidates`;
drop the three `evidence_items` columns; drop the new enum types; then delete the migration's row from
`_prisma_migrations`. Postgres can't remove an enum value, so `FindingSource.evidence_check` stays: harmless,
but remove any `agent_findings` rows that use it first. Never run migrations against production
automatically; use `prisma migrate deploy` in a controlled release.

## Normalisation

`src/lib/evidence/normalize.ts`. Each fact keeps the displayed value (`rawValue`) and a separate comparison
value (`normalizedValue`).

| Kind           | Rule                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount         | Decimal string → integer paise (`"₹18,500.00"` → `1850000`); Indian grouping accepted; zero, negative and malformed values rejected. No floats in comparisons |
| Currency       | ISO code; `₹`, `Rs`, `INR` → `INR`                                                                                                                            |
| Reference      | Whitespace removed, upper-cased, **nothing else**; any other character invalidates it. Card numbers and 13–19-digit runs rejected                             |
| UPI ID         | Lower-cased (VPAs are case-insensitive); shape validated; e-mail addresses rejected                                                                           |
| Phone          | Indian mobiles → `+91XXXXXXXXXX`; other numbers only with an explicit `+country` code                                                                         |
| Account        | Masked forms → `masked:<visible digits>`, so a masked number never equals a full one                                                                          |
| Name           | Lower-case, collapsed whitespace, trailing punctuation removed                                                                                                |
| Payment method | Category (`upi`, `bank_transfer`, `card`, …)                                                                                                                  |
| Date / time    | Day-first Indian dates. Times without a zone are **India time (UTC+05:30)**, never the server's zone. A date without a time has precision `day`               |

## Matching rules

`src/lib/evidence/matching.ts` (`RULES` holds the wording shown in the UI). Rejected facts are left out;
corrected facts are matched on the correction.

**Grouping into transaction candidates**

| Rule               | When records join                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ref.exact`        | Identical normalised UTR/RRN — strong identity                                                                                                                     |
| `link.amount_date` | A record without a reference joins **exactly one** compatible cluster: identical amount + compatible date, no conflicting recipient or direction                   |
| (unique reference) | A record whose reference no other record shares joins only if amount, date **and** recipient all match; the differing reference is then a `ref.different` conflict |
| `link.recipient`   | The case form joins a record naming the same recipient identifier                                                                                                  |
| `link.ambiguous`   | More than one compatible cluster: not joined; flagged for review                                                                                                   |

Amount alone or similar timestamps alone never join anything. Two lines of the same statement join only
through a shared reference (e.g. a debit and its reversal). The case form is never linked on its
approximate amount alone.

**Comparisons inside a candidate**

| Rule                                             | Outcome                    | Notes                                                                          |
| ------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------ |
| `ref.exact` / `ref.different`                    | match / conflict           |                                                                                |
| `amount.exact` / `amount.different`              | match / conflict           | Paise, same currency; `amount.currency_differs` is a conflict                  |
| `amount.reported_differs`                        | conflict                   | Case form vs evidence: "reported amounts are often approximate"                |
| `time.within_tolerance`                          | match                      | Both exact times within 10 minutes                                             |
| `time.same_day`                                  | partial, review            | Same date, times > 10 minutes apart                                            |
| `date.same_day`                                  | match                      | One side shows only a date                                                     |
| `date.adjacent_day`                              | partial                    | Posting dates often lag by a day                                               |
| `time.reported_approximate`                      | partial                    | Within 24 h of the time in the report                                          |
| `time.different`                                 | conflict                   | More than a day apart                                                          |
| `recipient.exact` / `recipient.different`        | match / conflict           | Same identifier kind only; may be an aggregator's ID                           |
| `recipient.masked_partial`                       | partial                    | Only the last digits are visible                                               |
| `name.exact` / `name.partial` / `name.different` | match / partial / conflict |                                                                                |
| `direction.same` / `direction.mismatch`          | match / conflict           | Explanation mentions reversal or refund; stronger if a line is labelled as one |
| `method.same` / `method.different`               | match / partial            |                                                                                |
| `source.possible_duplicate`                      | insufficient evidence      | Same source type, all details identical: counted as **one** source             |
| `context.same_identifier`                        | match (context)            | A chat mentions the same UPI ID / phone / account / reference                  |
| `context.amount_near_date`                       | partial (context)          | A chat mentions the same amount within a day of the payment                    |

Transaction status:

- **Conflicted:** any open conflict.
- **Reported only:** only the case form describes it.
- **Corroborated:** at least two **independent** sources (duplicates merged, case form excluded) agree
  exactly on the reference, or on both the amount and the date.
- **Single source:** anything else.

There are no numeric confidence scores. An AI confidence is never used, and a conflict is never resolved
automatically: only the person can mark it reviewed, defer it, or confirm, correct or reject one side.

## API

All routes act as the current user (`currentUserId()`; the app has no login yet) and check that the case,
evidence, fact and match belong to that user's case. Validation errors are **422** (the existing convention),
malformed JSON 400, not-found or not-yours **404** (no existence leak), stale or conflicting state 409,
too large 413, rate-limited 429. Errors never include stack traces, prompts or provider responses.

### `GET /api/incidents/:id/evidence-graph`

→ `{ graph: EvidenceGraph }`. Reconciles derived records first (deterministic, no AI, writes only if
something changed), then builds the graph.

### `POST /api/incidents/:id/evidence-graph/analyze`

Body (≤ 400 KB, ≤ 10 sources): `{ sources: AnalyzeSource[] }`. An empty list only re-matches.

```ts
| { type: "screenshot_reading"; evidenceId; readingId }        // from POST /api/extract with evidenceId
| { type: "chat_export"; evidenceId; messages: { index; text }[] } // chosen messages, ≤ 400 / 60 000 chars
| { type: "bank_statement"; evidenceId; lines: StatementLine[] }   // header + chosen lines
| { type: "unsupported"; evidenceId; reason: "scanned_pdf" | "unrecognised_statement" | "unrecognised_chat" | "unsupported_type" }
```

→ `{ graph, snapshot }`. Rate limit `EVIDENCE_ANALYSES_PER_HOUR` (default 120). Wrong file kind → 422;
expired or foreign `readingId` → 409.

### `PATCH /api/incidents/:id/evidence-facts/:factId`

```ts
| { action: "confirm" | "reject" | "mark_needs_verification" | "reset"; expectedUpdatedAt? }
| { action: "correct"; value: string; expectedUpdatedAt? }        // validated per fact type; no secrets
| { action: "review_conflict" | "defer_conflict" | "reopen_conflict"; matchId }  // match must involve factId
```

→ `{ graph, snapshot }`. Unknown keys are stripped, so a client can't set statuses, outcomes, relationships,
ownership or timestamps. Case-form facts → 409 (edit the case instead). Corrections keep the extracted
`rawValue` and store `correctedValue` beside it. Every action writes an `evidence_review_events` row.

### `POST /api/extract` (extended)

Optional `evidenceId` (must be the user's image evidence, else 404 before any model call). The response adds
`readingId`. On failure, the evidence item is marked `failed` with a safe message.

## Graph contract and UI

`EvidenceGraph` (`schemaVersion: 1`):

- **`nodes`**
  - Evidence: `evidence:<id>`, plus `evidence:case` for the case form.
  - Fact: `fact:<id>`, with a masked `displayValue`; the screened `rawValue` is shown only on request.
  - Transaction: `tx:<id>`.
- **`edges`**
  - `extracted_from`: fact → evidence.
  - `supports`: fact → transaction.
  - Fact ↔ fact edges from matches: `corroborates`, `conflicts_with`, `possibly_same_transaction`.
  - `related_context`: a chat fact → its transaction.
  - Every edge carries its `ruleId`, `outcome`, `explanation`, `uncertainty` and `supportingFactIds`.
- **Also returned:** `summary`, `conflicts` (both sides), `missingEvidence`, `processingStatus`.

Ids are stable (database ids), and `graphIntegrityErrors()` checks for duplicates and dangling edges.

**Why no graph library.** The repository had none. The graph has a fixed three-column shape (evidence →
facts → transactions) and tens of nodes, so a deterministic column layout (`layout.ts`) in plain SVG plus
HTML buttons covers it. That gives real focusable, labelled buttons for keyboard and screen-reader use; the
existing design tokens and dark mode; no force layout that shuffles between renders; and no new rendering
dependency. React Flow would add pan/zoom/minimap machinery this layout doesn't need. Zoom and fit-to-width
are built in; panning is by scrolling.

Visual encoding never relies on colour alone: each relation has its own dash pattern and a midpoint glyph
(`=` corroborates, `≈` partial, `≠` conflict, `?` possibly same, `…` context), and every status has an icon
and text.

UI states:

- No evidence.
- Evidence not yet analysed.
- In progress (button spinners).
- Analysed.
- Conflicts.
- Partial failure (per-card error and a banner).
- No transaction identified.
- Network or API error: an error card with retry, or a "showing last loaded data" banner.
- Graph render failure: an error boundary falls back to the list view.

The list view is also the default on narrow screens.

**PDF dependency.** `unpdf@1.9.0` (MIT, no runtime dependencies) is a serverless build of Mozilla's PDF.js.
It is the only new dependency, and it is loaded with a dynamic `import()` only when someone reads a
statement. Only the text layer is read, with XFA and font loading off. PDF.js 5 has no `eval` path.

## Agents (Microsoft Foundry)

- `loadContext()` adds `evidenceDigest` (`src/lib/evidence/digest.ts`). The digest holds fact types,
  per-transaction status, the independent-source count, which fact types agree or conflict, linked chat
  mentions, review counts, and the titles of missing items. It holds **no identifier values and no file
  names**. That is consistent with the existing rule that agents never see the transaction reference.
- The Incident, Evidence and Recovery agents receive it as `evidenceIntelligence`. The Containment agent
  does not.
- The prompts tell the agents:
  - to separate what the person reported, extracted facts, confirmed facts, rule-based matches and their
    own interpretation;
  - not to overturn or resolve rule results;
  - that a conflict is not proof of fraud;
  - never to call anyone guilty or a scammer, or tie an identifier to a criminal.

  `PROMPT_VERSION` is now `2026-10-17.2`.

- The output screen now also drops accusatory findings ("…is the scammer", "belongs to a fraudster",
  "is guilty", "proves … committed"), on top of the existing outcome and secret checks.
- The template (no-Foundry) Evidence Agent output gains a **Cross-source checks** finding, with source
  `evidence_check`, labelled "Cross-source check — computed by fixed rules, not AI". It is rebuilt
  whenever the evidence agent refreshes.
- The core graph needs no model. If Foundry is down, everything except reading new screenshots keeps
  working.

## Privacy, security and retention

**New retention (documented here and in the README):**

- Facts extracted with consent are stored in `evidence_facts` until the evidence item or case is deleted.
- Screened values are stored: amounts, dates, references, UPI IDs, phone numbers, account digits as shown,
  the other party's name and fixed event labels.
- Never stored:
  - images, PDFs and chat text;
  - balances, the account holder's name or own account, and message text or sender names;
  - OTPs, PINs, CVVs, passwords and card numbers. Values are rejected at the adapters and again in the
    request schema; a chat message containing one yields only a "value withheld" event.

Other controls:

- **Consent per file.** The screenshot dialog states that used or saved details become unreviewed facts.
  The statement and chat dialog explains that the file is parsed in the browser by fixed rules and that
  only the ticked lines are sent.
- **No client-supplied values for screenshots.** The server keeps its own validated reading (30 min,
  in memory) and the client sends only its id.
- **Authorisation.** Server-side ownership checks on every id. Cross-case ids are not found (404).
- **Limits.**
  - Body size (413).
  - Analyses per user per hour (429).
  - Array and string bounds.
  - Existing screenshot read limit.
- **Logs.** Only Foundry response ids and error classes, as before. The graph error boundary logs only
  the error name.
- **Untrusted content.** Text in files is data: no rule reads a status or outcome from message text,
  links are never opened, and the PDF text layer is the only part used.
- **Masking.** Identifiers are masked in the graph (`••••9213`, `qu••••••@okdemo`). Full values are shown
  only in the detail panel when the person asks.
- **`store: false`.** This applies to the Foundry Responses calls. It keeps responses out of Foundry's
  response store, but it is not a guarantee about every form of provider-side processing or abuse
  monitoring — see the Azure OpenAI data-privacy documentation. The application itself keeps no image
  or prompt.

## Testing and evaluation

```bash
npm test          # unit tests incl. Evidence Intelligence (no DB, no network, Foundry faked)
npm run test:db   # PostgreSQL integration tests (needs `npm run db:up && npm run db:deploy`)
npm run test:ui   # server-rendered component checks (react-dom/server, no browser)
```

| Suite                                            | Covers                                                                                                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalize.test.ts`                              | Amounts/paise, decimal safety, references, UPI, phones, accounts, India-time dates, corrections, masking                                                                                                               |
| `parsers.test.ts`                                | Screenshot and case adapters, chat parser (incl. OTP / card / injection traps), statement parser, the real example PDF                                                                                                 |
| `matching.test.ts`                               | Every §6.2 case: same/different UTR, conflicting amount, same amount unrelated, debit vs credit, duplicates, multiple transactions, partial evidence, reversal, contradictory recipients, uncertain times, determinism |
| `graph.test.ts`                                  | Stable ids, no dangling edges, attribution, conflicts until reviewed, empty and partial graphs, filters, layout, digest has no values                                                                                  |
| `evaluation.test.ts`                             | Labelled fixtures → printed metrics (see below)                                                                                                                                                                        |
| `server/evidence-intelligence.test.ts`           | Review/analyse validation, 413, pending-reading isolation, rate limit, agent input has no values, accusation screening                                                                                                 |
| `server/evidence-graph.integration.test.ts`      | Real Postgres: idempotency, concurrency, review persistence, re-extraction, conflict lifecycle, corrections, IDOR, re-match on case edits and deletes                                                                  |
| `components/…/evidence-intelligence.ui.test.tsx` | Rendered nodes, labels, masking, conflict comparison, selection, list view                                                                                                                                             |

The evaluation prints match precision/recall, conflict detection, sensitive-value rejection,
unsupported-claim screening and matching latency. On the bundled **fictional** fixtures, all four rates
are 1.00 and matching takes about 2 ms for 180 facts. Those numbers say the rules behave as designed on
those fixtures. They are **not** an accuracy claim for real screenshots, statements or chats; the vision
model's extraction accuracy is measured separately with `npm run test:extract` (live Foundry, opt-in).

## Known limitations

- No authentication yet (single demo user), so "unauthenticated → 401" can't be exercised; ownership checks
  are per user id and tested with two users.
- Scanned (image-only) PDFs have no text layer and aren't read (no OCR). Statements whose table lacks
  Date/Debit/Credit headers aren't recognised. Multi-line descriptions are not merged.
- Chat parsing supports WhatsApp-style bracket and dash formats with day-first dates, assumed India time.
- Files are never uploaded, so reading requires the file to be open in the same browser tab (as for
  previews). After a reload, add the file again to read it.
- Readings made in the report wizard (before the case exists) aren't kept; read again from the case.
- Pending screenshot readings and rate limits are in memory, per process.
- The graph is designed for tens of nodes; very large statements are cut to 300 lines / 20 pages.
- UI checks are server-rendered snapshots; click, zoom and keyboard flows were not run in a real browser by
  the automated tests.
