# VSCode Custom Local Formatters

Lets users add formatters to VSCode that run locally defined scripts.

## Motivation

VSCode's formatter features lets you quickly format code through the Format Document command (`shift+alt+f`)
or automatically on save with the `editor.formatOnSave` option.

However, the only way to add new formatters to VSCode is by installing an extension.
If you have custom formatting tools or scripts you want to run, there's no easy way to integrate them with VSCode currently.

This extension solves that problem by providing an easy way to register custom scripts as VSCode formatters.
Here's an example of a custom python script that sorts imports and reformats code being run on a python file:

![Extension in use](https://cdn.jsdelivr.net/gh/jkillian/vscode-custom-local-formatters@e9e5d1b5179e42f295aa99ffed8647a0ff1c36a9/images/exampleUsecase.gif)

## Quickstart

0. Install this extension through the VSCode extensions panel or [VSCode extensions marketplace](https://marketplace.visualstudio.com/items?itemName=jkillian.custom-local-formatters).

1. Define your custom formatting script.
   Scripts will receive the contents of the file to be formatted over STDIN.
   They should output the formatted results over STDOUT.

2. Configure the extension to run your script on files of the right type.
   The script will be run with a working directory of the workspace root.
   Valid language identifiers [can be found here](https://code.visualstudio.com/docs/languages/identifiers).

   ```json
   "customLocalFormatters.formatters": [
     {
       "command": "python format-yml-files.py",
       "languages": ["yml"]
     }
   ]
   ```

3. That's it! Your script is now integrated with VSCode as an official formatter.
   You can now format your code though the Format Document command (`shift+alt+f`), enable the `editor.formatOnSave` option, or use the formatter however else VSCode allows.

## Extension Settings

Basic usage is just to set a command and an array of languages it should apply to:

```json
"customLocalFormatters.formatters": [
  {
    "command": "python format-yml-files.py",
    "languages": ["yml"]
  }
]
```

You can also specify platform-specific commands instead if needed:

```json
"customLocalFormatters.formatters": [
  {
    "command": {
      "darwin": "gshuf",
      "*": "shuf"
    },
    "languages": ["yml"]
  }
]
```

To register a formatter for every language, use `"*"` as the language:

```json
"customLocalFormatters.formatters": [
  {
    "command": "dprint fmt --stdin ${file}",
    "languages": ["*"]
  }
]
```

This works well with tools like [dprint](https://dprint.dev/) that decide for themselves how (and whether) to format a file:
the file path passed via `${file}` lets dprint pick the right plugin and apply your `dprint.json` include/exclude rules.

### Variable substitutions

Commands support the following variables, expanded before the command runs:

| Variable                          | Expands to                                                |
| --------------------------------- | --------------------------------------------------------- |
| `${file}` / `${buffer_path}`      | Absolute path of the file being formatted (shell-escaped) |
| `${workspaceFolder}`              | Workspace root path (shell-escaped)                       |
| `${insertSpaces}`                 | `true` or `false`, from the editor's formatting options   |
| `${tabSize}`                      | The configured tab size                                   |
| `${fileRaw}` / `${bufferPathRaw}` | Absolute file path, unescaped                             |
| `${workspaceFolderRaw}`           | Workspace root path, unescaped                            |

```json
"customLocalFormatters.formatters": [
  {
    "command": "prettier --stdin-filepath ${file} --tab-width ${tabSize}",
    "languages": ["typescript"]
  }
]
```

Path variables are quoted automatically (double quotes on Windows, single quotes elsewhere), so don't add your own quotes around them.
The `Raw` variants substitute the path verbatim: use them when composing into a larger token (e.g. `${fileRaw}.bak`) and handle quoting yourself.

### More options

| Option    | Default        | Does                                                                                                                                                                                                             |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pattern` | none           | Glob(s) matched against the file path, instead of or in addition to `languages`. With both set, a file must match a language and a pattern. Handy for extensionless files (`"**/Makefile"`).                     |
| `cwd`     | workspace root | Working directory for the command. Supports `${workspaceFolder}` (unescaped); relative paths resolve against the workspace root.                                                                                 |
| `env`     | none           | Extra environment variables, merged over the process environment. Values support `${workspaceFolder}` (unescaped).                                                                                               |
| `stdin`   | `true`         | When `false`, the document text is written to a temporary file, the command runs on it (file path variables point at that file), and the result is read back from the file. For tools that only format in place. |
| `timeout` | none           | Seconds the formatter may run before being killed.                                                                                                                                                               |

Example: an in-place formatter with a timeout and custom environment:

```json
"customLocalFormatters.formatters": [
  {
    "command": "gofmt -w ${file}",
    "languages": ["go"],
    "stdin": false,
    "timeout": 10,
    "env": { "GOFLAGS": "-mod=readonly" }
  }
]
```

Full extension configuration schema and documentation can be found in the [`package.json`](package.json) file.

## Known Limitations

VSCode doesn't seem to provide a way to name the formatter which an extension creates.
This means that if you register multiple formatters for the same language,
they will unfortunately both show up as 'Custom Local Formatters' and it will be difficult to tell them apart.
