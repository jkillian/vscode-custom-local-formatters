import * as assert from "assert";
import * as vscode from "vscode";

const uppercaseCommand = `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s.toUpperCase()))"`;

suite("Custom Local Formatters", () => {
  const config = () => vscode.workspace.getConfiguration("customLocalFormatters");

  suiteSetup(async () => {
    await config().update(
      "formatters",
      [{ command: uppercaseCommand, languages: ["plaintext"] }],
      vscode.ConfigurationTarget.Global,
    );
    await vscode.extensions.getExtension("jkillian.custom-local-formatters")!.activate();
  });

  suiteTeardown(async () => {
    await config().update("formatters", undefined, vscode.ConfigurationTarget.Global);
  });

  test("formats a document with the configured command", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: "hello\nworld\n",
    });

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { insertSpaces: true, tabSize: 2 },
    );

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await vscode.workspace.applyEdit(workspaceEdit);

    assert.strictEqual(document.getText(), "HELLO\nWORLD\n");
  });
});
