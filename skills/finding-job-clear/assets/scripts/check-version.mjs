// The site (website/src/version.js) and Apps Script (apps-script/Shared.gs) must carry the same CODE_VERSION.
// Run: node scripts/check-version.mjs   (also run by the template builder). Exit code 1 when they differ.
// When you change code on either side, raise the version on BOTH (format YYYY.MM.DD, or YYYY.MM.DD.2 for a second
// release on the same day): then Nika can tell when one side was not updated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pick = (text, file) => {
  const m = text.match(/CODE_VERSION\s*=\s*'([0-9.]+)'/);
  if (!m) { console.error(`check-version: no CODE_VERSION in ${file}`); process.exit(1); }
  return m[1];
};
// the private repo has website/, the template (skill assets) has site/
const SITE = fs.existsSync(path.join(ROOT, 'website', 'src', 'version.js')) ? 'website/src/version.js' : 'site/src/version.js';
const site = pick(read(SITE), SITE);
const gs = pick(read('apps-script/Shared.gs'), 'apps-script/Shared.gs');
if (site !== gs) {
  console.error(`check-version: the site is ${site} but Apps Script is ${gs}. Set the same CODE_VERSION in both files.`);
  process.exit(1);
}
console.log(`check-version: ${site} on both sides`);
export const CODE_VERSION = site;
