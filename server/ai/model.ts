import { QuotaExceededError, QuotaLimiter, estimateTokens } from "./rateLimit";

export interface GenerateRequest {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface TextModel {
  readonly name: string;
  generate(request: GenerateRequest): Promise<string>;
}

export type AiErrorKind = "http" | "timeout" | "network" | "empty" | "blocked" | "parse" | "unavailable";

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: AiErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

// ---------- JSON helpers ----------

/** Pulls the first JSON object out of a model reply, tolerating code fences and surrounding prose. */
export function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new AiError("reply contains no JSON object", "parse");
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new AiError("reply is not valid JSON", "parse");
  }
}

// ---------- providers ----------

interface ProviderOptions {
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiError(timedOut ? `model call timed out after ${timeoutMs}ms` : "model call failed (network)", timedOut ? "timeout" : "network");
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new AiError(`model returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`, "http", response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new AiError("model returned a non-JSON body", "parse");
  }
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

/** Gemma 4 through the Gemini API (Google AI Studio key). The key travels in a header, never in the URL. */
export function createGeminiModel(options: ProviderOptions & { apiKey: string; baseUrl?: string }): TextModel {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  return {
    name: options.model,
    async generate(request) {
      const body = {
        // One user turn: Gemma models are not guaranteed to accept a separate system instruction.
        contents: [{ role: "user", parts: [{ text: `${request.system}\n\n${request.prompt}` }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.8,
          maxOutputTokens: request.maxOutputTokens ?? 4096,
        },
      };
      const raw = (await postJson(
        fetchImpl,
        `${baseUrl}/models/${encodeURIComponent(options.model)}:generateContent`,
        { "x-goog-api-key": options.apiKey },
        body,
        options.timeoutMs,
      )) as GeminiResponse;
      if (raw.promptFeedback?.blockReason) throw new AiError(`prompt blocked (${raw.promptFeedback.blockReason})`, "blocked");
      const parts = raw.candidates?.[0]?.content?.parts ?? [];
      // Thinking models can return their reasoning as separate parts flagged `thought`.
      const text = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
      if (!text) throw new AiError("model returned no text", "empty");
      return text;
    },
  };
}

interface OllamaResponse {
  message?: { content?: string };
}

/** Gemma 4 served by a local or self-hosted Ollama. */
export function createOllamaModel(options: ProviderOptions & { baseUrl: string }): TextModel {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return {
    name: options.model,
    async generate(request) {
      const body = {
        model: options.model,
        stream: false,
        format: "json",
        options: { temperature: request.temperature ?? 0.8, num_predict: request.maxOutputTokens ?? 4096 },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
      };
      const raw = (await postJson(fetchImpl, `${baseUrl}/api/chat`, {}, body, options.timeoutMs)) as OllamaResponse;
      const text = raw.message?.content?.trim();
      if (!text) throw new AiError("model returned no text", "empty");
      return text;
    },
  };
}

export interface ModelConfig {
  provider?: "gemini" | "ollama" | "off";
  geminiApiKey?: string;
  ollamaUrl?: string;
  model?: string;
  timeoutMs: number;
}

export const DEFAULT_GEMINI_MODEL = "gemma-4-26b-a4b-it";
export const DEFAULT_OLLAMA_MODEL = "gemma4";

/** Picks a provider from configuration. Returns null when no Gemma backend is configured. */
export function createTextModel(config: ModelConfig): TextModel | null {
  if (config.provider === "off") return null;
  const provider = config.provider ?? (config.geminiApiKey ? "gemini" : config.ollamaUrl ? "ollama" : undefined);
  if (provider === "gemini" && config.geminiApiKey) {
    return createGeminiModel({
      apiKey: config.geminiApiKey,
      model: config.model ?? DEFAULT_GEMINI_MODEL,
      timeoutMs: config.timeoutMs,
    });
  }
  if (provider === "ollama" && config.ollamaUrl) {
    return createOllamaModel({
      baseUrl: config.ollamaUrl,
      model: config.model ?? DEFAULT_OLLAMA_MODEL,
      timeoutMs: config.timeoutMs,
    });
  }
  return null;
}

// ---------- guard: pacing, concurrency and cool-down ----------

export interface GuardOptions {
  /** Minimum gap between the starts of two calls (keeps a shared free-tier key under its per-minute cap). */
  minIntervalMs?: number;
  maxConcurrent?: number;
  /** How long to refuse calls after a rate-limit response or a run of failures. */
  cooldownMs?: number;
  failureThreshold?: number;
  /** Shared requests/tokens/day budget. Calls with no room are refused instead of queued. */
  limiter?: QuotaLimiter;
  log?: (message: string) => void;
  now?: () => number;
}

/**
 * Wraps a model so one shared key survives many rooms: calls are paced and capped, and after a 429 or
 * repeated failures the model is skipped for a while so callers fall back quickly instead of waiting.
 */
export class GuardedModel implements TextModel {
  private active = 0;
  private waiters: (() => void)[] = [];
  private nextStart = 0;
  private failures = 0;
  private cooldownUntil = 0;
  private readonly minIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly cooldownMs: number;
  private readonly failureThreshold: number;
  private readonly limiter?: QuotaLimiter;
  private readonly log: (message: string) => void;
  private readonly now: () => number;

  constructor(
    private readonly inner: TextModel,
    options: GuardOptions = {},
  ) {
    this.minIntervalMs = options.minIntervalMs ?? 4_000;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.limiter = options.limiter;
    this.log = options.log ?? (() => {});
    this.now = options.now ?? Date.now;
  }

  get name(): string {
    return this.inner.name;
  }

  /** False while the model is cooling down after errors. */
  get available(): boolean {
    return this.now() >= this.cooldownUntil;
  }

  async generate(request: GenerateRequest): Promise<string> {
    if (!this.available) throw new AiError("model is cooling down after errors", "unavailable");
    await this.acquireSlot();
    try {
      if (!this.available) throw new AiError("model is cooling down after errors", "unavailable");
      const startAt = Math.max(this.now(), this.nextStart);
      this.nextStart = startAt + this.minIntervalMs;
      if (startAt > this.now()) await new Promise((resolve) => setTimeout(resolve, startAt - this.now()));
      try {
        this.limiter?.acquire(estimateTokens(request.system + request.prompt) + (request.maxOutputTokens ?? 4096));
      } catch (error) {
        if (error instanceof QuotaExceededError) throw new AiError(error.message, "unavailable");
        throw error;
      }
      const text = await this.inner.generate(request);
      this.failures = 0;
      return text;
    } catch (error) {
      if (error instanceof AiError && error.kind === "http" && error.status === 429) this.limiter?.backOff();
      this.recordFailure(error);
      throw error;
    } finally {
      this.releaseSlot();
    }
  }

  private recordFailure(error: unknown): void {
    if (!(error instanceof AiError) || error.kind === "unavailable" || error.kind === "parse") return;
    this.failures += 1;
    const rateLimited = error.kind === "http" && error.status === 429;
    if (rateLimited || this.failures >= this.failureThreshold) {
      this.cooldownUntil = this.now() + this.cooldownMs;
      this.failures = 0;
      this.log(`ai: pausing model calls for ${Math.round(this.cooldownMs / 1000)}s (${error.message})`);
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private releaseSlot(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }
}