import { writeFileSync } from "node:fs";
import { example } from "../src/example";
import { parseSchema } from "../src/schema";
writeFileSync(
  new URL("../src/example-model.json", import.meta.url),
  JSON.stringify(parseSchema(example), null, 2) + "\n",
);
