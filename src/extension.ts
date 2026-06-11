import { spawn } from "child_process";
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

const registerFormatters = (
  formatters: readonly FormatterConfig[],
  outputChannel: vscode.OutputChannel,
): readonly vscode.Disposable[] => {
  return formatters
    .flatMap((formatter) => {
      if (formatter.disabled) return [];
      if (!formatter.languages) {
        vscode.window.showErrorMessage("Custom formatter does not have any languages defined");
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
        vscode.languages.registerDocumentFormattingEditProvider(formatter.languages, {
          provideDocumentFormattingEdits(document, options) {
            return formatDocument(document, options, undefined, commandTemplate, outputChannel);
          },
        }),
        vscode.languages.registerDocumentRangeFormattingEditProvider(formatter.languages, {
          provideDocumentRangeFormattingEdits(document, range, options) {
            return formatDocument(document, options, range, commandTemplate, outputChannel);
          },
        }),
      ];
    })
    .filter((v) => v != null) as vscode.Disposable[];
};

const formatDocument = (
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  range: vscode.Range | undefined,
  commandTemplate: string,
  outputChannel: vscode.OutputChannel,
): Promise<vscode.TextEdit[]> => {
  const filePath = document.uri.fsPath;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const backupFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceFolderPath = workspaceFolder?.uri?.fsPath ?? backupFolder?.uri.fsPath ?? "";
  const cwd = workspaceFolderPath || undefined;

  const command = commandTemplate
    // ${file} and ${buffer_path} both expand to the shell-escaped absolute file path
    .replace(/\${file}/g, shellEscapePath(filePath))
    .replace(/\${buffer_path}/g, shellEscapePath(filePath))
    // ${workspaceFolder} expands to the shell-escaped workspace root
    .replace(/\${workspaceFolder}/g, shellEscapePath(workspaceFolderPath))
    // Raw variants substitute verbatim; the user is responsible for quoting
    .replace(/\${fileRaw}/g, filePath)
    .replace(/\${bufferPathRaw}/g, filePath)
    .replace(/\${workspaceFolderRaw}/g, workspaceFolderPath)
    .replace(/\${insertSpaces}/g, "" + options.insertSpaces)
    .replace(/\${tabSize}/g, "" + options.tabSize);

  return new Promise<vscode.TextEdit[]>((resolve, reject) => {
    outputChannel.appendLine(`Started ${range != null ? "range " : ""}formatter: ${command}`);

    const textToFormat = document.getText(range);
    const targetRange =
      range ??
      new vscode.Range(
        document.lineAt(0).range.start,
        document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
      );

    const process = spawn(command, { cwd, shell: true });
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    process.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    process.on("close", (code, signal) => {
      if (code !== 0) {
        const reason = signal
          ? `terminated by signal ${signal} (likely due to a timeout or external termination)`
          : `exited with code ${code}`;
        const message = `Formatter failed: ${command}\nReason: ${reason}`;
        outputChannel.appendLine(message);
        if (stderr !== "") outputChannel.appendLine(`Stderr:\n${stderr}`);
        if (stdout !== "") outputChannel.appendLine(`Stdout:\n${stdout}`);
        vscode.window.showErrorMessage(message, "Show output").then((selection) => {
          if (selection === "Show output") outputChannel.show();
        });
        reject(new Error(message));
        return;
      }

      if (textToFormat.length > 0 && stdout.length === 0) {
        outputChannel.appendLine(`Formatter returned nothing - not applying changes.`);
        resolve([]);
        return;
      }

      outputChannel.appendLine(`Finished running formatter: ${command}`);
      if (stderr.length > 0) outputChannel.appendLine(`Possible issues occurred:\n${stderr}`);
      resolve([new vscode.TextEdit(targetRange, stdout)]);
      return;
    });

    process.stdin.write(textToFormat);
    process.stdin.end();
  });
};

export function deactivate() {}
