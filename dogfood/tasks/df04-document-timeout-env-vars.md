# Task: Document timeout environment variables

## Goal
Document the new millisecond timeout environment variables in the configuration docs.

## Requirements
1. Update `docs/configuration.md` to include a new "Environment Variables" section
2. Document:
   - `AGENT_STALL_TIMEOUT_MS` - direct millisecond override for stall detection
   - `AGENT_WORKER_CALL_TIMEOUT_MS` - direct millisecond override for worker calls
   - `STALL_TIMEOUT_MINUTES` - minutes-based stall timeout override
   - `WORKER_TIMEOUT_MINUTES` - minutes-based worker timeout override
3. Explain the priority order (MS > MINUTES > config default)
4. Include a "Fast Testing" example showing how to speed up tests

## Scope
- `docs/configuration.md` only

## Verification
- The new section is well-formatted markdown
- Examples are accurate and runnable
