import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { codemod } from '../src';

const baseOutputFolderPath = path.join(__dirname, 'test_output');

describe('#codemod', function() {
  // Testing from New Zealand at the moment.
  this.timeout(50000);

  before(async function() {
    try {
      await fs.promises.access(baseOutputFolderPath, fs.promises.constants.R_OK);

      // Delete the outputs folder.
      // We do this before tests as it's useful to have them around to debug if the test fails.
      await fs.promises.rmdir(baseOutputFolderPath, {
        recursive: true
      });
    } catch (err: any) {
      if (!err.message.includes('ENOENT: no such file or directory')) {
        throw err;
      }
    }
  });

  it('updates a file (renames a function)', async function() {
    const outputFolderPath = path.join(baseOutputFolderPath, 'basic-js-output');

    await codemod({
      inputFolder: path.join(__dirname, 'fixtures/basic-js'),
      outputFolder: outputFolderPath,
      matchPatterns: '**/*.js',
      instructions: 'Rename the function name to "nice"'
    });

    // Ensure it exists.
    fs.promises.access(outputFolderPath, fs.promises.constants.R_OK);

    // Make sure the file exists.
    const outputFile = path.join(outputFolderPath, 'test.js');
    await fs.promises.access(outputFile, fs.promises.constants.R_OK);

    // Check for the right function name in the file contents.
    const fileContents = await fs.promises.readFile(outputFile, 'utf8');
    expect(fileContents).to.contain('export function nice(a, b) {');
  });

  it('renames a file and js to ts (js to ts)', async function() {
    const outputFolderPath = path.join(baseOutputFolderPath, 'basic-js-to-ts');

    await codemod({
      inputFolder: path.join(__dirname, 'fixtures/basic-js-to-ts'),
      outputFolder: outputFolderPath,
      matchPatterns: '**/*.js',
      instructions: 'Translate javascript to typescript'
    });

    // Ensure it exists.
    fs.promises.access(outputFolderPath, fs.promises.constants.R_OK);

    // Make sure the file exists.
    const outputFile = path.join(outputFolderPath, 'test.ts');
    await fs.promises.access(outputFile, fs.promises.constants.R_OK);
  });

  it.skip('handles nested folders', async function() {
    const outputFolderPath = path.join(baseOutputFolderPath, 'nested');

    await codemod({
      inputFolder: path.join(__dirname, 'fixtures/nested'),
      outputFolder: outputFolderPath,
      matchPatterns: '**/*.js',
      instructions: 'Improve function names',
      temperature: 0.5 // Tough instruction so we give a higher temperature (more freedom for the response.)
    });

    // Ensure it exists.
    fs.promises.access(outputFolderPath, fs.promises.constants.R_OK);

    // Make sure the file exists.
    const outputFile = path.join(outputFolderPath, 'folder-with-js', 'main.js');
    await fs.promises.access(outputFile, fs.promises.constants.R_OK);
  });
});
