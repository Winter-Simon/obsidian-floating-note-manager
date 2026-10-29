import esbuild from "esbuild";
import process from "node:process";
const production = process.argv.includes("production");
const context = await esbuild.context({
  entryPoints: ["src/main.ts"], bundle: true, platform: "browser", format: "cjs",
  target: "es2022", outfile: "main.js",
  external: ["obsidian", "electron", "@electron/remote"],
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "info",
});
if (production) { await context.rebuild(); await context.dispose(); }
else { await context.watch(); }
