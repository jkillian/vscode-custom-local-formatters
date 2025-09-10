import { spawn } from "child_process";
import * as vscode from "vscode";
import { Config, FormatterConfig } from "./types";

export function activate(context: vscode.ExtensionContext) {
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

      return [vscode.languages.registerDocumentFormattingEditProvider(formatter.languages, {
        provideDocumentFormattingEdits(document, options) {
          const command = commandTemplate
            .replace(/\${file}/g, document.fileName)
            .replace(/\${insertSpaces}/g, "" + options.insertSpaces)
            .replace(/\${tabSize}/g, "" + options.tabSize);

          const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
          const backupFolder = vscode.workspace.workspaceFolders?.[0];
          const cwd = workspaceFolder?.uri?.fsPath || backupFolder?.uri.fsPath;

          return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            outputChannel.appendLine(`Starting formatter: ${command}`);
            const originalDocumentText = document.getText();

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

              if (originalDocumentText.length > 0 && stdout.length === 0) {
                outputChannel.appendLine(`Formatter returned nothing - not applying changes.`);
                resolve([]);
                return;
              }

              const documentRange = new vscode.Range(
                document.lineAt(0).range.start,
                document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
              );

              outputChannel.appendLine(`Finished running formatter: ${command}`);
              if (stderr.length > 0)
                outputChannel.appendLine(`Possible issues occurred:\n${stderr}`);

              resolve([new vscode.TextEdit(documentRange, stdout)]);
              return;
            });

            process.stdin.write(originalDocumentText);
            process.stdin.end();
          });
        },
      })];
    })
    .filter((v) => v != null) as vscode.Disposable[];
};

// this method is called when your extension is deactivated
export function deactivate() {}
