import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { codemod } from '../src';

const outputFolderPath = path.join(__dirname, 'test_output');

describe('#codemod', function() {
  beforeEach(async function() {
    try {
      await fs.promises.access(outputFolderPath, fs.promises.constants.R_OK);

      // Delete the outputs folder.
      // We do this before tests as it's useful to have them around to debug if the test fails.
      await fs.promises.rmdir(outputFolderPath, {
        recursive: true
      });
    } catch (err: any) {
      if (!err.message.includes('ENOENT: no such file or directory')) {
        throw err;
      }
    }
  });

  it('updates a file (renames a function)', async function() {
    console.log('outputFolderPath', outputFolderPath);
    await codemod({
      inputFolder: path.join(__dirname, 'fixtures'),
      outputFolder: outputFolderPath,
      matchPatterns: '**/*.js',
      instructions: 'Rename all function names to "nice"'
    });

    // Ensure it exists.
    fs.promises.access(outputFolderPath, fs.promises.constants.R_OK);

    // Make sure the file exists.
    const outputFile = path.join(outputFolderPath, 'test.js');
    await fs.promises.access(outputFile, fs.promises.constants.R_OK);

    // Check for the right function name in the file contents.
    const fileContents = await fs.promises.readFile(outputFile, 'utf8');
    expect(fileContents).to.contain('export function addNumbers(a, b) {');
  });
});
