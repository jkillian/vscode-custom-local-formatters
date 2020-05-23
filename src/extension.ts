import { exec } from 'child_process';

import * as vscode from 'vscode';

import { Config, FormatterConfig } from './types';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Custom Local Formatters');
  let disposables: readonly vscode.Disposable[] = [];

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration('customLocalFormatters')) return;
    disposables.forEach((d) => d.dispose());
    disposables = registerFormatters(getFormatterConfigs(), outputChannel);
  });

  disposables = registerFormatters(getFormatterConfigs(), outputChannel);
}

const getFormatterConfigs = () => {
  const config = vscode.workspace.getConfiguration('customLocalFormatters');
  return config.get<Config['formatters']>('formatters', []);
};

const registerFormatters = (
  formatters: readonly FormatterConfig[],
  outputChannel: vscode.OutputChannel,
): readonly vscode.Disposable[] => {
  return formatters
    .map((formatter) => {
      if (formatter.disabled) return;

      return vscode.languages.registerDocumentFormattingEditProvider(formatter.languages, {
        provideDocumentFormattingEdits(document, options) {
          const command = formatter.command
            .replace(/\${file}/g, document.fileName)
            .replace(/\${insertSpaces}/g, '' + options.insertSpaces)
            .replace(/\${tabSize}/g, '' + options.tabSize.toString);

          const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
          const backupFolder = vscode.workspace.workspaceFolders?.[0];
          const cwd = workspaceFolder?.uri?.fsPath || backupFolder?.uri.fsPath;

          return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            outputChannel.appendLine(`Starting custom local formatter: ${command}`);
            const originalDocumentText = document.getText();

            const process = exec(command, { cwd }, (error, stdout, stderr) => {
              if (error) {
                vscode.window.showWarningMessage(`Custom local formatter failed. Check output for more details.`);
                outputChannel.appendLine(`Formatter failed: ${command}\nStderr:\n${stderr}`);
                reject(error);
              }

              if (originalDocumentText.length > 0 && stdout.length === 0) {
                vscode.window.showWarningMessage(`Custom local formatter returned nothing - not applying changes.`);
                reject('No changes returned');
              }

              const documentRange = new vscode.Range(
                document.lineAt(0).range.start,
                document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
              );
              resolve([new vscode.TextEdit(documentRange, stdout)]);
            });

            process.stdin?.write(originalDocumentText);
            process.stdin?.end();
          });
        },
      });
    })
    .filter((v) => v != null) as vscode.Disposable[];
};

// this method is called when your extension is deactivated
export function deactivate() {}
