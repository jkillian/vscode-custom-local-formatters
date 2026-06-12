# Change Log

All notable changes to the "custom-local-formatters" extension will be documented in this file.

Format based off of [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added

- Variable substitutions in commands: `${file}` / `${buffer_path}` (absolute path of the file being
  formatted) and `${workspaceFolder}` (workspace root). Paths are shell-escaped automatically.
- Unescaped variants `${fileRaw}`, `${bufferPathRaw}`, `${workspaceFolderRaw}` for composing paths
  into larger tokens. Quoting is up to the user.
- `pattern` option: register formatters by file path glob(s), instead of or in addition to
  `languages`. Useful for extensionless files.
- `cwd` option: set the working directory the command runs in (default: workspace root).
- `env` option: extra environment variables for the command.
- `stdin: false` option for tools that only format in place: the document is written to a
  temporary file, the command runs on it, and the result is read back.
- `timeout` option: kill the formatter after the given number of seconds.
- `"*"` in `languages` registers the formatter for all languages (now documented in the
  settings schema and README, with a dprint example).

### Changed

- Activation switched from `*` to `onStartupFinished`; minimum VS Code version is now 1.47.
- The settings UI now documents all formatter fields, command variables, and a usage example
  for `customLocalFormatters.formatters`.
- Slimmer package (685 KB to 33 KB): the demo gif loads from a CDN instead of being bundled,
  and a `files` allowlist keeps stray files out of the vsix.

## v0.2.0 - 2025-09-09

### Added

- [#37][p37] - Experimental support for range formatting

## v0.1.2 and v0.1.3 - 2025-09-09

### Changed

- [#36][p36] - Better messages and logging when a formatter fails

### Fixed

- [#29][p29] - Possibly better handling of unicode and multi-byte characters
- [#30][p30] - Possibly better handling of passed `tabSize` options

## v0.1.1 - 2025-02-08

### Fixed

- [#26][p26] - Changed process execution to use a shell to allow more flexibility and better match v0.0.6 behavior. Thanks @lmerynda!

## v0.1.0 - 2025-01-29

### Added

- [#18][p18] - Ability to specify different commands based on platform. Thanks @WebFreak001!

### Changed

- [#19][p19] - Better IO handling and notifications for formatting failure. Thanks @lmerynda!

## v0.0.6 - 2021-09-27

### Improvements

- Dependency updates

## v0.0.5 - 2021-09-27

### Improvements

- Dependency updates

## v0.0.4 - 2020-05-23

### Improvements

- Documentation updates

## v0.0.3 - 2020-05-23

### Improvements

- Documentation updates

## v0.0.2 - 2020-05-23

### Improvements

- Better logging

## v0.0.1 - 2020-05-23

### Features

- Initial release

[p18]: https://github.com/jkillian/vscode-custom-local-formatters/pull/18
[p19]: https://github.com/jkillian/vscode-custom-local-formatters/pull/19
[p26]: https://github.com/jkillian/vscode-custom-local-formatters/pull/26
[p29]: https://github.com/jkillian/vscode-custom-local-formatters/pull/29
[p30]: https://github.com/jkillian/vscode-custom-local-formatters/pull/20
[p36]: https://github.com/jkillian/vscode-custom-local-formatters/pull/36
[p37]: https://github.com/jkillian/vscode-custom-local-formatters/pull/37
