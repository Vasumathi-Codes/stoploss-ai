import type { AnalysisEngine } from "@/types"

/** UI wording for each analysis engine, so labels always match what actually ran. */
export const ANALYSIS_COPY: Record<
  AnalysisEngine,
  {
    title: string
    run: string
    rerun: string
    running: string
    rerunTitle: string
    started: string
    finished: string
    startedDetail: string
    /** Appended to agent names in activity feeds. */
    agentSuffix: string
    disclaimer: string
    emptyPrompt: string
  }
> = {
  mock: {
    title: "Simulated Demo Analysis",
    run: "Run simulated analysis",
    rerun: "Rerun simulation",
    running: "Running simulation…",
    rerunTitle: "Rerun the simulated analysis?",
    started: "Simulated analysis started",
    finished: "Simulated analysis finished",
    startedDetail: "demo workflow, no AI model is called",
    agentSuffix: " (simulated)",
    disclaimer:
      "Generated on the server from fixed templates and your inputs. No AI model, Microsoft Foundry or external check is involved.",
    emptyPrompt: "Run the simulated analysis",
  },
  foundry: {
    title: "AI Analysis · Microsoft Foundry",
    run: "Run AI analysis",
    rerun: "Rerun AI analysis",
    running: "Agents analysing…",
    rerunTitle: "Rerun the AI analysis?",
    started: "AI analysis started",
    finished: "AI analysis finished",
    startedDetail: "Microsoft Foundry agents are reviewing the case",
    agentSuffix: " (AI)",
    disclaimer:
      "The agents send your case details (not your evidence files) to a Microsoft Foundry model. AI output can be wrong and is not verified — each finding shows its source. The action plan itself comes from the app's configured guidance.",
    emptyPrompt: "Run the AI analysis",
  },
}
