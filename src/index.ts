import fs from 'fs';
import * as dotenv from 'dotenv';
import glob from 'glob';
import path from 'path';
import { Configuration, OpenAIApi } from 'openai';
import { promisify } from 'util';

dotenv.config();

const openAIConfiguration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(openAIConfiguration);

type CodeModOptions = {
  // Path to where the codemod should happen.
  inputFolder: string;

  // Path to where the outputted codemod result should go.
  // If this isn't supplied then we use the `inputFolder` + '_codemod_output'.
  outputFolder?: string;

  ignorePatterns?: string[] | string;
  matchPatterns?: string[] | string; // If there are no match patterns then we match everything.
  instructions: string;
};

const MAX_INPUT_FILES = 5;
const MAX_FILE_LENGTH_CHARACTERS = 10000;

function getMatchPatternArray(matchPatterns?: string[] | string) {
  if (!matchPatterns) {
    return ['**/*'];
  } else if (typeof matchPatterns === 'string') {
    return [matchPatterns];
  } else {
    const matchPatternArray: string[] = [];
    for (const pattern of matchPatterns) {
      matchPatternArray.push(pattern);
    }
  }

  return matchPatterns;
}

async function getInputFileNames(opts: CodeModOptions): Promise<string[]> {
  try {
    // Ensure we can access the folder.
    await fs.promises.access(opts.inputFolder, fs.promises.constants.R_OK);
  } catch (err) {
    throw new Error(`Cannot access desired codemod folder: ${err}`);
  }

  console.log(`Starting codemod on folder "${opts.inputFolder}"`);

  const matchPatterns = getMatchPatternArray(opts.matchPatterns);
  console.log('Match patterns:');
  for (const pattern of matchPatterns) {
    console.log(pattern);
  }

  const inputFileNames = new Set<string>();
  const runGlob = promisify(glob);
  for (const pattern of matchPatterns) {
    // We could parallelize this for large code bases.
    const globbedFiles = await runGlob(path.join(opts.inputFolder, pattern), {
      ignore: opts.ignorePatterns
    });

    // TODO: De-duplicate the results, or use a set.
    for (const fileName of globbedFiles) {
      inputFileNames.add(fileName);
    }
  }

  console.log('\nInput files:');
  for (const fileName of inputFileNames) {
    console.log(fileName);
  }

  return Array.from(inputFileNames);
}

async function runCodemodOnFiles(opts: CodeModOptions, inputFileNames: string[]) {
  // 1. Calculate the high level file mapping to follow later in the code modification.
  // We want to see if the file structure changes. (example: .js -> .ts)
  // We pass the file structure along with the instructions to a more generalized gpt model.
  // This then tells us where things should map to.

  try {
    // TODO:
    // Different orderings of instructions/mapping.
    // Different example mappings.
    // Different output formats (json, text, yaml, etc.)
    // Provide a specific response if the ai can't figure it out.

    // Deleted, renamed, moved, expanded.

    // TODO: Fine tune the models with our test data.
    // https://platform.openai.com/docs/guides/fine-tuning

    // Straight to the point concrete.
    const mappingPrompt1 = `
Create a high level file mapping to be used to perform a code modification on a code base.
The code modification instructions to use for generating the code modification file mapping are: "${opts.instructions}".
If a file is to be deleted, use the "operation" "deleted".
If a file is to be renamed, use the "operation" "renamed".
If a file is to be expanded into multiple files, use the "operation" "expanded".
Generate the mapping in a json format.
For example, consider the following file structure with the instructions "convert javascript to typescript":
[
  "folderName/test.js"
]
This would generate the code modification file mapping json output:
{
  "folderName/test.js": {
    "operation": "renamed",
    "name": "folderName/test.ts"
  }
}
`;

    // Nicer, less direct style.
    //     const mappingPrompt2 = `
    // Hello, we would like you to please create a high level map that will be used to perform a code modification on a code base.
    // The code modification instructions we would like you to use for generate this mapping are: "${opts.instructions}".
    // `;

    //     // Direct with instructions at the end, examples at the beginning.
    //     const mappingPrompt2 = `
    // Hello, we would like you to please create a high level map that will be used to perform a code modification on a code base.
    // The code modification instructions to use for generate this mapping are: "${opts.instructions}".
    // `;

    // https://beta.openai.com/docs/models/gpt-3
    // We're using `text-davinci-003` to do the mapping. It's trained up till June 2021.
    // https://platform.openai.com/docs/api-reference/completions/create
    const mapping = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: mappingPrompt1,

      // https://platform.openai.com/tokenizer
      // TODO: Calculate the max tokens using the amount of files/folders and the complexity of instructions.
      max_tokens: 100,

      // What sampling temperature to use. Higher values means the model will take more risks.
      // Try 0.9 for more creative applications, and 0 (argmax sampling) for ones with a well-defined answer.
      // https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277
      temperature: 0
    });

    console.log('\n\nMapping:');
    console.log(mapping);
  } catch (err: any) {
    if (err?.response) {
      console.error(err.response.status);
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }

    throw new Error(`Unable to perform openai 'text-davinci-003' high level mapping request using instructions "${opts.instructions}": ${err}`);
  }

  // 2. Using the mapping and the instructions, create the output files.
  const outputFiles: {
    fileName: string;
    text: string;
  }[] = [];

  for (const fileName of inputFileNames) {
    // TODO: How to parallelize but also be able to condense/larger changes?
    // Let's focus small for now and build out.
    const inputFileContents = await fs.promises.readFile(fileName, 'utf8');

    if (inputFileContents.length > MAX_FILE_LENGTH_CHARACTERS) {
      throw new Error(`Too large of an input file passed, current max is ${MAX_FILE_LENGTH_CHARACTERS} characters. "${fileName}" was "${inputFileContents.length}".`);
    }

    try {
      // https://beta.openai.com/docs/api-reference/edits/create
      const result = await openai.createEdit({
        model: 'text-davinci-edit-001',
        input: inputFileContents,
        // TODO: Fine tune these instructions and somehow weave it together with the whole input.
        // Prompt input/output? QA style
        instruction: opts.instructions
        // n: 1 // How many edits to generate for the input and instruction. (Defaults 1).
      });

      // TODO: Factor in multiple choices.
      // TODO: How to parallelize but also be able to condense/larger changes?
      // Let's focus small for now and build out.

      outputFiles.push({
        fileName,
        text: result.data.choices[0].text || ''
      });
    } catch (err: any) {
      if (err?.response) {
        console.error(err.response.status);
        console.error(err.response.data);
      } else {
        console.error(err.message);
      }

      throw new Error(`Unable to perform openai edit request using contents from file "${fileName}": ${err}`);
    }
  }

  // TODO: File renaming/mapping.

  return outputFiles;
}

async function validateOptions(opts: CodeModOptions) {
  if (!opts) {
    // TODO: Give help or link help.
    throw new Error('Must supply options for codemod.');
  }

  if (!opts.instructions) {
    throw new Error('Must supply instructions for codemod operation.');
  }
}

async function codemod(opts: CodeModOptions) {
  validateOptions(opts);

  const startTime = Date.now();

  // 1. Load the input.
  const inputFileNames = await getInputFileNames(opts);

  if (inputFileNames.length > MAX_INPUT_FILES) {
    throw new Error(`Too many input files passed, current max is ${MAX_INPUT_FILES} files.`);
  }

  // 2. Use the ai model to get the resulting file using the instructions.
  const outputFiles = await runCodemodOnFiles(opts, inputFileNames);

  // TODO: Git branch and compare diff.

  // 3. Output to the output.

  const outputFolderName = opts.outputFolder ?? `${opts.inputFolder}_codemod_output`;
  await fs.promises.mkdir(outputFolderName, { recursive: true });

  console.log('\nOutput files:');
  for (const outputFile of outputFiles) {
    const relativeInputFileName = outputFile.fileName.substring(opts.inputFolder.length);
    console.log(relativeInputFileName);

    const outputFileName = path.join(outputFolderName, relativeInputFileName);
    // TODO: Parallelize.
    await fs.promises.writeFile(outputFileName, outputFile.text);
  }

  console.log('\nDone. Time elapsed (ms):', (Date.now() - startTime));
  console.log('Outputted to', outputFolderName);
}

export { codemod };
