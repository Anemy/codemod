import fs from 'fs';
import glob from 'glob';
import path from 'path';
import { promisify } from 'util';

import { generateCodeModFileMapping } from './code-mapper';
import { createEditedFiles } from './code-editor';
import type { CodeModOptions } from './types';

const MAX_INPUT_FILES = 5;

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

async function getInputFileNames(options: CodeModOptions): Promise<string[]> {
  try {
    // Ensure we can access the folder.
    await fs.promises.access(options.inputFolder, fs.promises.constants.R_OK);
  } catch (err) {
    throw new Error(`Cannot access desired codemod folder: ${err}`);
  }

  console.log(`Starting codemod on folder "${options.inputFolder}"`);

  const matchPatterns = getMatchPatternArray(options.matchPatterns);
  console.log('Match patterns:');
  for (const pattern of matchPatterns) {
    console.log(pattern);
  }

  const inputFileNames = new Set<string>();
  const runGlob = promisify(glob);
  for (const pattern of matchPatterns) {
    // We could parallelize this for large code bases.
    const globbedFiles = await runGlob(path.join(options.inputFolder, pattern), {
      ignore: options.ignorePatterns
    });

    for (const fileName of globbedFiles) {
      // We remove the input folder so that the ai has less tokens it needs to parse and create.
      inputFileNames.add(fileName.substring(options.inputFolder.length + 1));
    }
  }

  console.log('\nInput files:');
  for (const fileName of inputFileNames) {
    console.log(fileName);
  }

  return Array.from(inputFileNames);
}

async function runCodemodOnFiles(options: CodeModOptions, inputFileNames: string[]) {
  // 1. Calculate the high level file mapping to follow later in the code modification.
  const mapping = await generateCodeModFileMapping(options.instructions, inputFileNames);

  // 2. Using the mapping and the instructions, create the output files.
  const outputFiles = createEditedFiles(inputFileNames, mapping, options);

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

async function codemod(options: CodeModOptions) {
  validateOptions(options);

  const startTime = Date.now();

  // 1. Load the input.
  const inputFileNames = await getInputFileNames(options);

  if (inputFileNames.length > MAX_INPUT_FILES) {
    throw new Error(`Too many input files passed, current max is ${MAX_INPUT_FILES} files.`);
  }

  // 2. Use the ai model to get the resulting file using the instructions.
  const outputFiles = await runCodemodOnFiles(options, inputFileNames);

  // TODO: Git branch and compare diff.
  // Later we can use the various `options` that the models generate to give users more fine tuned controls.

  // 3. Output to the output.
  const outputFolderName = options.outputFolder ?? `${options.inputFolder}_codemod_output`;
  await fs.promises.mkdir(outputFolderName, { recursive: true });

  console.log('\nOutput files:');
  for (const outputFile of outputFiles) {
    const fileName = outputFile.fileName;
    console.log(fileName);

    const outputFileName = path.join(outputFolderName, fileName);
    const outputDirectory = path.dirname(outputFileName);
    try {
      // See if the folder already exists.
      await fs.promises.access(outputDirectory, fs.promises.constants.R_OK);
    } catch (err) {
      // Make the folder incase it doesn't exist. If this fails something else is wrong.
      await fs.promises.mkdir(outputDirectory, { recursive: true });
    }

    // TODO: Parallelize.
    await fs.promises.writeFile(outputFileName, outputFile.text);
  }

  console.log('\nDone. Time elapsed (ms):', (Date.now() - startTime));
  console.log('Outputted to', outputFolderName);
}

export { codemod };
