# Guard Fixture: .tmp/ Tool Pollution

## Incident Reference
Real-world guard violation from microcourses run 20260103050239.

## Root Cause
Verification command `npx ts-node pipeline/validate-course.ts` created `.tmp/` directory containing:
- `node-compile-cache/` (Node.js V8 compilation cache)
- `tsx-501/` (tsx runtime cache)

These are tool artifacts, not semantic changes.

## Expected Behavior (After Fix)
- `.tmp/` is gitignored
- Guard should NOT fail on `.tmp/` changes
- Journal should record ignored file count as "tool noise"

## What This Protects Against
False-positive guard violations from:
- Node.js compilation caches
- tsx/ts-node caches
- Any verification tool that emits gitignored artifacts

## Test Assertions
1. Guard does NOT fail when `.tmp/` is created and gitignored
2. Guard DOES fail when `.tmp/` is created and NOT gitignored
3. Journal includes ignored file metrics
