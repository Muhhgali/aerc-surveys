import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/client", { recursive: true });
await mkdir("dist/.openai", { recursive: true });

await cp(".open-next", "dist/server", { recursive: true });
await cp(".open-next/assets", "dist/client", { recursive: true });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
await writeFile(
  "dist/server/index.js",
  'export { default } from "./worker.js";\nexport * from "./worker.js";\n',
  "utf8",
);

console.log("Prepared Sites worker bundle in dist/");
