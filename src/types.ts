
export type CodeModOptions = {
  // Path to where the codemod should happen.
  inputFolder: string;

  // Path to where the outputted codemod result should go.
  // If this isn't supplied then we use the `inputFolder` + '_codemod_output'.
  outputFolder?: string;

  ignorePatterns?: string[] | string;
  matchPatterns?: string[] | string; // If there are no match patterns then we match everything.
  instructions: string;

  // What sampling temperature to use. Higher values means the model will take more risks.
  // Try 0.9 for more creative applications, and 0 (argmax sampling) for ones with a well-defined answer.
  // https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277
  temperature?: number;
};
