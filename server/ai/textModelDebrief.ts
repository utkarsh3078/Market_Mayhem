import { SYSTEM_INSTRUCTION, factsToPrompt, type DebriefGenerator } from "./debrief";
import type { TextModel } from "./model";

/**
 * The round summary written by a Gemma model. It reuses the same instruction and compact fact sheet
 * as the Gemini version, so the number check and the token budget in `writeDebrief` apply unchanged.
 * Quota and cooldown come from the (guarded) model passed in.
 */
export function createTextModelDebrief(model: TextModel): DebriefGenerator {
  return async (facts) => {
    const reply = await model.generate({
      system: SYSTEM_INSTRUCTION,
      prompt: factsToPrompt(facts),
      maxOutputTokens: 200,
      temperature: 0.6,
    });
    const text = reply.replace(/^["'\s]+|["'\s]+$/g, "");
    if (!text) throw new Error("the model returned no text");
    return text;
  };
}