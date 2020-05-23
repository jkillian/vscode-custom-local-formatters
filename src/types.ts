export type Config = {
  formatters: readonly FormatterConfig[];
};

export type FormatterConfig = {
  command: string;
  disabled?: boolean;
  languages: string[];
};
