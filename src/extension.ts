import { spawn } from "child_process";
import * as vscode from "vscode";
import { Config, FormatterConfig } from "./types";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Custom Local Formatters", {
    log: true,
  });
  let disposables: readonly vscode.Disposable[] = [];

  const reregisterFormatters = () => {
    disposables.forEach((d) => d.dispose());
    disposables = registerFormatters(getFormatterConfigs(), outputChannel);
  };

  context.subscriptions.push(
    outputChannel,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("customLocalFormatters")) reregisterFormatters();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(reregisterFormatters),
    { dispose: () => disposables.forEach((d) => d.dispose()) },
  );

  reregisterFormatters();
}

const getFormatterConfigs = () => {
  const config = vscode.workspace.getConfiguration("customLocalFormatters");
  return config.get<Config["formatters"]>("formatters", []);
};

// Patterns are relative to each workspace folder. When both languages and patterns are set,
// a document must match a language and a pattern.
const buildSelector = (formatter: FormatterConfig): vscode.DocumentSelector | undefined => {
  const languages = formatter.languages ?? [];
  const patterns = (formatter.patterns ?? []).flatMap((pattern) =>
    (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => new vscode.RelativePattern(folder, pattern),
    ),
  );
  // With no workspace folder open, patterns match nothing rather than being ignored.
  if (formatter.patterns?.length && patterns.length === 0) return [];

  if (languages.length > 0 && patterns.length > 0)
    return languages.flatMap((language) => patterns.map((pattern) => ({ language, pattern })));
  if (languages.length > 0) return languages;
  if (patterns.length > 0) return patterns.map((pattern) => ({ pattern }));
  return undefined;
};

const registerFormatters = (
  formatters: readonly FormatterConfig[],
  outputChannel: vscode.LogOutputChannel,
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
        "Not registering custom formatter " +
          JSON.stringify({ languages: formatter.languages, patterns: formatter.patterns }) +
          ", because no command is specified for this platform",
      );
      return [];
    }

    return [
      vscode.languages.registerDocumentFormattingEditProvider(selector, {
        provideDocumentFormattingEdits(document, options, token) {
          return formatDocument(
            document,
            options,
            undefined,
            commandTemplate,
            outputChannel,
            token,
          );
        },
      }),
      vscode.languages.registerDocumentRangeFormattingEditProvider(selector, {
        provideDocumentRangeFormattingEdits(document, range, options, token) {
          return formatDocument(document, options, range, commandTemplate, outputChannel, token);
        },
      }),
    ];
  });
};

const formatDocument = (
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  range: vscode.Range | undefined,
  commandTemplate: string,
  outputChannel: vscode.LogOutputChannel,
  token: vscode.CancellationToken,
): Promise<vscode.TextEdit[]> => {
  const command = commandTemplate
    .replace(/\${file}/g, document.fileName)
    .replace(/\${insertSpaces}/g, "" + options.insertSpaces)
    .replace(/\${tabSize}/g, "" + options.tabSize);

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const backupFolder = vscode.workspace.workspaceFolders?.[0];
  const cwd = workspaceFolder?.uri?.fsPath || backupFolder?.uri.fsPath;

  return new Promise<vscode.TextEdit[]>((resolve, reject) => {
    outputChannel.info(`Started ${range != null ? "range " : ""}formatter: ${command}`);

    const textToFormat = document.getText(range);
    const targetRange =
      range ??
      new vscode.Range(
        document.lineAt(0).range.start,
        document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
      );

    const process = spawn(command, { cwd, shell: true });
    const cancellation = token.onCancellationRequested(() => process.kill());
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
      cancellation.dispose();
      if (token.isCancellationRequested) {
        outputChannel.info(`Cancelled formatter: ${command}`);
        resolve([]);
        return;
      }

      if (code !== 0) {
        const reason = signal
          ? `terminated by signal ${signal} (likely due to a timeout or external termination)`
          : `exited with code ${code}`;
        const message = `Formatter failed: ${command}\nReason: ${reason}`;
        outputChannel.error(message);
        if (stderr !== "") outputChannel.error(`Stderr:\n${stderr}`);
        if (stdout !== "") outputChannel.error(`Stdout:\n${stdout}`);
        vscode.window.showErrorMessage(message, "Show output").then((selection) => {
          if (selection === "Show output") outputChannel.show();
        });
        reject(new Error(message));
        return;
      }

      if (textToFormat.length > 0 && stdout.length === 0) {
        outputChannel.warn(`Formatter returned nothing - not applying changes.`);
        resolve([]);
        return;
      }

      outputChannel.info(`Finished running formatter: ${command}`);
      if (stderr.length > 0) outputChannel.warn(`Possible issues occurred:\n${stderr}`);

      resolve(minimalEdits(document, targetRange, textToFormat, stdout));
      return;
    });

    process.stdin.write(textToFormat);
    process.stdin.end();
  });
};

// Replaces only the changed lines instead of the whole range. VS Code does not shrink edits of
// more than 100,000 characters itself and applying such an edit makes the cursor jump.
export const minimalEdits = (
  document: vscode.TextDocument,
  targetRange: vscode.Range,
  before: string,
  after: string,
): vscode.TextEdit[] => {
  if (before === after) {
    return [];
  }

  const limit = Math.min(before.length, after.length);

  let head = 0;
  while (head < limit && before.charCodeAt(head) === after.charCodeAt(head)) {
    head++;
  }
  // Snap to a line start, so the edit never splits a surrogate pair.
  head = head === 0 ? 0 : before.lastIndexOf("\n", head - 1) + 1;

  let tail = 0;
  while (
    tail < limit - head &&
    before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
  ) {
    tail++;
  }

  // Same for the unchanged tail: let it begin at a line start.
  const lineBreak = before.indexOf("\n", before.length - tail - 1);
  tail = lineBreak === -1 ? 0 : before.length - lineBreak - 1;

  const base = document.offsetAt(targetRange.start);
  const changed = new vscode.Range(
    document.positionAt(base + head),
    document.positionAt(base + before.length - tail),
  );

  return [vscode.TextEdit.replace(changed, after.slice(head, after.length - tail))];
};

// this method is called when your extension is deactivated
export function deactivate() {}
