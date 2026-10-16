# STOPLOSS AI

**When every minute matters, know what to do next.**

STOPLOSS AI helps victims of digital payment fraud understand what happened, prioritise next steps, organise evidence and prepare official complaints. It is a guidance and coordination tool: it never promises recovery, freezes accounts, or contacts banks or police on anyone's behalf.

> **Current phase: frontend only (Demo Mode).** All data is fictional and in memory. The four "AI agents" are a deterministic simulation — no AI model, Microsoft Foundry, database or backend is connected.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables or credentials are needed.

| Script                            | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Start the dev server                        |
| `npm run build` / `npm start`     | Production build / serve                    |
| `npm run lint`                    | ESLint                                      |
| `npm run typecheck`               | Generate route types and run `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier                                    |

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
src/
  app/(app)/…            Routes (thin server pages rendering client views)
  components/            UI by feature; components/ui = shadcn/ui
  features/*/hooks.ts    Read hooks over the store (what pages consume)
  lib/
    config/              Taxonomy, agents, nav, official resources, learning content
    services/            Service interfaces (types.ts) + mock implementations (mock/)
    store/               In-memory demo store (zustand) + persisted UI preferences
    mock-data/seed.ts    Fictional seed dataset
    validation/          Zod schemas
  types/                 Domain types
```

- **Service boundary.** Components write only through `@/lib/services` (`incidentService`, `caseService`, `evidenceService`, `actionPlanService`, `agentService`, …). Swap `lib/services/mock` for API-backed implementations later; Microsoft Foundry belongs behind `AgentService` on the server, and PostgreSQL behind the case/evidence/action services.
- **Simulation.** `agentService.runAnalysis` steps through the four agents with fixed templates (`lib/services/mock/playbooks.ts`). Agent statuses and case statuses come from real state (e.g. a missing transaction reference keeps the Evidence Agent in _Awaiting Information_ until the user adds one).
- **Privacy.** Incident data and evidence are never written to browser storage. Only non-sensitive UI preferences (theme, sidebar, notifications, external-link confirmation) persist in `localStorage`. Uploaded files stay in the tab as object URLs and are revoked on removal or reset.
- **Official resources** live in `lib/config/official-resources.ts` and are all marked _not yet verified_. Verify every URL and number before production and record real verification dates.

## Known limitations

- Refreshing the page resets demo data to the seed (by design).
- No authentication, backend, database, file storage or real AI.
- Agent output is template-based and does not read file contents.
- Learning content and resource entries need review by qualified people before launch.
