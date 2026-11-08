import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const caseCommand = (method: "toUpperCase" | "toLowerCase") =>
  `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(s.${method}()))"`;

suite("Custom Local Formatters", () => {
  const config = () => vscode.workspace.getConfiguration("customLocalFormatters");
  let tempDir: string;

  suiteSetup(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "custom-local-formatters-test-"));
    await config().update(
      "formatters",
      [
        { command: caseCommand("toUpperCase"), languages: ["plaintext"] },
        { command: caseCommand("toLowerCase"), patterns: ["**/*.patternonly.ini", "nested/*.ini"] },
        { command: caseCommand("toLowerCase"), languages: ["ini"], patterns: ["**/*.both.*"] },
      ],
      vscode.ConfigurationTarget.Global,
    );
    await vscode.extensions.getExtension("jkillian.custom-local-formatters")!.activate();
  });

  suiteTeardown(async () => {
    await config().update("formatters", undefined, vscode.ConfigurationTarget.Global);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const openWorkspaceFile = (relativePath: string) => {
    const folder = vscode.workspace.workspaceFolders![0].uri;
    return vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder, relativePath));
  };

  const format = async (document: vscode.TextDocument) => {
    const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
      "vscode.executeFormatDocumentProvider",
      document.uri,
      { insertSpaces: true, tabSize: 2 },
    );
    if (!edits || edits.length === 0) return false;

    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    await vscode.workspace.applyEdit(workspaceEdit);
    return true;
  };

  test("formats a document with the configured command", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "plaintext",
      content: "hello\nworld\n",
    });

    assert.ok(await format(document));
    assert.strictEqual(document.getText(), "HELLO\nWORLD\n");
  });

  test("formats a document matching a pattern", async () => {
    const document = await openWorkspaceFile("a.patternonly.ini");

    assert.ok(await format(document));
    assert.strictEqual(document.getText(), "hello\n");
  });

  test("matches patterns relative to the workspace folder", async () => {
    const document = await openWorkspaceFile("nested/e.ini");

    assert.ok(await format(document));
    assert.strictEqual(document.getText(), "hello\n");
  });

  test("skips files outside the workspace folder", async () => {
    const filePath = path.join(tempDir, "outside.patternonly.ini");
    fs.writeFileSync(filePath, "HELLO\n");
    const document = await vscode.workspace.openTextDocument(filePath);

    assert.strictEqual(await format(document), false);
  });

  test("formats a document matching both a language and a pattern", async () => {
    const document = await openWorkspaceFile("b.both.ini");
    assert.strictEqual(document.languageId, "ini");

    assert.ok(await format(document));
    assert.strictEqual(document.getText(), "hello\n");
  });

  test("skips documents that match only one of languages and patterns", async () => {
    const wrongLanguage = await openWorkspaceFile("c.both.log");
    assert.strictEqual(wrongLanguage.languageId, "log");
    const wrongPattern = await openWorkspaceFile("d.ini");
    assert.strictEqual(wrongPattern.languageId, "ini");

    assert.strictEqual(await format(wrongLanguage), false);
    assert.strictEqual(await format(wrongPattern), false);
  });
});
