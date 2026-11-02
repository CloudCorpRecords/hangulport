# hangulport

hangulport is a client for the hosted Bareun Korean NLP service. It
exposes morphological analysis with part-of-speech tagging, the raw
morphological model output, Urimalsaem dictionary search by jamo
slot pattern, sentence tokenization, spelling and spacing
correction, and the service's part-of-speech tag list. One binary
serves a command-line interface and a stdio MCP server; both forward
every call to the hosted endpoint.

An API key is required. Set `BAREUN_API_KEY` to your Bareun key; it
is sent to the endpoint as the `api-key` header and nowhere else.
Calls go to `https://api.bareun.ai/mcp` unless `BAREUN_MCP_URL`
overrides the endpoint. When the key is missing, calls fail with an
error naming `BAREUN_API_KEY` — no result is invented locally. The
47 POS tags behind `list_pos_tags` are served by the upstream; they
are not hardcoded here.

## Install

```bash
npx @reneturcios/hangulport tokenize "안녕하세요"
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/hangulport
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead. Both forms need
`BAREUN_API_KEY` in the environment (for Docker, add
`-e BAREUN_API_KEY=...`).

## CLI

```bash
hangulport analyze_syntax "안녕하세요" --auto-spacing --encoding utf8 --format compact
hangulport analyze_syntax_raw "안녕하세요" --with-sense
hangulport search_dict "ㄱㅏ*" --anchor prefix --limit 5 --with-definition
hangulport tokenize "문장을 나눕니다" --auto-spacing
hangulport correct_grammar "띄어쓰기연습" --enable-sentence-check
hangulport list_pos_tags

hangulport --version
```

Each subcommand is named after the MCP tool it calls. The first
argument is the required text (or dictionary pattern); the remaining
flags map one-to-one onto the tool's optional inputs. Boolean flags
take no value: passing the flag sets it true, and omitting it
forwards nothing — this client injects no defaults of its own.
`--custom-dict-names` takes a comma-separated list. Commands print
the upstream result text. Exit codes: `0` on success, `1` when a
call fails (including a missing key or an upstream error), `2` for
usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/hangulport mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "hangulport": {
      "command": "npx",
      "args": ["-y", "@reneturcios/hangulport", "mcp"],
      "env": { "BAREUN_API_KEY": "your-key" }
    }
  }
}
```

To point the server at a different Bareun-compatible host, add
`BAREUN_MCP_URL` to the client's `env` for this server.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `analyze_syntax` | `text` (required); optional `auto_split_sentence`, `auto_spacing`, `auto_jointing`, `custom_dict_names`, `encoding` (`utf32`/`utf16`/`utf8`), `format` (`full`/`compact`), `with_sense` | Morphological analysis with POS tagging. |
| `analyze_syntax_raw` | `text` (required); optional `auto_split_sentence`, `encoding`, `format`, `with_sense` | Raw morphological model output, no post-processing. |
| `search_dict` | `pattern` (required); optional `anchor` (`word`/`prefix`/`suffix`/`contains`), `pos`, `std_only`, `with_definition`, `limit`, `count_only` | Urimalsaem dictionary matches for a jamo slot pattern. |
| `tokenize` | `text` (required); optional `auto_spacing`, `encoding` | The sentence split into word units. |
| `correct_grammar` | `text` (required); optional `custom_dict_names` and nine boolean correction options (`treat_as_title`, `disable_split_sentence`, `disable_caret_spacing`, `disable_vx_spacing`, `enable_limited_punctuation`, `disable_confusion`, `enable_cleanup_whitespace`, `disable_typo_correction`, `enable_sentence_check`) | Spelling/spacing correction blocks. |
| `list_pos_tags` | (none) | The 47 Bareun POS tags, as served upstream. |

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
