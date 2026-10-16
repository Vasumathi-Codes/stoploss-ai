# STOPLOSS AI

**When every minute matters, know what to do next.**

STOPLOSS AI helps victims of digital payment fraud understand what happened, prioritise next steps, organise evidence and prepare official complaints. It is a guidance and coordination tool: it never promises recovery, freezes accounts, or contacts banks or police on anyone's behalf.

> **Current phase: full stack, Demo Mode.** Next.js serves both the UI and the API (route handlers in `src/app/api`), with PostgreSQL via Prisma as the source of truth. The four "AI agents" are still a deterministic simulation that runs on the server — no AI model or Microsoft Foundry is connected yet.

## Getting started

Requires Node.js 20+ and Docker (for PostgreSQL).

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # local-only credentials matching docker-compose.yml
npm run db:up          # start PostgreSQL 17 in Docker (port 5432)
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
- **Agents.** `src/server/analysis.ts` runs the four agents in order after the response (`after()`), writing agent states, findings, actions and timeline events as it goes; the client polls `/api/state` while a run is in progress. A rerun cancels any run in progress, and runs interrupted by a restart are marked failed. Microsoft Foundry slots in here, recorded as `engine: "foundry"`.
- **Privacy.** Evidence files never leave the browser — only name, type and size are sent. Previews exist only in the tab where the file was added. Incident data is not written to browser storage; only UI preferences persist in `localStorage`.
- **Official resources** are defined in `lib/config/official-resources.ts` and seeded into the database. All are marked _not yet verified_. Verify every URL and number before production and record real verification dates.

## Known limitations

- No authentication yet: every request acts as a single demo user (`src/server/context.ts`).
- No file storage: evidence previews are lost when the tab closes (the metadata stays).
- No real AI: agents use fixed templates.
- Agent output is template-based and does not read file contents.
- Learning content and resource entries need review by qualified people before launch.
