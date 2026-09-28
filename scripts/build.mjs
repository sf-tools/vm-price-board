import * as esbuild from "esbuild";
import { minify } from "html-minifier-terser";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SRC = "web";
const OUT = "dist";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(`${SRC}/public`, OUT, { recursive: true });

const { metafile } = await esbuild.build({
  entryPoints: { app: `${SRC}/app.ts`, style: `${SRC}/style.css` },
  outdir: OUT,
  entryNames: "[name]-[hash]",
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2022", "safari16"],
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});

const built = Object.fromEntries(
  Object.entries(metafile.outputs)
    .filter(([, o]) => o.entryPoint)
    .map(([file, o]) => [path.basename(o.entryPoint), path.basename(file)]),
);

let html = await readFile(`${SRC}/index.html`, "utf8");
for (const [source, hashed] of Object.entries(built)) {
  const ref = new RegExp(`(href|src)="${source.replace(".", "\\.")}"`);
  if (!ref.test(html)) throw new Error(`index.html doesn't reference ${source}`);
  html = html.replace(ref, `$1="/${hashed}"`);
}

html = await minify(html, {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: false,
  sortAttributes: true,
  sortClassName: true,
});

await writeFile(`${OUT}/index.html`, html);

await writeFile(
  `${OUT}/_headers`,
  `${Object.values(built)
    .map((f) => `/${f}\n  Cache-Control: public, max-age=31536000, immutable`)
    .join("\n")}\n/\n  Cache-Control: public, max-age=0, must-revalidate\n`,
);

const sizes = await Promise.all(
  ["index.html", ...Object.values(built)]
    .map(async (f) => `${f} ${((await readFile(`${OUT}/${f}`)).length / 1024).toFixed(1)} KB`),
);

console.log(`built ${OUT}/: ${sizes.join(", ")}`);
