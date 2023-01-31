import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { promisify } from 'util';

import { openai } from './ai';
import { generateCodeModFileMapping } from './code-mapper';
import type { RenameOperation } from './code-mapper';

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

    for (const fileName of globbedFiles) {
      // We remove the input folder so that the ai has less tokens it needs to parse and create.
      inputFileNames.add(fileName.substring(opts.inputFolder.length + 1));
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
  const mapping = await generateCodeModFileMapping(opts.instructions, inputFileNames);

  // 2. Using the mapping and the instructions, create the output files.
  const outputFiles: {
    fileName: string;
    text: string;
  }[] = [];

  for (const fileName of inputFileNames) {
    if (mapping[fileName]?.operation === 'delete') {
      // Skip the file if the mapping says it's deleted.
      continue;
    }

    const absoluteFilePath = path.join(opts.inputFolder, fileName);
    // TODO: How to parallelize but also be able to condense/larger changes?
    // Let's focus small for now and build out.
    const inputFileContents = await fs.promises.readFile(absoluteFilePath, 'utf8');

    if (inputFileContents.length > MAX_FILE_LENGTH_CHARACTERS) {
      throw new Error(`Too large of an input file passed, current max is ${MAX_FILE_LENGTH_CHARACTERS} characters. "${fileName}" was "${inputFileContents.length}".`);
    }

    // TODO: File renaming/mapping.

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

      const outputFileName = mapping[fileName]?.operation === 'rename'
        ? ((mapping[fileName] as RenameOperation)?.name || fileName) // TODO: Ensure valid name.
        : fileName;

      outputFiles.push({
        fileName: outputFileName,
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
  // Later we can use the various `options` that the models generate to give users more fine tuned controls.

  // 3. Output to the output.

  const outputFolderName = opts.outputFolder ?? `${opts.inputFolder}_codemod_output`;
  await fs.promises.mkdir(outputFolderName, { recursive: true });

  console.log('\nOutput files:');
  for (const outputFile of outputFiles) {
    const fileName = outputFile.fileName;
    console.log(fileName);

    const outputFileName = path.join(outputFolderName, fileName);
    // TODO: Parallelize.
    await fs.promises.writeFile(outputFileName, outputFile.text);
  }

  console.log('\nDone. Time elapsed (ms):', (Date.now() - startTime));
  console.log('Outputted to', outputFolderName);
}

export { codemod };
