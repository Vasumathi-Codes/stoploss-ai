-- Microsoft Foundry integration. Additive only: existing rows are unaffected.

-- Findings produced by a Foundry model are labelled separately from template output.
ALTER TYPE "FindingSource" ADD VALUE 'ai_analysis';

-- Trace each analysis run to the model deployment and prompt version that produced it.
ALTER TABLE "analysis_runs" ADD COLUMN "model" VARCHAR(120);
ALTER TABLE "analysis_runs" ADD COLUMN "promptVersion" VARCHAR(40);
