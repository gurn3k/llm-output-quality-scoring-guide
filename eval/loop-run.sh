#!/bin/sh
# Repeats eval/full-run.mjs until its pairs are all done, a cap is reached, or an error stops it.
#   sh eval/loop-run.sh <model> <criteria> <set> <stage cap>
while :; do
  node eval/full-run.mjs "$@"; code=$?
  [ $code -eq 4 ] || exit $code
done
