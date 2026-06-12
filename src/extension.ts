import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Config, FormatterConfig } from "./types";

/**
 * Escapes a file-system path for safe interpolation into a shell command string.
 * On Windows paths are wrapped in double quotes; on POSIX in single quotes.
 */
function shellEscapePath(value: string): string {
  if (process.platform === "win32") {
    // Escape any embedded double-quotes and wrap the whole thing.
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  // Escape embedded single-quotes (end quote, escaped quote, reopen quote) and wrap.
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function activate() {
  const outputChannel = vscode.window.createOutputChannel("Custom Local Formatters");
  let disposables: readonly vscode.Disposable[] = [];

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration("customLocalFormatters")) return;
    disposables.forEach((d) => d.dispose());
    disposables = registerFormatters(getFormatterConfigs(), outputChannel);
  });

  disposables = registerFormatters(getFormatterConfigs(), outputChannel);
}

const getFormatterConfigs = () => {
  const config = vscode.workspace.getConfiguration("customLocalFormatters");
  return config.get<Config["formatters"]>("formatters", []);
};

/**
 * Builds the document selector for a formatter from its languages and/or glob
 * patterns. When both are configured, a document must match a language and a
 * pattern. Returns undefined when neither is configured.
 */
const buildSelector = (formatter: FormatterConfig): vscode.DocumentSelector | undefined => {
  const languages = formatter.languages ?? [];
  const patterns =
    typeof formatter.pattern === "string" ? [formatter.pattern] : (formatter.pattern ?? []);

  if (languages.length > 0 && patterns.length > 0)
    return languages.flatMap((language) => patterns.map((pattern) => ({ language, pattern })));

  if (languages.length > 0) return [...languages];
  if (patterns.length > 0) return patterns.map((pattern) => ({ pattern }));
  return undefined;
};

const registerFormatters = (
  formatters: readonly FormatterConfig[],
  outputChannel: vscode.OutputChannel,
): readonly vscode.Disposable[] => {
  return formatters.flatMap((formatter) => {
    if (formatter.disabled) return [];
    const selector = buildSelector(formatter);
    if (!selector) {
      vscode.window.showErrorMessage(
        "Custom formatter does not have any languages or patterns defined",
      );
      return [];
    }

    let commandTemplate: string;
    if (typeof formatter.command === "string") {
      commandTemplate = formatter.command;
    } else {
      let platformCommand = formatter.command[process.platform];
      if (!platformCommand) platformCommand = formatter.command["*"];
      commandTemplate = platformCommand;
    }

    if (!commandTemplate) {
      vscode.window.showWarningMessage(
        "Not registering custom formatter for languages " +
          JSON.stringify(formatter.languages) +
          ", because no command is specified for this platform",
      );
      return [];
    }

    return [
      vscode.languages.registerDocumentFormattingEditProvider(selector, {
        provideDocumentFormattingEdits(document, options) {
          return formatDocument(
            document,
            options,
            undefined,
            commandTemplate,
            formatter,
            outputChannel,
          );
        },
      }),
      vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits(document, range, options) {
          return formatDocument(
            document,
            options,
            range,
            commandTemplate,
            formatter,
            outputChannel,
          );
        },
      }),
    ];
  });
};

/** Expands the workspace variables without shell escaping, for non-shell contexts. */
const expandRawWorkspaceVars = (value: string, workspaceFolderPath: string): string => {
  return value
    .replace(/\${workspaceFolder}/g, workspaceFolderPath)
    .replace(/\${workspaceFolderRaw}/g, workspaceFolderPath);
};

const formatDocument = async (
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  range: vscode.Range | undefined,
  commandTemplate: string,
  formatter: FormatterConfig,
  outputChannel: vscode.OutputChannel,
): Promise<vscode.TextEdit[]> => {
  const filePath = document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const backupFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceFolderPath = workspaceFolder?.uri?.fsPath ?? backupFolder?.uri.fsPath ?? "";

  // cwd and env are passed to spawn directly (no shell parsing), so variables
  // expand unescaped. A relative cwd resolves against the workspace root.
  const cwd = formatter.cwd
    ? path.resolve(
        workspaceFolderPath || ".",
        expandRawWorkspaceVars(formatter.cwd, workspaceFolderPath),
      )
    : workspaceFolderPath || undefined;
  const env = formatter.env
    ? {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(formatter.env).map(([name, value]) => [
            name,
            expandRawWorkspaceVars(value, workspaceFolderPath),
          ]),
        ),
      }
    : undefined;

  const useStdin = formatter.stdin !== false;
  const textToFormat = document.getText(range);
  const targetRange =
    range ??
    new vscode.Range(
      document.lineAt(0).range.start,
      document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
    );

  // With stdin disabled, the command works on a temporary copy of the buffer:
  // the file path variables point at the copy, and the result is read back
  // from it after the command exits.
  let tempDir: string | undefined;
  let substitutionPath = filePath;
  if (!useStdin) {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "custom-local-formatters-"));
    substitutionPath = path.join(tempDir, path.basename(filePath) || "untitled");
    await writeFile(substitutionPath, textToFormat, "utf8");
  }

  const command = commandTemplate
    // ${file} and ${buffer_path} both expand to the shell-escaped absolute file path
    .replace(/\${file}/g, shellEscapePath(substitutionPath))
    .replace(/\${buffer_path}/g, shellEscapePath(substitutionPath))
    // ${workspaceFolder} expands to the shell-escaped workspace root
    .replace(/\${workspaceFolder}/g, shellEscapePath(workspaceFolderPath))
    // Raw variants substitute verbatim; the user is responsible for quoting
    .replace(/\${fileRaw}/g, substitutionPath)
    .replace(/\${bufferPathRaw}/g, substitutionPath)
    .replace(/\${workspaceFolderRaw}/g, workspaceFolderPath)
    .replace(/\${insertSpaces}/g, "" + options.insertSpaces)
    .replace(/\${tabSize}/g, "" + options.tabSize);

  try {
    return await new Promise<vscode.TextEdit[]>((resolve, reject) => {
      outputChannel.appendLine(`Started ${range != null ? "range " : ""}formatter: ${command}`);

      const child = spawn(command, { cwd, env, shell: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      let timedOut = false;
      const timeoutSeconds = formatter.timeout ?? 0;
      const timer =
        timeoutSeconds > 0
          ? setTimeout(() => {
              timedOut = true;
              child.kill();
            }, timeoutSeconds * 1000)
          : undefined;

      const fail = (reason: string) => {
        const message = `Formatter failed: ${command}\nReason: ${reason}`;
        outputChannel.appendLine(message);
        if (stderr !== "") outputChannel.appendLine(`Stderr:\n${stderr}`);
        if (stdout !== "") outputChannel.appendLine(`Stdout:\n${stdout}`);
        vscode.window.showErrorMessage(message, "Show output").then((selection) => {
          if (selection === "Show output") outputChannel.show();
        });
        reject(new Error(message));
      };

      const finish = (result: string) => {
        if (textToFormat.length > 0 && result.length === 0) {
          outputChannel.appendLine(`Formatter returned nothing - not applying changes.`);
          resolve([]);
          return;
        }
        outputChannel.appendLine(`Finished running formatter: ${command}`);
        if (stderr.length > 0) outputChannel.appendLine(`Possible issues occurred:\n${stderr}`);
        resolve([new vscode.TextEdit(targetRange, result)]);
      };

      child.on("close", (code, signal) => {
        if (timer != null) clearTimeout(timer);

        if (timedOut || code !== 0) {
          fail(
            timedOut
              ? `timed out after ${timeoutSeconds} seconds`
              : signal
                ? `terminated by signal ${signal} (likely due to external termination)`
                : `exited with code ${code}`,
          );
          return;
        }

        if (useStdin) {
          finish(stdout);
          return;
        }
        readFile(substitutionPath, "utf8").then(finish, (error: unknown) => {
          fail(`could not read the formatted result: ${error}`);
        });
      });

      if (useStdin) child.stdin.write(textToFormat);
      child.stdin.end();
    });
  } finally {
    if (tempDir != null) await rm(tempDir, { recursive: true, force: true });
  }
};

export function deactivate() {}
