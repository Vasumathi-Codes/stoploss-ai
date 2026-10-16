# STOPLOSS AI — Project Overview

**When every minute matters, know what to do next.**

## Problem

Victims of digital payment fraud (UPI scams, phishing, card fraud, account takeover) panic and don't know what to do first. Each minute of delay makes recovery harder, and the right steps are spread across banks, helplines and government portals.

## Solution

One calm interface that helps a victim:

1. **Report** what happened through a short guided form.
2. **Act** on a prioritised checklist of urgent steps.
3. **Organise** evidence (screenshots, statements, references).
4. **Prepare** an official complaint with the right channels and details.

STOPLOSS AI is a guidance tool. It never promises recovery, never contacts a bank or the police, and never files a complaint on the user's behalf.

## AI Emergency Team

Four specialised agents work on each case: Incident first, Containment and Evidence in parallel, then the Recovery Coordinator.

| Agent                | Role                                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| Incident Agent       | Reconstructs what happened, suggests a category, flags missing details |
| Containment Agent    | Builds the prioritised action plan from configured guidance            |
| Evidence Agent       | Lists the evidence collected and points out gaps                       |
| Recovery Coordinator | Prepares a complaint checklist and tracks progress                     |

Every finding is labelled with its source: AI analysis, mock analysis, user-supplied, guidance, or unverified assumption.

**Today:** agents run on a Microsoft Foundry model when configured (`src/server/foundry`), with deterministic templates as the fallback.

## Features

- Dashboard: active case, urgent actions, agent status, recent activity
- Four-step fraud report wizard with validation that blocks PINs, OTPs and card numbers
- Case management: search, filter, case detail with tabs (overview, analysis, plan, evidence, timeline, notes)
- Action plans: start, complete, reopen; dependencies; linked official resources
- Evidence Vault: local previews, metadata saved per case
- Official reporting directory (India): National Cyber Crime Reporting Portal, 1930 helpline, bank support, RBI, Sanchar Saathi
- Learning resources, profile, settings, demo reset

## Tech Stack

| Layer    | Choice                                                 |
| -------- | ------------------------------------------------------ |
| Frontend | Next.js 16 (App Router), React 19, TypeScript          |
| UI       | Tailwind CSS 4, shadcn/ui, Lucide icons, Sonner toasts |
| State    | Zustand (client cache of server data)                  |
| Forms    | React Hook Form + Zod                                  |
| Backend  | Next.js route handlers (`src/app/api`)                 |
| Database | PostgreSQL 17 (Docker) via Prisma 7                    |
| AI       | Microsoft Foundry (OpenAI v1 endpoint, Responses API)  |

## Architecture

```text
Browser (React UI)
   │  services (src/lib/services)  ──fetch──►  /api/* route handlers
   │                                              │
   │  zustand store ◄── snapshot ─────────────────┤
   │                                              ▼
   │                                   src/server (cases, analysis)
   │                                              │ Prisma
   ▼                                              ▼
Evidence files stay here                    PostgreSQL
```

- Every write returns a fresh snapshot, so the UI always matches the database.
- Analysis starts with `POST /api/incidents/:id/analysis`; the agents run after the response, and the UI polls until they finish.
- See [DATABASE.md](./DATABASE.md) for the schema and the main [README](../README.md) for the API list.

## Privacy & Safety

- No passwords, PINs, OTPs or card numbers are collected or stored; both the forms and the API reject them.
- Evidence files never leave the device; only name, type and size are saved.
- A visible Demo Mode banner; all sample data is fictional.
- Official resources are marked "not yet verified" until someone actually checks them.

## Running Locally

```bash
npm install
cp .env.example .env
npm run db:up && npm run db:deploy && npm run db:seed
npm run dev   # http://localhost:3000
```

## Status

| Done                            | Next                                      |
| ------------------------------- | ----------------------------------------- |
| Full frontend (all screens)     | Authentication                            |
| Backend API + PostgreSQL schema | Secure evidence file storage (Azure Blob) |
| Microsoft Foundry agents        | Verify official resource details          |
| Template fallback, seed, reset  | Deploy to Azure (Container Apps)          |
