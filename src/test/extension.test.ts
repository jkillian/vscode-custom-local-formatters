import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { minimalEdits } from "../extension";

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

suite("minimalEdits", () => {
  // Returns the replaced text and its replacement, after checking that the edit yields `after`.
  const edit = async (before: string, after: string, prefix = "", suffix = "") => {
    const document = await vscode.workspace.openTextDocument({ content: prefix + before + suffix });
    const targetRange = new vscode.Range(
      document.positionAt(prefix.length),
      document.positionAt(prefix.length + before.length),
    );

    const edits = minimalEdits(document, targetRange, before, after);
    assert.strictEqual(edits.length, 1);

    const [{ range, newText }] = edits;
    const text = document.getText();
    assert.strictEqual(
      text.slice(0, document.offsetAt(range.start)) +
        newText +
        text.slice(document.offsetAt(range.end)),
      prefix + after + suffix,
    );

    return [document.getText(range), newText];
  };

  test("replaces only the changed line at the start", async () => {
    assert.deepStrictEqual(await edit("a\nb\nc\n", "A\nb\nc\n"), ["a\n", "A\n"]);
  });

  test("replaces only the changed line in the middle", async () => {
    assert.deepStrictEqual(await edit("a\nb\nc\n", "a\nB\nc\n"), ["b\n", "B\n"]);
  });

  test("replaces only the changed line at the end", async () => {
    assert.deepStrictEqual(await edit("a\nb\nc\n", "a\nb\nC\n"), ["c\n", "C\n"]);
  });

  test("inserts lines without replacing anything", async () => {
    assert.deepStrictEqual(await edit("a\nc\n", "a\nb\nc\n"), ["", "b\n"]);
    assert.deepStrictEqual(await edit("a\na\n", "a\na\na\n"), ["", "a\n"]);
  });

  test("deletes lines without inserting anything", async () => {
    assert.deepStrictEqual(await edit("a\nb\nc\n", "a\nc\n"), ["b\n", ""]);
    assert.deepStrictEqual(await edit("a\na\na\n", "a\na\n"), ["a\n", ""]);
  });

  test("returns no edit when nothing changed", async () => {
    const document = await vscode.workspace.openTextDocument({ content: "a\nb\n" });
    const targetRange = new vscode.Range(document.positionAt(0), document.positionAt(4));

    assert.deepStrictEqual(minimalEdits(document, targetRange, "a\nb\n", "a\nb\n"), []);
  });

  test("handles text without a trailing newline", async () => {
    assert.deepStrictEqual(await edit("a\nb", "a\nB"), ["b", "B"]);
    assert.deepStrictEqual(await edit("a\nb", "a\nb\n"), ["b", "b\n"]);
    assert.deepStrictEqual(await edit("a\nb\n", "a\nb"), ["b\n", "b"]);
    assert.deepStrictEqual(await edit("a\nb\nc", "A\nb\nc"), ["a\n", "A\n"]);
    assert.deepStrictEqual(await edit("abc", "abcd"), ["abc", "abcd"]);
  });

  test("never splits a surrogate pair", async () => {
    // U+1F600 and U+1F601 share the high surrogate, U+1F600 and U+1FA00 the low one.
    assert.deepStrictEqual(await edit("a\n\u{1F600}x\nb\n", "a\n\u{1F601}x\nb\n"), [
      "\u{1F600}x\n",
      "\u{1F601}x\n",
    ]);
    assert.deepStrictEqual(await edit("a\nx\u{1F600}\nb\n", "a\nx\u{1FA00}\nb\n"), [
      "x\u{1F600}\n",
      "x\u{1FA00}\n",
    ]);
  });

  test("offsets the edit by the start of the formatted range", async () => {
    assert.deepStrictEqual(await edit("a\nb\nc\n", "a\nB\nc\n", "x\ny\n", "z\n"), ["b\n", "B\n"]);
    assert.deepStrictEqual(await edit("a\nb\n", "A\nb\n", "xx", "yy"), ["a\n", "A\n"]);
    assert.deepStrictEqual(await edit("a\nb", "a\nB", "xx", "yy"), ["b", "B"]);
  });
});
