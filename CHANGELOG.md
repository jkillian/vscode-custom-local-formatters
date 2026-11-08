# Change Log

All notable changes to the "custom-local-formatters" extension will be documented in this file.

Format based off of [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added
- `pattern` option to choose the files a formatter applies to with glob patterns, instead of or in addition to `languages`

## v0.3.0 - 2026-11-05

### Added
- [#53][p53] - Explicit Workspace Trust declaration: the extension is disabled in untrusted workspaces
- [#40][p40] - Documentation for variable substitution and the `*` language identifier. Thanks @non-bin!

### Changed
- [#49][p49] - Requires VS Code 1.74 or newer
- [#49][p49] - The extension now activates when a file is opened instead of on startup
- [#49][p49] - The extension is disabled in virtual workspaces, since formatters need access to files on disk
- [#49][p49] - The output channel now uses log levels and timestamps
- [#49][p49] - Updated development tooling (`@vscode/vsce`, ESLint flat config, TypeScript, test runner)

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
[p30]: https://github.com/jkillian/vscode-custom-local-formatters/pull/30
[p36]: https://github.com/jkillian/vscode-custom-local-formatters/pull/36
[p37]: https://github.com/jkillian/vscode-custom-local-formatters/pull/37
[p40]: https://github.com/jkillian/vscode-custom-local-formatters/pull/40
[p49]: https://github.com/jkillian/vscode-custom-local-formatters/pull/49
[p53]: https://github.com/jkillian/vscode-custom-local-formatters/pull/53
