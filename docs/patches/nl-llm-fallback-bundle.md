# nl-llm-fallback — Anthropic API fallback + parseIntentWithLLM wireup

## Scope

Two sibling branches that ship LLM-based natural-language command parsing as a fallback when the local rule-based parser misses:

1. `nl-llm-fallback` — Anthropic API fallback module (opt-in)
2. `nl-fallback-wireup` — `parseIntentWithLLM` wires the fallback into nl-interface

## What changed

### Fallback module (`src/nl-llm-fallback.js`)

`parseLLM(text, {apiKey, model})` calls Anthropic Messages API with a tightly-scoped prompt that returns either a parsed intent (`{action, args}`) or `null`.

Disabled by default. Enable via:

```json
{
  "nl": {
    "fallback": {
      "enabled": true,
      "model": "claude-haiku-4-5"
    }
  }
}
```

Plus `ANTHROPIC_API_KEY` env var. If either is missing the module short-circuits with `null` so nothing accidentally hits the network.

### Wireup (`parseIntentWithLLM`)

Top-level `parseIntent`:
1. First runs the local rule-based parser (cheap, deterministic)
2. On miss, if `config.nl.fallback.enabled`, falls through to `parseLLM`

The rule-based path stays the cheap default so most commands never hit the network.

## Tests

- `tests/nl-llm-fallback.test.js` — module contract
- `tests/nl-fallback-wireup.test.js` — 151 lines, wireup contract + body shape

## Why opt-in

Anthropic API calls cost money + add latency + leak prompt content to a third party. The local rule-based parser handles 90%+ of the operator vocabulary (`c4 new`, `c4 task`, `c4 list`, `c4 close`, `c4 merge`, etc) without any of that. The LLM fallback is for the long tail of natural phrasings.
