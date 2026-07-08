const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

// Count opening and closing braces
let openBraces = 0;
let closeBraces = 0;
for (const ch of html) {
  if (ch === '{') openBraces++;
  if (ch === '}') closeBraces++;
}

const results = {
  htmlSize: html.length,
  openBraces,
  closeBraces,
  balanced: openBraces === closeBraces,
  difference: openBraces - closeBraces
};

// Check for the specific issue - duplicate }} near dist-status
const distStatusIndex = html.indexOf('dist-status');
const snippet = html.substring(Math.max(0, distStatusIndex - 50), Math.min(html.length, distStatusIndex + 150));

results.distStatusFound = distStatusIndex !== -1;
results.snippetAroundDistStatus = snippet;

// Check for syntax issues with closing braces
const extraBracePattern = /}\s*}\s*\n/g;
const matches = [...html.matchAll(extraBracePattern)];
results.consecutiveCloses = matches.map(m => ({
  index: m.index,
  context: html.substring(Math.max(0, m.index - 40), Math.min(html.length, m.index + 20))
}));

fs.writeFileSync(path.join(__dirname, 'verify-results.json'), JSON.stringify(results, null, 2));
console.log('Verification complete:', JSON.stringify(results, null, 2));
