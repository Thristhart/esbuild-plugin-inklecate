import * as esbuild from "esbuild";
import InklecatePlugin from "../dist/index.mjs";
import path from "node:path";
import test from "node:test";

async function buildForTest(filename, options = {}) {
  const buildResults = await esbuild.build({
    write: false,
    entryPoints: [
      path.resolve(import.meta.dirname, `./inksamples/${filename}`),
    ],
    plugins: [InklecatePlugin( options )],
  });

  return {
    errors: buildResults.errors,
    warnings: buildResults.warnings,
    files: buildResults.outputFiles.map((file) => file.text),
  };
}

test("empty ink file", async (t) => {
  t.assert.snapshot(await buildForTest("empty.ink"));
});
test("the intercept", async (t) => {
  t.assert.snapshot(await buildForTest("TheIntercept.ink"));
});
test("the intercept with counting", async (t) => {
  t.assert.snapshot(await buildForTest("TheIntercept.ink", { count: true }));
});
test("the intercept with stats", async (t) => {
  t.assert.snapshot(await buildForTest("TheIntercept.ink", { stats: true }));
});
test("ink file with a broken reference", async (t) => {
  await t.assert.rejects(async () => buildForTest("brokenreference.ink"));
});
test("imports a warning", async (t) => {
  t.assert.snapshot(await buildForTest("importsawarning.ink"));
});