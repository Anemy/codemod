import { openai } from './ai';

export type DeleteOperation = {
  operation: 'delete';
};

export type RenameOperation = {
  operation: 'rename';
  name: string;
};

export type DoNothingOperation = {
  operation: 'none';
};

export type ExpandedOperation = {
  operation: 'expand';
  names: string[];
};

export type FileMappingOperation = DeleteOperation | RenameOperation | DoNothingOperation | ExpandedOperation;

function createMappingPrompt(instructions: string, inputFileNames: string[]) {
  // For example, consider the following file structure with the instructions "convert javascript to typescript":
  // ["folderName/test.js", ""]
  // This would generate the code modification file mapping json output:
  // {
  //   "folderName/test.js": {
  //     "operation": "rename",
  //     "name": "folderName/test.ts"
  //   }
  // }

  // The code modification instructions to use for generating the code modification file mapping are: "${opts.instructions}".

  // Response with the mapping in a json format.

  // Straight to the point concrete.
  const mappingPrompt = `
Create a high level file mapping to be used to perform a code modification on a code base.
Response with the mapping in a json format.
If nothing should happen to the file structure, which often happens when the code modification request is intended for the code inside of files, use the "operation" "none".
If a file is to be deleted, use the "operation" "delete".
If a file is to be renamed, use the "operation" "rename".
If a file is to be expanded into multiple files, use the "operation" "expand".
Examples:
Input:

Instructions: "convert javascript to typescript"
["folderName/test.js", "folderName/testTwo.js"]

Output:
{
  "folderName/test.js": {
    "operation": "rename",
    "name": "folderName/test.ts"
  },
  "folderName/testTwo.js": {
    "operation": "rename",
    "name": "folderName/testTwo.ts"
  }
}

Input:

Instructions: "convert usage of the "async" package to use "async/await""
["pineapples/index.js", "pineapples/main.js"]

Output:
{
  "pineapples/index.js": {
    "operation": "none"
  },
  "pineapples/main.js": {
    "operation": "none"
  }
}

Now it's your turn.

Input:

Instructions: "${instructions}"
[${inputFileNames.map(fileName => `"${fileName}"`).join(', ')}]

Output:
`;

  return mappingPrompt;
}

export type CodeModFileMap = {
  [fileName: string]: FileMappingOperation
};

async function generateCodeModFileMapping(instructions: string, inputFileNames: string[]): Promise<CodeModFileMap> {
  // 1. Calculate the high level file mapping to follow in the code modification.
  // We want to see if the file structure changes. (example: .js -> .ts)
  // We pass the file structure along with the instructions to a more generalized gpt model.
  // This then tells us where things should map to.

  // TODO:
  // Different orderings of instructions/mapping.
  // Different example mappings.
  // Different output formats (json, text, yaml, etc.)
  // Provide a specific response if the ai can't figure it out.

  // TODO: Fine tune the models with our test data.
  // https://platform.openai.com/docs/guides/fine-tuning

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

  const mappingPrompt = createMappingPrompt(instructions, inputFileNames);

  let mappingResponse;
  try {
    // https://beta.openai.com/docs/models/gpt-3
    // We're using `text-davinci-003` to do the mapping. It's trained up till June 2021.
    // https://platform.openai.com/docs/api-reference/completions/create
    mappingResponse = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: mappingPrompt,

      // https://platform.openai.com/tokenizer
      // TODO: Calculate the max tokens using the amount of files/folders and the complexity of instructions.
      max_tokens: 200,

      // What sampling temperature to use. Higher values means the model will take more risks.
      // Try 0.9 for more creative applications, and 0 (argmax sampling) for ones with a well-defined answer.
      // https://towardsdatascience.com/how-to-sample-from-language-models-682bceb97277
      temperature: 0

      // n: 1 // How many edits to generate for the input and instruction. (Defaults 1).
    });
  } catch (err: any) {
    if (err?.response) {
      console.error(err.response.status);
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }

    throw new Error(`Unable to perform openai 'text-davinci-003' high level mapping request using instructions "${instructions}": ${err}`);
  }

  // "choices": [
  //   {
  //     "text": "\n\nThis is indeed a test",
  //     "index": 0,
  //     "logprobs": null,
  //     "finish_reason": "length"
  //   }
  // ],
  // "usage": {
  //   "prompt_tokens": 5,
  //   "completion_tokens": 7,
  //   "total_tokens": 12
  // }

  // TODO: We could ask the mapping ai to give an explanation for why it's doing what its doing.

  console.log('\nMapping response text:');
  console.log(mappingResponse.data.choices[0].text);

  let mapping;
  try {
    // result.data.choices[0].text
    mapping = JSON.parse(mappingResponse.data.choices[0].text as string);
  } catch (err) {
    console.error(err);

    throw new Error(`Unable to parse openai 'text-davinci-003' high level mapping request response. It used the instructions "${instructions}": ${err}`);
  }

  console.log('\nParsed mapping:');
  console.log(mapping);

  return mapping;
}

export { generateCodeModFileMapping };
