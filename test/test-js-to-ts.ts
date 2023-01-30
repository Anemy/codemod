import path from 'path';

import { codemod } from '../src';

const outputFolderPath = path.join(__dirname, 'js_to_ts_output');

async function runJsToTs() {
  await codemod({
    inputFolder: path.join(__dirname, 'fixtures/js-to-ts'),
    outputFolder: outputFolderPath,
    matchPatterns: '**/*.js',
    instructions: 'Translate javascript to typescript'
  });
}

runJsToTs();
