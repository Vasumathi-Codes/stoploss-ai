-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FraudCategory" AS ENUM ('upi_payment', 'phishing', 'banking_card', 'impersonation', 'account_takeover', 'investment', 'shopping', 'other');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('draft', 'reported', 'analysis_in_progress', 'action_plan_ready', 'user_action_required', 'reporting_in_progress', 'resolved', 'archived');

-- CreateEnum
CREATE TYPE "TriState" AS ENUM ('yes', 'no', 'unsure');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('INR', 'USD', 'EUR', 'GBP', 'AED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('image', 'pdf', 'text', 'other');

-- CreateEnum
CREATE TYPE "AgentId" AS ENUM ('incident', 'containment', 'evidence', 'recovery');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('not_started', 'analyzing', 'awaiting_information', 'completed', 'needs_review');

-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('mock_analysis', 'user_supplied', 'verified_guidance', 'unverified_assumption');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('running', 'completed', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "AnalysisEngine" AS ENUM ('mock', 'foundry');

-- CreateEnum
CREATE TYPE "ActionPriority" AS ENUM ('urgent', 'high', 'normal');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('pending', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "ActionOrigin" AS ENUM ('suggested', 'external');

-- CreateEnum
CREATE TYPE "TimelineActor" AS ENUM ('user', 'agent', 'system');

-- CreateEnum
CREATE TYPE "TimelineTone" AS ENUM ('neutral', 'success', 'warning', 'info');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('portal', 'helpline', 'provider', 'regulator', 'telecom');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
    "city" TEXT,
    "phoneHint" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "category" "FraudCategory" NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "paymentMethod" VARCHAR(60) NOT NULL,
    "transactionRef" VARCHAR(60),
    "hasAccountAccess" "TriState" NOT NULL,
    "ongoing" "TriState",
    "status" "CaseStatus" NOT NULL DEFAULT 'reported',
    "isSample" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "size" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "textPreview" VARCHAR(2000),
    "storageKey" TEXT,
    "sha256" CHAR(64),
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "priority" "ActionPriority" NOT NULL,
    "status" "ActionStatus" NOT NULL DEFAULT 'pending',
    "origin" "ActionOrigin" NOT NULL,
    "timing" TEXT NOT NULL,
    "instructions" TEXT[],
    "requiredInfo" TEXT[],
    "dependsOn" TEXT[],
    "resourceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "engine" "AnalysisEngine" NOT NULL DEFAULT 'mock',
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "error" TEXT,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_states" (
    "incidentId" UUID NOT NULL,
    "agentId" "AgentId" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'not_started',
    "currentTask" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_states_pkey" PRIMARY KEY ("incidentId","agentId")
);

-- CreateTable
CREATE TABLE "agent_findings" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "runId" UUID,
    "agentId" "AgentId" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "source" "FindingSource" NOT NULL,
    "items" TEXT[],
    "confidence" "Confidence",
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" "TimelineActor" NOT NULL,
    "agentId" "AgentId",
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "tone" "TimelineTone" NOT NULL DEFAULT 'neutral',
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_resources" (
    "id" VARCHAR(60) NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "relevance" TEXT NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "url" TEXT,
    "phone" VARCHAR(30),
    "note" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "official_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_reference_key" ON "incidents"("reference");

-- CreateIndex
CREATE INDEX "incidents_userId_status_idx" ON "incidents"("userId", "status");

-- CreateIndex
CREATE INDEX "incidents_userId_updatedAt_idx" ON "incidents"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "case_notes_incidentId_createdAt_idx" ON "case_notes"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "evidence_items_incidentId_addedAt_idx" ON "evidence_items"("incidentId", "addedAt" DESC);

-- CreateIndex
CREATE INDEX "action_items_incidentId_status_idx" ON "action_items"("incidentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "action_items_incidentId_key_key" ON "action_items"("incidentId", "key");

-- CreateIndex
CREATE INDEX "analysis_runs_incidentId_startedAt_idx" ON "analysis_runs"("incidentId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "agent_findings_incidentId_agentId_position_idx" ON "agent_findings"("incidentId", "agentId", "position");

-- CreateIndex
CREATE INDEX "timeline_events_incidentId_at_idx" ON "timeline_events"("incidentId", "at" DESC);

-- CreateIndex
CREATE INDEX "timeline_events_at_idx" ON "timeline_events"("at" DESC);

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "official_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_states" ADD CONSTRAINT "agent_states_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

