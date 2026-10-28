import { ApiError, GoogleGenAI } from "@google/genai";
import { thinkingFor } from "../ai/debrief";
import { estimateTokens, QuotaLimiter } from "../ai/rateLimit";
import type { ScriptGenerator, ScriptRequest } from "./scripts";

// Optional anchor scripts written by a hosted Gemini or Gemma model (NEWSROOM_SCRIPTS=gemini). One call
// per scenario covers every beat, and the result is cached for later rounds. The model only rewords
// each beat's headline and facts; scripts.ts rejects any line that adds a number, and the engine
// decides every price move regardless of the wording.

const SYSTEM_INSTRUCTION =
  "You write lines for the anchor of MMN, a fictional TV news channel inside a trading game. " +
  "For each story, write 2 or 3 short spoken sentences in plain English, under 45 words in total. " +
  "Use only the given headline and facts: add no new facts, names, numbers, causes or predictions, and give no advice. " +
  "No markdown, emojis or stage directions. " +
  'Reply with JSON only: an object mapping each story id to an array of sentences, e.g. {"id-1": ["...", "..."]}.';

const TIMEOUT_MS = 20_000;

export function storiesToPrompt(beats: ScriptRequest[]): string {
  return beats
    .map((b) => `${b.id} | ${b.category}${b.tone ? ` | ${b.tone}` : ""}\nHeadline: ${b.headline}\nFacts: ${b.facts}`)
    .join("\n\n");
}

export function createGeminiScriptGenerator(options: {
  apiKey: string;
  model: string;
  limiter?: QuotaLimiter;
  log?: (message: string) => void;
}): ScriptGenerator {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const limiter = options.limiter ?? new QuotaLimiter();

  return async (beats) => {
    const contents = storiesToPrompt(beats);
    const maxOutputTokens = Math.min(2000, 100 + beats.length * 90);
    // Throws (so every beat uses its template) when the shared quota has no room.
    const slot = limiter.acquire(estimateTokens(SYSTEM_INSTRUCTION + contents) + maxOutputTokens);
    let response;
    try {
      response = await ai.models.generateContent({
        model: options.model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens,
          responseMimeType: "application/json",
          thinkingConfig: thinkingFor(options.model),
          httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } },
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) limiter.backOff();
      throw error;
    }
    const usage = response.usageMetadata;
    if (usage) {
      slot.settle((usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0));
      options.log?.(`newsroom script tokens: ${usage.promptTokenCount ?? 0} in, ${usage.candidatesTokenCount ?? 0} out`);
    }
    const text = response.text?.trim();
    if (!text) throw new Error("the model returned no text");
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("the model did not return a JSON object");
    return parsed as Record<string, unknown>;
  };
}
