// Run: node --test web/lib/data.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeTiles, median, quantile } from "./data.ts";

test("decodeTiles reads the format pipeline/build.py writes", () => {
  // Same example as pipeline/test_pipeline.py: 2 tiles x 3 months.
  const buf = new Uint16Array([1, 2, 1, 0, 2, 7, 5, 9]).buffer;
  assert.deepEqual([...decodeTiles(buf, 2, 3)], [0, 7, 0, 5, 0, 9]);
});

test("median and quantile", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(quantile([0, 10], 0.9), 9);
});
