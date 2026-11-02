/**
 * hangulport core: forward the 6 Bareun tools to the hosted Bareun
 * MCP endpoint at https://api.bareun.ai/mcp (override with
 * BAREUN_MCP_URL).
 *
 * Wire shape (documented reconstruction): the public README
 * publishes the endpoint, the six tool names with their key inputs,
 * and API-key auth via an `api-key` header; the exact forwarding
 * framing below — one JSON-RPC 2.0 `tools/call` POST per local call,
 * carrying the tool name and the caller's arguments unchanged — is
 * this rebuild's documented reconstruction of that contract, not a
 * probed wire capture. The hosted endpoint speaks Streamable HTTP
 * and may answer with plain JSON or a text/event-stream (SSE) body
 * whose `data:` lines carry JSON-RPC payloads; both are parsed.
 *
 * The API key comes from BAREUN_API_KEY and is sent only as the
 * `api-key` header. A missing key is an honest error naming
 * BAREUN_API_KEY — no result is ever fabricated. Arguments are
 * forwarded exactly as supplied: no defaults (including the
 * documented utf32 encoding default) are injected by this client.
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline.
 */
import type {
  AnalyzeSyntaxOptions,
  AnalyzeSyntaxRawOptions,
  CorrectGrammarOptions,
  FetchFn,
  SearchDictOptions,
  TokenizeOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT = "https://api.bareun.ai/mcp";

export const ENDPOINT_ENV = "BAREUN_MCP_URL";

export const API_KEY_ENV = "BAREUN_API_KEY";

export const TOOL_NAMES = [
  "analyze_syntax",
  "analyze_syntax_raw",
  "search_dict",
  "tokenize",
  "correct_grammar",
  "list_pos_tags",
];

/** Resolve the API key: trimmed env value, or an error naming BAREUN_API_KEY. */
export function apiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env[API_KEY_ENV];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) {
    throw new Error(
      "BAREUN_API_KEY environment variable is required",
    );
  }
  return key;
}

/** Resolve the MCP endpoint: env value when non-blank, else the documented default. */
export function endpointFromEnv(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env[ENDPOINT_ENV];
  const url = typeof raw === "string" ? raw.trim() : "";
  return url || DEFAULT_ENDPOINT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drop undefined values so only caller-supplied arguments are forwarded. */
export function stripUndefined(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Collect JSON payloads from a plain-JSON body or SSE `data:` lines. */
export function extractJsonPayloads(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const dataLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0 && line !== "[DONE]");
  const candidates = dataLines.length > 0 ? dataLines : [trimmed];
  const payloads: unknown[] = [];
  for (const candidate of candidates) {
    try {
      payloads.push(JSON.parse(candidate));
    } catch {
      // Non-JSON stream noise is ignored.
    }
  }
  return payloads;
}

/** Extract the readable text from one JSON-RPC payload, or throw its error. */
export function resultTextFromPayload(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new Error("Bareun upstream returned an unexpected response shape");
  }
  if (payload.error !== undefined && payload.error !== null) {
    const err = payload.error;
    const message =
      isRecord(err) && typeof err.message === "string"
        ? err.message
        : JSON.stringify(err);
    throw new Error(`Bareun upstream error: ${message}`);
  }
  const result = payload.result;
  if (typeof result === "string") return result;
  if (isRecord(result)) {
    if (Array.isArray(result.content)) {
      const texts = result.content
        .filter((part): part is Record<string, unknown> => isRecord(part))
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string);
      if (texts.length > 0) return texts.join("\n");
      if (result.content.length === 0) {
        throw new Error("Bareun upstream returned an empty content list");
      }
    }
    if (result.isError === true) {
      throw new Error("Bareun upstream returned an error result with no text");
    }
    return JSON.stringify(result, null, 2);
  }
  throw new Error("Bareun upstream returned a response with no readable result");
}

/** Parse an upstream response body (plain JSON or SSE) into result text. */
export function parseToolResponse(body: string): string {
  const payloads = extractJsonPayloads(body);
  if (payloads.length === 0) {
    throw new Error("Bareun upstream returned an empty or non-JSON response");
  }
  for (let i = payloads.length - 1; i >= 0; i--) {
    const payload = payloads[i];
    if (isRecord(payload) && (payload.result !== undefined || payload.error !== undefined)) {
      return resultTextFromPayload(payload);
    }
  }
  return resultTextFromPayload(payloads[payloads.length - 1]);
}

let nextRequestId = 1;

/** Forward one tool call upstream as a JSON-RPC tools/call POST. */
export async function callBareunTool(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error("BAREUN_API_KEY environment variable is required");
  }
  const url = endpointFromEnv({ [ENDPOINT_ENV]: endpoint });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "api-key": key,
  };
  const requestBody = JSON.stringify({
    jsonrpc: "2.0",
    id: nextRequestId++,
    method: "tools/call",
    params: { name: toolName, arguments: stripUndefined(args) },
  });
  let response;
  try {
    response = await fetchFn(url, { method: "POST", headers, body: requestBody });
  } catch (err) {
    throw new Error(
      `Failed to reach Bareun upstream at ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const body = await response.text();
  if (!response.ok) {
    const detail = body.trim().slice(0, 200);
    throw new Error(
      `Bareun upstream request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
  return parseToolResponse(body);
}

/** Dispatch by tool name, rejecting unknown tools before any fetch. */
export async function callTool(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!TOOL_NAMES.includes(name)) throw new Error(`Unknown tool: ${name}`);
  return callBareunTool(fetchFn, apiKey, endpoint, name, args);
}

/** Morphological analysis / POS tagging of Korean text. */
export async function analyzeSyntax(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  options: AnalyzeSyntaxOptions,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "analyze_syntax", { ...options });
}

/** Raw morphological model output with no post-processing. */
export async function analyzeSyntaxRaw(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  options: AnalyzeSyntaxRawOptions,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "analyze_syntax_raw", { ...options });
}

/** Search the Urimalsaem dictionary by jamo slot pattern. */
export async function searchDict(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  options: SearchDictOptions,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "search_dict", { ...options });
}

/** Split a sentence into word units. */
export async function tokenize(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  options: TokenizeOptions,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "tokenize", { ...options });
}

/** Spelling/spacing correction; returns correction blocks. */
export async function correctGrammar(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
  options: CorrectGrammarOptions,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "correct_grammar", { ...options });
}

/** List the 47 Bareun POS tags (fetched upstream; tags are not enumerated locally). */
export async function listPosTags(
  fetchFn: FetchFn,
  apiKey: string,
  endpoint: string,
): Promise<string> {
  return callBareunTool(fetchFn, apiKey, endpoint, "list_pos_tags", {});
}

/** Render a payload as the text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
