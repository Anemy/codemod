import fs from 'fs';
import path from 'path';

import { openai } from './ai';
import type { CodeModFileMap, RenameOperation } from './code-mapper';
import type { CodeModOptions } from './types';

const MAX_FILE_LENGTH_CHARACTERS = 10000;

// Using a mapping and the instructions, create the output files.
async function createEditedFiles(inputFileNames: string[], mapping: CodeModFileMap, options: CodeModOptions) {
  const outputFiles: {
    fileName: string;
    text: string;
  }[] = [];

  for (const fileName of inputFileNames) {
    if (mapping[fileName]?.operation === 'delete') {
      // Skip the file if the mapping says it's deleted.
      continue;
    }

    const absoluteFilePath = path.join(options.inputFolder, fileName);
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
        instruction: options.instructions,

        ...(typeof options.temperature === 'number' ? {
          temperature: options.temperature
        } : {})
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

export { createEditedFiles };
