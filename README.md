# STOPLOSS AI

**When every minute matters, know what to do next.**

STOPLOSS AI helps victims of digital payment fraud understand what happened, prioritise next steps, organise evidence and prepare official complaints. It is a guidance and coordination tool: it never promises recovery, freezes accounts, or contacts banks or police on anyone's behalf.

> **Current phase: full stack, Demo Mode.** Next.js serves both the UI and the API (route handlers in `src/app/api`), with PostgreSQL via Prisma as the source of truth. The four AI agents run on **Microsoft Foundry** when it is configured (see [Microsoft Foundry](#microsoft-foundry)); otherwise they fall back to a deterministic template simulation on the server.

## Getting started

Requires Node.js 20+ and Docker (for PostgreSQL).

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # local-only credentials matching docker-compose.yml
npm run db:up          # start PostgreSQL 17 in Docker (port 5435)
npm run db:deploy      # apply migrations
npm run db:seed        # load 3 fictional sample cases + official resources
npm run dev            # http://localhost:3000
```

| Script                            | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `npm run dev`                     | Start the dev server (UI + API)                       |
| `npm run build` / `npm start`     | Production build / serve                              |
| `npm run lint`                    | ESLint                                                |
| `npm run typecheck`               | Generate route types and run `tsc --noEmit`           |
| `npm run format` / `format:check` | Prettier                                              |
| `npm run db:up` / `db:down`       | Start / stop the Postgres container                   |
| `npm run db:migrate`              | Create and apply a migration after editing the schema |
| `npm run db:deploy`               | Apply existing migrations                             |
| `npm run db:seed`                 | Reset the demo user's cases to the sample data        |
| `npm run db:reset`                | Drop the database, re-migrate and re-seed             |
| `npm run db:studio`               | Browse the data in Prisma Studio                      |

## Routes

| Route                                 | Screen                                                         |
| ------------------------------------- | -------------------------------------------------------------- |
| `/dashboard` (default)                | Overview, active case, immediate actions, agent team, activity |
| `/incidents/new`                      | Multi-step fraud report wizard                                 |
| `/cases`, `/cases/[id]`               | Case list (search/filter/sort, grid/list) and case detail tabs |
| `/agents`                             | AI Emergency Team — simulated multi-agent analysis             |
| `/action-plans`, `/action-plans/[id]` | Response steps across cases and per case                       |
| `/evidence`                           | Evidence Vault with local previews and package preview         |
| `/reporting`                          | Official reporting channels (central config)                   |
| `/resources`                          | Learning guides                                                |
| `/profile`, `/settings`               | Demo profile, preferences, demo data reset                     |

## Architecture

```text
prisma/
  schema.prisma          Database schema (enums mirror src/types)
  migrations/            SQL migrations
  seed.ts                Seed entry point (uses src/server/seed.ts)
src/
  app/(app)/…            UI routes (thin server pages rendering client views)
  app/api/…              REST route handlers
  server/                Server-only logic: Prisma client, case operations, agent orchestration, seed data
  components/            UI by feature; components/ui = shadcn/ui
  features/*/hooks.ts    Read hooks over the client store (what pages consume)
  lib/
    config/              Taxonomy, agents, nav, official resources, learning content
    playbooks.ts         Deterministic agent templates (shared by server and UI)
    services/            Service interfaces (types.ts) + API client (api/)
    store/               Client cache of the server snapshot (zustand) + persisted UI preferences
    validation/          Zod schemas for forms (incident.ts) and API bodies (api.ts)
  types/                 Domain types
```

### Data model

| Table                | Holds                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| `users`              | Profile of the (single, demo) user                                          |
| `incidents`          | A reported case: category, amount, dates, payment method, status            |
| `case_notes`         | User notes on a case                                                        |
| `evidence_items`     | Evidence **metadata** (name, type, size). File contents are never stored    |
| `action_items`       | Response-plan steps, unique per case by playbook `key`                      |
| `analysis_runs`      | History of each analysis pass (`engine`: mock / foundry, status, errors)    |
| `agent_states`       | Current status of each of the four agents per case                          |
| `agent_findings`     | Agent output, each labelled with its source (mock, user-supplied, guidance) |
| `timeline_events`    | Case activity feed; `readAt` drives the notifications menu                  |
| `official_resources` | Reporting channels; `verifiedAt` is null until actually verified            |

### API

| Method & path                             | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/state`                          | Everything the UI shows for the current user                                |
| `GET /api/health`                         | Database connectivity check                                                 |
| `POST /api/incidents`                     | Create a case (with evidence metadata)                                      |
| `PATCH /api/incidents/:id`                | Change status or add the transaction reference                              |
| `POST /api/incidents/:id/analysis`        | Start or rerun the agents (202, runs after response)                        |
| `POST /api/incidents/:id/notes`           | Add a note                                                                  |
| `DELETE /api/incidents/:id/notes/:noteId` | Delete a note                                                               |
| `POST /api/incidents/:id/evidence`        | Record evidence metadata                                                    |
| `DELETE /api/evidence/:id`                | Remove an evidence record                                                   |
| `PATCH /api/actions/:id`                  | Set an action's status                                                      |
| `GET /api/resources`                      | Official reporting channels                                                 |
| `PATCH /api/profile`                      | Update the profile                                                          |
| `POST /api/notifications/read`            | Mark timeline events read                                                   |
| `POST /api/demo/reset`                    | Restore sample data (disabled in production unless `ALLOW_DEMO_RESET=true`) |

Mutations respond with `{ snapshot }` (the same shape as `GET /api/state`) so the client cache never drifts from the database. Bodies are validated with Zod on the server, including the same checks as the forms that reject PINs, OTPs, passwords and card numbers.

- **Service boundary.** Components write only through `@/lib/services`, which calls the API. Pages never import Prisma or a vendor SDK.
- **Agents.** `src/server/analysis.ts` runs the four agents after the response (`after()`) — Incident, then Containment and Evidence in parallel, then Recovery (`src/server/pipeline.ts`) — writing agent states, findings, actions and timeline events as it goes; the client polls `/api/state` while a run is in progress. Starting a run while one is live returns 409; runs interrupted by a restart are marked failed and can be rerun. With Foundry configured, each agent is a model call (`src/server/foundry`), recorded with `engine: "foundry"`, the deployment and the prompt version.
- **Privacy.** Evidence files never leave the browser — only name, type and size are sent. Previews exist only in the tab where the file was added. Incident data is not written to browser storage; only UI preferences persist in `localStorage`.
- **Official resources** are defined in `lib/config/official-resources.ts` and seeded into the database. All are marked _not yet verified_. Verify every URL and number before production and record real verification dates.

## Known limitations

- No authentication yet: every request acts as a single demo user (`src/server/context.ts`).
- No file storage: evidence previews are lost when the tab closes (the metadata stays).
- Without Foundry configured, agents use fixed templates. Neither engine reads evidence file contents.
- Learning content and resource entries need review by qualified people before launch.

## Microsoft Foundry

The agents call a model deployment in your Foundry resource through its OpenAI-compatible v1 endpoint (`openai` + `@azure/identity`). Set in `.env`:

| Variable                    | Value                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FOUNDRY_ENDPOINT`          | `https://<resource>.openai.azure.com/openai/v1/` (Foundry portal → Home → Azure OpenAI endpoint, plus `/v1/`)                                    |
| `FOUNDRY_DEPLOYMENT`        | Your model deployment name, e.g. `gpt-5-mini`                                                                                                    |
| `FOUNDRY_API_KEY`           | Optional. Leave empty to use Microsoft Entra ID (`az login` locally, managed identity in Azure — needs the _Azure AI User_ role on the resource) |
| `ANALYSIS_ENGINE`           | `auto` (default), `foundry` or `mock`                                                                                                            |
| `FOUNDRY_MAX_RUNS_PER_HOUR` | Cost cap per user (default 20); beyond it the API returns 429                                                                                    |

How a run works (`src/server/analysis.ts`):

1. Incident runs first; Containment and Evidence then run in parallel on its findings; the Recovery Coordinator combines all three.
2. Each call uses strict JSON-schema output, validated with Zod. Output that promises recovery, claims to have contacted or filed anything, or asks for PINs/OTPs is dropped.
3. The model may only label its findings `ai_analysis` or `unverified_assumption`. The action plan and "verified guidance" checklists still come from the curated playbooks.
4. The model sees case details and evidence _metadata_ — never file contents or the transaction reference value. Requests are sent with `store: false`.
5. Instructions tell the model to treat all case data as data, never as instructions (prompt-injection guard), and the user's text is only ever in the input, never in the instructions.
6. If a call fails or times out (one retry), that agent falls back to templates, is marked _Needs review_, and the timeline says so; the run records which agents fell back. Rerunning is safe — actions are keyed, so none are duplicated and your progress is kept.
7. Logs carry the run id, agent and Foundry response id — never case content.

Restart the dev server after changing `.env`.

```bash
npm test               # unit tests — Foundry is always faked, no Azure needed
npm run test:foundry   # ONE live call with a fictional case, to check your endpoint, key and deployment
```

**Why the Responses API rather than hosted Foundry agents?** Each agent is a stateless call with its own instructions and a strict output schema, sent with `store: false`, so no case data stays in Foundry and there is nothing to provision or clean up. All four agents share one deployment. Registering them as Foundry prompt agents (`@azure/ai-projects`, `agents.createVersion`) is a later option if you want them visible and traced in the portal.

Sample cases keep their seeded template analysis until you rerun them.
