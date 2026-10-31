import { readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(process.cwd(), ".output", "public");
const indexPath = join(publicDir, "index.html");

if (process.env.CAPACITOR_BUILD !== "1") {
  await unlink(indexPath).catch(() => undefined);
  console.log("Skipped Capacitor static entry (set CAPACITOR_BUILD=1 for an APK build)");
  process.exit(0);
}

const assetsDir = join(publicDir, "assets");
const assets = await readdir(assetsDir);
const clientEntry = assets.find((name) => /^index-[^/]+\.js$/.test(name));
const stylesheet = assets.find((name) => /^styles-[^/]+\.css$/.test(name));

if (!clientEntry) {
  throw new Error("Could not find the TanStack client entry in .output/public/assets");
}

const css = stylesheet ? `    <link rel="stylesheet" href="/assets/${stylesheet}" />\n` : "";
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0d4f59" />
${css}  </head>
  <body>
    <script type="module" src="/assets/${clientEntry}"></script>
  </body>
</html>
`;

await writeFile(join(publicDir, "index.html"), html, "utf8");
console.log(`Prepared Capacitor entry: ${clientEntry}`);
