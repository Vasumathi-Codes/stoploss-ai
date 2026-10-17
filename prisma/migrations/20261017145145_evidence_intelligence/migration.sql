-- Evidence Intelligence. Additive only: existing cases and evidence metadata are unaffected.
-- Rollback: drop the four new tables, the three evidence_items columns and the new enum types.
-- (Postgres cannot drop the added FindingSource value; it is harmless if left unused.)

-- CreateEnum
CREATE TYPE "EvidenceProcessingStatus" AS ENUM ('not_processed', 'processed', 'no_facts', 'failed', 'unsupported');

-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('payment_screenshot', 'sms_notification', 'bank_statement', 'chat_export', 'case_details', 'other_document');

-- CreateEnum
CREATE TYPE "EvidenceRecordRole" AS ENUM ('transaction', 'context');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('vision_model', 'statement_parser', 'chat_parser', 'user_entry');

-- CreateEnum
CREATE TYPE "EvidenceFactType" AS ENUM ('amount', 'transaction_reference', 'transaction_datetime', 'recipient_upi_id', 'recipient_phone', 'recipient_account', 'recipient_name', 'payment_method', 'transaction_direction', 'transaction_status', 'message_event', 'other');

-- CreateEnum
CREATE TYPE "TimePrecision" AS ENUM ('minute', 'day');

-- CreateEnum
CREATE TYPE "FactReviewStatus" AS ENUM ('unreviewed', 'user_confirmed', 'user_rejected', 'user_corrected', 'needs_verification');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('match', 'partial_match', 'conflict', 'insufficient_evidence', 'unrelated');

-- CreateEnum
CREATE TYPE "EvidenceRelation" AS ENUM ('corroborates', 'conflicts_with', 'possibly_same_transaction', 'related_context');

-- CreateEnum
CREATE TYPE "MatchReviewStatus" AS ENUM ('open', 'reviewed', 'deferred');

-- CreateEnum
CREATE TYPE "EvidenceReviewAction" AS ENUM ('confirm', 'reject', 'correct', 'mark_needs_verification', 'reset', 'review_conflict', 'defer_conflict', 'reextracted_changed');

-- AlterEnum
ALTER TYPE "FindingSource" ADD VALUE 'evidence_check';

-- AlterTable
ALTER TABLE "evidence_items" ADD COLUMN     "processedAt" TIMESTAMPTZ(3),
ADD COLUMN     "processingError" VARCHAR(200),
ADD COLUMN     "processingStatus" "EvidenceProcessingStatus" NOT NULL DEFAULT 'not_processed';

-- CreateTable
CREATE TABLE "evidence_facts" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "evidenceId" UUID,
    "transactionId" UUID,
    "factKey" VARCHAR(200) NOT NULL,
    "recordKey" VARCHAR(160) NOT NULL,
    "recordRole" "EvidenceRecordRole" NOT NULL,
    "factType" "EvidenceFactType" NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "extractorVersion" VARCHAR(80),
    "rawValue" VARCHAR(200) NOT NULL,
    "normalizedValue" VARCHAR(200) NOT NULL,
    "amountMinor" BIGINT,
    "currency" "Currency",
    "occurredAt" TIMESTAMPTZ(3),
    "timePrecision" "TimePrecision",
    "sourceLocation" VARCHAR(120),
    "reviewStatus" "FactReviewStatus" NOT NULL DEFAULT 'unreviewed',
    "correctedValue" VARCHAR(200),
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_candidates" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "candidateKey" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transaction_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_matches" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "matchKey" VARCHAR(300) NOT NULL,
    "ruleId" VARCHAR(60) NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "relation" "EvidenceRelation" NOT NULL,
    "factAId" UUID NOT NULL,
    "factBId" UUID NOT NULL,
    "transactionId" UUID,
    "explanation" VARCHAR(600) NOT NULL,
    "uncertainty" VARCHAR(300),
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "MatchReviewStatus" NOT NULL DEFAULT 'open',
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_review_events" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "factId" UUID,
    "matchId" UUID,
    "action" "EvidenceReviewAction" NOT NULL,
    "fromStatus" VARCHAR(40),
    "toStatus" VARCHAR(40),
    "actor" "TimelineActor" NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_facts_incidentId_factType_idx" ON "evidence_facts"("incidentId", "factType");

-- CreateIndex
CREATE INDEX "evidence_facts_evidenceId_idx" ON "evidence_facts"("evidenceId");

-- CreateIndex
CREATE INDEX "evidence_facts_transactionId_idx" ON "evidence_facts"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_facts_incidentId_factKey_key" ON "evidence_facts"("incidentId", "factKey");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_candidates_incidentId_candidateKey_key" ON "transaction_candidates"("incidentId", "candidateKey");

-- CreateIndex
CREATE INDEX "evidence_matches_factAId_idx" ON "evidence_matches"("factAId");

-- CreateIndex
CREATE INDEX "evidence_matches_factBId_idx" ON "evidence_matches"("factBId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_matches_incidentId_matchKey_key" ON "evidence_matches"("incidentId", "matchKey");

-- CreateIndex
CREATE INDEX "evidence_review_events_incidentId_createdAt_idx" ON "evidence_review_events"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_candidates" ADD CONSTRAINT "transaction_candidates_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_matches" ADD CONSTRAINT "evidence_matches_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_matches" ADD CONSTRAINT "evidence_matches_factAId_fkey" FOREIGN KEY ("factAId") REFERENCES "evidence_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_matches" ADD CONSTRAINT "evidence_matches_factBId_fkey" FOREIGN KEY ("factBId") REFERENCES "evidence_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_matches" ADD CONSTRAINT "evidence_matches_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_review_events" ADD CONSTRAINT "evidence_review_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_review_events" ADD CONSTRAINT "evidence_review_events_factId_fkey" FOREIGN KEY ("factId") REFERENCES "evidence_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_review_events" ADD CONSTRAINT "evidence_review_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "evidence_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
