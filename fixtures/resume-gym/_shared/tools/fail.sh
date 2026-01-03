#!/usr/bin/env bash
# Always exits 1 (failure)
echo "FAIL: ${1:-verification failed}" >&2
exit 1
