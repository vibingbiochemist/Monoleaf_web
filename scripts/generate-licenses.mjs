// Generates THIRD_PARTY_LICENSES.md programmatically (never hand-maintained).
// Monoleaf_web has no Rust/Cargo side, unlike the desktop app this was ported
// from, so this is the JS-only half of that generator. Run: npm run licenses
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const run = (cmd) =>
  execSync(cmd, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const packages = JSON.parse(
  run(
    "npx license-checker-rseidelsohn --production --json --excludePrivatePackages",
  ),
);

let body = "";
for (const [name, info] of Object.entries(packages)) {
  body += `## ${name}\n\nLicense: ${info.licenses}\n`;
  if (info.repository) body += `Repository: ${info.repository}\n`;
  body += "\n";
  if (info.licenseFile && existsSync(info.licenseFile)) {
    const text = readFileSync(info.licenseFile, "utf8").trim();
    body += "```\n" + text + "\n```\n\n";
  }
}

const header = `<!-- GENERATED FILE - do not edit. Run: npm run licenses -->

# Third-party licenses

Monoleaf_web bundles the following open-source software.

# JavaScript dependencies

`;

writeFileSync("THIRD_PARTY_LICENSES.md", header + body);
console.log(
  `THIRD_PARTY_LICENSES.md written (${Object.keys(packages).length} JS packages).`,
);
