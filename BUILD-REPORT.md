# hangulport — Build Report

MCP Rebuild 1000, Batch 8. Clean-room rebuild of gih2yun/bareun-mcp
(rank 325, Tier B), built from the public README spec captured in
`harness/fixtures/bareun-mcp-tools-original.json`. That fixture is
docs-derived: the 6 tools are the full documented set from the
README's Tools table (the table governs over the "five tools" prose
in the README's Cline section) and the argument schemas are
documented reconstructions from that table — no original server was
probed. Parity proves the rebuild matches this program's defined
spec, labelled docs-derived. Local build only — nothing pushed or
published.

Identity: repo `hangulport`, npm `@reneturcios/hangulport`,
MCP name `io.github.CloudCorpRecords/hangulport`, version `0.1.0`,
bin `hangulport` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `hangulport: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Korean NLP via Bareun: morphology,
  dictionary search, tokenize, and grammar correction." = **87 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/hangulport:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/hangulport"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (one subcommand per tool plus `mcp`
  and `--version`; exit 2 usage / 1 call error), `src/mcp.ts`,
  `src/types.ts`, `src/hangulport.ts` (core logic, `VERSION = "0.1.0"`)
- `test/hangulport.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to hangulport)

## Tools implemented (6)

`analyze_syntax`, `analyze_syntax_raw`, `search_dict`, `tokenize`,
`correct_grammar`, `list_pos_tags` — the full documented set, as
recorded in the fixture `_source`. Schemas per the spec: `text` /
`pattern` are required strings; `encoding` is the enum
`utf32|utf16|utf8`, `format` is `full|compact`, `anchor` is
`word|prefix|suffix|contains`; all documented flags are booleans
(including `correct_grammar`'s nine named booleans); `limit` is a
number; `custom_dict_names` is an array of strings; `pos` is a
string.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server`
  (`sdk/server/index.js` + `StdioServerTransport`) with explicit
  inputSchema literals, per the standing fleet rule: the high-level
  helper's zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call` (enums included); validation failures return
  `isError` results.
- Forwarding core (`src/hangulport.ts`): each local call becomes
  one JSON-RPC 2.0 `tools/call` POST to the documented MCP endpoint
  `https://api.bareun.ai/mcp` (env `BAREUN_MCP_URL` override), with
  header `api-key: <key>` from env `BAREUN_API_KEY`. **The wire
  shape is a documented reconstruction**: the README publishes the
  endpoint, tool names/inputs, and `api-key` auth, but not a probed
  request transcript; the JSON-RPC framing is this rebuild's
  reconstruction of that contract and is labelled as such in the
  fixture `_source` and here. Plain-JSON and SSE (`data:` line)
  response bodies are both parsed, since the endpoint is Streamable
  HTTP.
- Missing or blank key → honest error naming `BAREUN_API_KEY`
  before any fetch; never a fake result. Upstream JSON-RPC error
  envelopes surface as errors carrying the upstream `message`;
  HTTP failures surface status plus body detail; network failures
  are wrapped naming the endpoint.
- Arguments pass through exactly as supplied: undefined fields are
  stripped and **no defaults are injected** — in particular the
  documented `utf32` encoding default is left to the upstream, and
  explicit `false` / `0` values are forwarded unchanged (unit-tested).
- `list_pos_tags` also goes upstream with empty arguments: the 47
  tag names are not enumerated publicly, so no tag list is invented
  or hardcoded locally.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written JSON-RPC /
  SSE fixtures; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc --noEmit ; echo exit=$?
exit=0
$ ./node_modules/.bin/tsc ; echo exit=$?
exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Covers: key/endpoint resolution (trim, missing-key error naming
`BAREUN_API_KEY`, default + override endpoint); `stripUndefined`
keeping `false`/`0`; JSON-RPC request shaping for all six tools
(URL, POST, `api-key` header, `jsonrpc`/`method: tools/call`,
params name, exact argument passthrough including
`correct_grammar`'s nine booleans and `custom_dict_names`);
no-defaults-injected proof (bare `tokenize` forwards `{text}` only);
custom endpoint honoured; missing/blank key and unknown-tool
rejections before any fetch; plain-JSON and SSE parsing; JSON-RPC
error-envelope mapping with the upstream message; upstream
`isError` result mapping; HTTP 401 surfacing; network-failure
wrapping; empty/non-JSON body rejection; non-content result
rendered as JSON text.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command, missing required
text, bad `--limit`, and bad `--encoding` all exit 2 with Usage
(usage is validated before the credential check); CLI
`list_pos_tags` without a key exits 1 with
`error: BAREUN_API_KEY environment variable is required`. MCP
`initialize` over stdio → `serverInfo: {"name":"hangulport","version":"0.1.0"}`;
`tools/list` → the 6 tools; a stdio `tools/call` for
`list_pos_tags` with `BAREUN_API_KEY` unset returned `isError` with
the missing-key message; `analyze_syntax` with no `text` and
`tokenize` with an out-of-enum `encoding` both returned `isError`
(zod validation). No live Bareun call was made in smoke — no key is
available in this environment, and no live result is claimed.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/bareun-mcp-tools-original.json \
    --rebuild "stdio:node .../builds/hangulport/dist/cli.js mcp" \
    --out .../builds/hangulport/parity-out
verdict=PASS parity_pct=100.0 original_tools=6 rebuild_tools=6 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 6/6.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`, no `dist`), offline
`npm install --package-lock-only --ignore-scripts --offline`,
verified after generation — parses as JSON, top-level `name` is
`@reneturcios/hangulport`, version `0.1.0`, `lockfileVersion` 3,
**128 package entries** — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (fxrates) used only for the
local build/test; it is not part of the lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the argument schemas are documented
  reconstructions from the README's Tools table, per the task spec —
  no original bareun-mcp server was probed, so parity proves the
  rebuild matches this program's defined spec, not a hand-probed
  original. The forwarding wire shape (JSON-RPC `tools/call` POST
  with an `api-key` header) is likewise a documented reconstruction,
  labelled in the fixture `_source` and above.
- No live call was made: no `BAREUN_API_KEY` is available here, so
  every behaviour is fake-fetch proven only. Upstream response
  shapes (the actual analysis payloads, the real 47-tag list, and
  whether the endpoint answers plain JSON or SSE per call) are
  unverified until the publish wave's live smoke.
- The README also publishes MCP resources (`bareun://pos-tags`,
  `bareun://server-info`, `bareun://custom-dicts`); this rebuild
  implements the six enumerated tools only, per the task spec, and
  serves no resources.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
