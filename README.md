# esbuild-plugin-inklecate
A plugin for [esbuild](https://esbuild.github.io/) that compiles .ink files into JSON using [inklecate](https://github.com/inkle/ink).

Usage:
```ts
import esbuild from "esbuild";
import InklecatePlugin from "esbuild-plugin-inklecate";

await esbuild.build({
  plugins: [InklecatePlugin()],
});
```

The plugin constructor takes an optional options object:
```ts
interface InklecatePluginOptions {
  /** 
   * Regular expression that describes files this plugin will convert using inklecate. Defaults to /\.ink$/
   */
  filter?: RegExp;
  /**
   * Pass `-c` to inklecate, which inklecate describes as:
   * > Count all visits to knots, stitches and weave points, not
   * > just those referenced by TURNS_SINCE and read counts.
   */
  count?: boolean;
  /**
   * Pass `-s` to inklecate, which means instead of returning story contents as JSON, return stats about the story.
   * 
   * Those stats look like:
   * ```json
   * {"words":14728,"knots":32,"stitches":30,"functions":2,"choices":343,"gathers":95,"diverts":230}
   * ```
   */
  stats?: boolean;
  /**
   * Path to a directory containing plugins for inklecate.
   */
  inklecatePluginsDir?: string;
  /**
   * Inklecate writes files to disk, which this plugin reads and deletes. This is the directory where those temporary files are written -- defaults to cwd.
   */
  tempOutputDir?: string;
}
```

For example:
```ts
import esbuild from "esbuild";
import InklecatePlugin from "esbuild-plugin-inklecate";

await esbuild.build({
  plugins: [InklecatePlugin({
    count: true,
  })],
});
```