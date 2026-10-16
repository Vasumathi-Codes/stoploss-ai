# Database Schema

PostgreSQL 17 · Prisma 7 · source: `prisma/schema.prisma`

All ids are UUIDs (except `official_resources.id`, a slug). Timestamps are `timestamptz`. Deleting a user or incident cascades to everything below it.

## Relationships

```text
users 1─* incidents
incidents 1─* case_notes
incidents 1─* evidence_items
incidents 1─* action_items *─1 official_resources
incidents 1─* analysis_runs 1─* agent_findings
incidents 1─* agent_findings
incidents 1─4 agent_states      (one per agent)
incidents 1─* timeline_events
```

## Tables

### users

| Column            | Type        | Notes                     |
| ----------------- | ----------- | ------------------------- |
| id                | uuid PK     |                           |
| email             | text        | unique                    |
| displayName       | text        |                           |
| preferredLanguage | text        | default `English`         |
| city              | text?       |                           |
| phoneHint         | text?       | masked display value only |
| createdAt         | timestamptz |                           |
| updatedAt         | timestamptz | auto                      |

### incidents

A reported fraud case.

| Column           | Type          | Notes                            |
| ---------------- | ------------- | -------------------------------- |
| id               | uuid PK       |                                  |
| reference        | varchar(20)   | unique, e.g. `SL-2610-4821`      |
| userId           | uuid FK       | → users                          |
| title            | varchar(120)  |                                  |
| category         | FraudCategory |                                  |
| description      | varchar(2000) |                                  |
| amount           | decimal(14,2) |                                  |
| currency         | Currency      | default `INR`                    |
| occurredAt       | timestamptz   |                                  |
| reportedAt       | timestamptz   | default now                      |
| updatedAt        | timestamptz   | auto                             |
| paymentMethod    | varchar(60)   |                                  |
| transactionRef   | varchar(60)?  | UTR / RRN; card numbers rejected |
| hasAccountAccess | TriState      |                                  |
| ongoing          | TriState?     |                                  |
| status           | CaseStatus    | default `reported`               |
| isSample         | boolean       | true for seeded fictional cases  |

Indexes: `(userId, status)`, `(userId, updatedAt desc)`

### case_notes

| Column     | Type          | Notes       |
| ---------- | ------------- | ----------- |
| id         | uuid PK       |             |
| incidentId | uuid FK       | → incidents |
| body       | varchar(1000) |             |
| createdAt  | timestamptz   |             |

### evidence_items

Metadata only. File contents stay on the user's device.

| Column      | Type           | Notes                                |
| ----------- | -------------- | ------------------------------------ |
| id          | uuid PK        |                                      |
| incidentId  | uuid FK        | → incidents                          |
| name        | varchar(255)   | file name                            |
| kind        | EvidenceKind   |                                      |
| mimeType    | varchar(127)   | png, jpeg, pdf or txt                |
| size        | int            | bytes, max 10 MB                     |
| description | varchar(500)?  |                                      |
| textPreview | varchar(2000)? | unused by the app today              |
| storageKey  | text?          | reserved for future blob storage     |
| sha256      | char(64)?      | reserved for future integrity checks |
| isSample    | boolean        |                                      |
| addedAt     | timestamptz    |                                      |

### action_items

Steps in a case's response plan.

| Column       | Type            | Notes                             |
| ------------ | --------------- | --------------------------------- |
| id           | uuid PK         |                                   |
| incidentId   | uuid FK         | → incidents                       |
| key          | varchar(60)     | playbook key; unique per incident |
| title        | text            |                                   |
| explanation  | text            |                                   |
| priority     | ActionPriority  |                                   |
| status       | ActionStatus    | default `pending`                 |
| origin       | ActionOrigin    |                                   |
| timing       | text            | plain-language timing             |
| instructions | text[]          |                                   |
| requiredInfo | text[]          |                                   |
| dependsOn    | text[]          | keys of prerequisite actions      |
| resourceId   | varchar(60)? FK | → official_resources (set null)   |
| createdAt    | timestamptz     | also the display order            |
| updatedAt    | timestamptz     | auto                              |
| completedAt  | timestamptz?    |                                   |

Unique: `(incidentId, key)` · Index: `(incidentId, status)`

### analysis_runs

One pass of all four agents over a case.

| Column      | Type              | Notes             |
| ----------- | ----------------- | ----------------- |
| id          | uuid PK           |                   |
| incidentId  | uuid FK           | → incidents       |
| engine      | AnalysisEngine    | default `mock`    |
| status      | AnalysisRunStatus | default `running` |
| startedAt   | timestamptz       |                   |
| completedAt | timestamptz?      |                   |
| error       | text?             | set when failed   |

### agent_states

Current status of each agent per case.

| Column      | Type         | Notes                 |
| ----------- | ------------ | --------------------- |
| incidentId  | uuid PK, FK  | → incidents           |
| agentId     | AgentId PK   |                       |
| status      | AgentStatus  | default `not_started` |
| currentTask | text         |                       |
| startedAt   | timestamptz? |                       |
| completedAt | timestamptz? |                       |
| updatedAt   | timestamptz  | auto                  |

Primary key: `(incidentId, agentId)`

### agent_findings

| Column     | Type          | Notes                            |
| ---------- | ------------- | -------------------------------- |
| id         | uuid PK       |                                  |
| incidentId | uuid FK       | → incidents                      |
| runId      | uuid? FK      | → analysis_runs (set null)       |
| agentId    | AgentId       |                                  |
| title      | text          |                                  |
| detail     | text          |                                  |
| source     | FindingSource | always shown next to the finding |
| items      | text[]        | checklist / list content         |
| confidence | Confidence?   |                                  |
| position   | int           | order within one agent's output  |
| createdAt  | timestamptz   |                                  |

Index: `(incidentId, agentId, position)`

### timeline_events

Case activity feed; also feeds notifications.

| Column     | Type          | Notes                 |
| ---------- | ------------- | --------------------- |
| id         | uuid PK       |                       |
| incidentId | uuid FK       | → incidents           |
| at         | timestamptz   |                       |
| actor      | TimelineActor |                       |
| agentId    | AgentId?      | when actor is `agent` |
| title      | text          |                       |
| detail     | text?         |                       |
| tone       | TimelineTone  | default `neutral`     |
| readAt     | timestamptz?  | set when dismissed    |

Indexes: `(incidentId, at desc)`, `(at desc)`

### official_resources

Reference data, seeded from `src/lib/config/official-resources.ts`.

| Column       | Type           | Notes                              |
| ------------ | -------------- | ---------------------------------- |
| id           | varchar(60) PK | slug, e.g. `ncrp`, `helpline-1930` |
| organization | text           |                                    |
| name         | text           |                                    |
| purpose      | text           |                                    |
| relevance    | text           |                                    |
| kind         | ResourceKind   |                                    |
| url          | text?          |                                    |
| phone        | varchar(30)?   |                                    |
| note         | text?          |                                    |
| verifiedAt   | timestamptz?   | null = not yet verified            |
| createdAt    | timestamptz    |                                    |
| updatedAt    | timestamptz    | auto                               |

## Enums

| Enum              | Values                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| FraudCategory     | upi_payment, phishing, banking_card, impersonation, account_takeover, investment, shopping, other                         |
| CaseStatus        | draft, reported, analysis_in_progress, action_plan_ready, user_action_required, reporting_in_progress, resolved, archived |
| TriState          | yes, no, unsure                                                                                                           |
| Currency          | INR, USD, EUR, GBP, AED                                                                                                   |
| EvidenceKind      | image, pdf, text, other                                                                                                   |
| AgentId           | incident, containment, evidence, recovery                                                                                 |
| AgentStatus       | not_started, analyzing, awaiting_information, completed, needs_review                                                     |
| FindingSource     | mock_analysis, user_supplied, verified_guidance, unverified_assumption                                                    |
| Confidence        | low, medium, high                                                                                                         |
| AnalysisRunStatus | running, completed, cancelled, failed                                                                                     |
| AnalysisEngine    | mock, foundry                                                                                                             |
| ActionPriority    | urgent, high, normal                                                                                                      |
| ActionStatus      | pending, in_progress, completed                                                                                           |
| ActionOrigin      | suggested (user does it), external (bank/police process the app can't verify)                                             |
| TimelineActor     | user, agent, system                                                                                                       |
| TimelineTone      | neutral, success, warning, info                                                                                           |
| ResourceKind      | portal, helpline, provider, regulator, telecom                                                                            |

## Never stored

Passwords, UPI PINs, OTPs, CVVs, full card numbers, banking logins, evidence file contents.

## Commands

```bash
npm run db:up        # start Postgres (Docker)
npm run db:deploy    # apply migrations
npm run db:migrate   # create a migration after editing the schema
npm run db:seed      # restore sample data
npm run db:studio    # browse data
```
