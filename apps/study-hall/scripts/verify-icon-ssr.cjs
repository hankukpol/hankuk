const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { LogIn } = require("lucide-react");

async function verify() {
  const esmPath = require.resolve("lucide-react/dist/esm/icons/log-in.js");
  const { default: BrowserLogIn } = await import(pathToFileURL(esmPath).href);
  const render = (Icon) => renderToStaticMarkup(React.createElement(Icon, { className: "h-4 w-4" }));
  const browserExpected = render(BrowserLogIn);
  const expected = render(LogIn);
  const htmlPath = path.join(process.env.NEXT_DIST_DIR || ".next", "server/app/login.html");
  if (!fs.existsSync(htmlPath)) throw new Error(`Login prerender output was not generated: ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, "utf8");
  const actual = html.match(/<svg\b[^>]*class="[^"]*lucide-log-in[^"]*"[^>]*>[\s\S]*?<\/svg>/)?.[0];
  if (!actual) throw new Error(`Login icon was not found in ${htmlPath}`);
  const shapes = (svg) => svg.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>$/, "");
  if (shapes(actual) !== shapes(expected) || shapes(actual) !== shapes(browserExpected)) {
    console.error("Login icon SSR differs from this app's installed lucide-react", {
      version: require("lucide-react/package.json").version,
      packagePath: require.resolve("lucide-react"),
      expected,
      browserExpected,
      actual,
    });
    process.exit(1);
  }
  console.log("Login icon SSR matches lucide-react", require("lucide-react/package.json").version);
}
verify().catch((error) => { console.error(error); process.exit(1); });
