export type Config = {
  formatters: readonly FormatterConfig[];
};

export type FormatterConfig = {
  command:
    | string
    | {
        [platform in NodeJS.Platform | "*"]: string;
      };
  disabled?: boolean;
  languages?: string[];
  pattern?: string | string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  stdin?: boolean;
  timeout?: number;
};
