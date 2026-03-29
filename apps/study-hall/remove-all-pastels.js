const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

function removePastels() {
  ['components', 'app'].forEach(dir => {
    walkDir(path.join(__dirname, dir), function(filePath) {
      if (!filePath.endsWith('.tsx')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;
      
      // Fix hover backgrounds
      content = content.replace(/\bhover:bg-(emerald|amber|rose|sky|indigo|orange|yellow|blue|red)-(50|100)\b/g, 'hover:bg-slate-50');
      
      // Fix hover borders
      content = content.replace(/\bhover:border-(emerald|amber|rose|sky|indigo|orange|yellow|blue|red)-(100|200|300|400)\b/g, 'hover:border-slate-300');
      
      // Fix standard borders
      content = content.replace(/(?<!hover:)\bborder-(emerald|amber|rose|sky|indigo|orange|yellow|blue|red)-(100|200|300|400)\b/g, 'border-slate-200');
      
      // Fix standard backgrounds
      content = content.replace(/(?<!hover:)\bbg-(emerald|amber|rose|sky|indigo|orange|yellow|blue|red)-(50|100)\b/g, 'bg-white border border-slate-200');
      
      // Cleanup duplicate classes
      content = content.replace(/border\s+border\s+border/g, 'border');
      content = content.replace(/border\s+border/g, 'border border-slate-200');
      content = content.replace(/border-slate-200\s+border-slate-200/g, 'border-slate-200');
      content = content.replace(/bg-white\s+bg-white/g, 'bg-white');

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Cleaned pastels in: ${filePath}`);
      }
    });
  });
}
removePastels();
