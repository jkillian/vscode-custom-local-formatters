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
  languages: string[];
	allowFailures?: boolean;
};
