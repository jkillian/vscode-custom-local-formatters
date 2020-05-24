# custom-local-formatters README

Allows users to define local formatters with locally defined scripts.

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
   You can now format your code though the format code command (`shift+alt+f`), enable the `editor.formatOnSave` option, or use the formatter however else VSCode allows.

## Extension Settings

Full extension configuration schema and documentation can be found in the [`package.json`](package.json) file.

## Known Limitations

VSCode doesn't seem to provide a way to name the formatter which an extension creates.
This means that if you register multiple formatters for the same language,
they will unfortunately both show up as 'Custom Local Formatters' and it will be difficult to tell them apart.
