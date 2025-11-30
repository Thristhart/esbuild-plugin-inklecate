import type { PartialMessage, Plugin } from "esbuild";
import { getInklecateBinaryPath } from "inklecate-bin";
import child_process from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

// error looks like e.g.:
// "ERROR: 'brokenreference.ink' line 3: Divert target not found: '-> invalid'"
// warning looks like e.g.:
// "WARNING: 'warning.ink' line 6: Blank choice - if you intended a default fallback choice, use the `* ->` syntax"
const errorRegex = /ERROR: '(.*)' line (\d+): (.*)/;
const warningRegex = /WARNING: '(.*)' line (\d+): (.*)/;
async function createESBuildMessageForIssue(
  issue: string,
  context: CompileContext
): Promise<{ error: PartialMessage } | { warning: PartialMessage }> {
  const errorMatch = issue.match(errorRegex);
  if (errorMatch) {
    const file = errorMatch[1];
    const line = parseInt(errorMatch[2], 10);
    const errorText = errorMatch[3];
    return { error: await readFileForMessage(file, line, errorText, context) };
  }

  const warningMatch = issue.match(warningRegex);
  if (warningMatch) {
    const file = warningMatch[1];
    const line = parseInt(warningMatch[2], 10);
    const errorText = warningMatch[3];
    return {
      warning: await readFileForMessage(file, line, errorText, context),
    };
  }
  return { error: { text: issue } };
}

async function readFileForMessage(
  file: string,
  line: number,
  text: string,
  context: CompileContext
): Promise<PartialMessage> {
  const resolvedPath = path.resolve(context.inkContainingDir, file);
  const fileText =
    context.fileCacheForBuild.get(resolvedPath) ??
    (await fs.readFile(resolvedPath, {
      encoding: "utf8",
    }));
  context.fileCacheForBuild.set(resolvedPath, fileText);
  return {
    text,
    location: {
      file: resolvedPath,
      line,
      lineText: fileText.split("\n")[line - 1],
    },
  };
}

interface CompileContext {
  fileCacheForBuild: Map<string, string>;
  inkContainingDir: string;
}

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
export default function InklecatePlugin(
  options?: InklecatePluginOptions
): Plugin {
  return {
    name: "InklecatePlugin",
    setup(build) {
      build.onLoad({ filter: options?.filter ?? /\.ink$/ }, async (args) => {
        const inklecateArgs: string[] = ["-j"];
        if (options?.count) {
          inklecateArgs.push("-c");
        }
        if (options?.stats) {
          inklecateArgs.push("-s");
        }
        if (options?.inklecatePluginsDir) {
          inklecateArgs.push("-x", options.inklecatePluginsDir);
        }

        let outputDir = path.resolve(options?.tempOutputDir ?? ".");
        await fs.mkdir(outputDir, { recursive: true });
        const outputPath = path.resolve(
          outputDir,
          `${crypto.randomUUID()}.json`
        );
        inklecateArgs.push("-o", outputPath);

        inklecateArgs.push(args.path);

        const compileContext = {
          fileCacheForBuild: new Map<string, string>(),
          inkContainingDir: path.dirname(args.path),
        };

        let success = false;
        let exported = false;
        const issues: string[] = [];
        let stats: object | undefined = undefined;
        const inklecateProcess = child_process.spawn(
          getInklecateBinaryPath(),
          inklecateArgs
        );
        inklecateProcess.stdout.on("readable", () => {
          const stdout = inklecateProcess.stdout.read() ?? "";
          const line = stdout.toString().trim();
          if (line) {
            const compilerOutput = JSON.parse(line);
            if ("compile-success" in compilerOutput) {
              success = compilerOutput["compile-success"];
            }
            if ("issues" in compilerOutput) {
              issues.push(...compilerOutput["issues"]);
            }
            if ("export-complete" in compilerOutput) {
              exported = compilerOutput["export-complete"];
            }
            if ("stats" in compilerOutput) {
              stats = compilerOutput["stats"];
            }
          }
        });

        try {
          await new Promise((resolve, reject) => {
            inklecateProcess.on("error", reject);
            inklecateProcess.on("exit", resolve);
          });

          let warnings: PartialMessage[] = [];
          let errors: PartialMessage[] = [];

          for (const issue of issues) {
            const message = await createESBuildMessageForIssue(
              issue,
              compileContext
            );
            if ("error" in message) {
              errors.push(message.error);
            }
            if ("warning" in message) {
              warnings.push(message.warning);
            }
          }
          if (stats && options?.stats) {
            return {
              errors,
              warnings,
              contents: JSON.stringify(stats),
              loader: "json",
            };
          }
          if (!success) {
            return { errors, warnings };
          }
          let contents;
          if (exported) {
            contents = await fs.readFile(outputPath);
          }

          return {
            contents,
            warnings,
            errors,
            loader: "json",
          };
        } finally {
          await fs.rm(outputPath, { force: true });
        }
      });
    },
  };
}
