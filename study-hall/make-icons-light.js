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

function updateIconBoxes() {
  ['components', 'app'].forEach(dir => {
    walkDir(path.join(__dirname, dir), function(filePath) {
      if (!filePath.endsWith('.tsx')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;
      
      content = content.replace(/className="([^"]*)"/g, (match, classStr) => {
        // Target fixed-size square/circle icon wrappers
        if (/\bh-\d+\b/.test(classStr) && /\bw-\d+\b/.test(classStr) && 
            /\bitems-center\b/.test(classStr) && /\bjustify-center\b/.test(classStr)) {
          
          // Exclude things with horizontal padding which usually means it's a button with text
          if (/\bpx-\d+/.test(classStr)) return match;
          
          // Match bg-slate-900, 950, 800, or black with white text
          if (/\bbg-(slate-800|slate-900|slate-950|black)\b/.test(classStr) && /\btext-(white|slate-50)\b/.test(classStr)) {
            let newStr = classStr.replace(/\bbg-(slate-800|slate-900|slate-950|black)\b/, 'bg-slate-50');
            newStr = newStr.replace(/\btext-(white|slate-50)\b/, 'text-slate-600');
            
            // Just in case it has ring or shadow, tone them down
            newStr = newStr.replace(/\bring-slate-[89]00\b/, 'ring-slate-200');
            newStr = newStr.replace(/\bshadow-md\b/, ''); // remove heavy shadow from icons
            
            return `className="${newStr}"`;
          }
        }
        return match;
      });

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated icon boxes in: ${filePath}`);
      }
    });
  });
}

updateIconBoxes();
