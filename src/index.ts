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

async function getInputFileNames(opts: CodeModOptions) {
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

  return inputFileNames;
}

async function codemod(opts: CodeModOptions) {
  const startTime = Date.now();

  if (!opts) {
    // TODO: Help or link help.
    throw new Error('Must supply options for codemod.');
  }

  // 1. Load the input.
  const inputFileNames = await getInputFileNames(opts);

  if (inputFileNames.size > MAX_INPUT_FILES) {
    throw new Error(`Too many input files passed, current max is ${MAX_INPUT_FILES} files.`);
  }

  // 2. Start the chat or prompt up.
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
      console.log('\n\nUsing file', fileName);
      console.log('With contents:\n');
      console.log(inputFileContents);
      console.log('\n\n\n');

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

      throw new Error(`Unable to perform openai request using contents from file "${fileName}": ${err}`);
    }
  }

  // TODO: File renaming.

  // 3. Output to the output.

  const outputFolderName = opts.outputFolder ?? `${opts.inputFolder}_codemod_output`;
  await fs.promises.mkdir(outputFolderName);

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
