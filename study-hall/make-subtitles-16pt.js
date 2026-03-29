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

function updateSubtitles() {
  ['components', 'app'].forEach(dir => {
    walkDir(path.join(__dirname, dir), function(filePath) {
      if (!filePath.endsWith('.tsx')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;
      
      content = content.replace(/className="([^"]*)"/g, (match, classStr) => {
        // Exclude UI containers (buttons, badges, cards) which have paddings or borders
        const excludeRegex = /\b(px-\d+|py-\d+|p-\d+|border|border-[a-z]+|rounded-[a-z0-9]+|rounded|bg-[a-z]+-\d+|uppercase)\b/;
        if (excludeRegex.test(classStr)) {
          return match;
        }
        
        // Target sub-titles that are exactly text-sm font-semibold/medium/bold with slate colors
        if (/\btext-sm\b/.test(classStr) && /\bfont-(semibold|medium|bold)\b/.test(classStr) && /\btext-slate-[789]5?0\b/.test(classStr)) {
          let newClassStr = classStr.replace(/\btext-sm\b/, 'text-base');
          newClassStr = newClassStr.replace(/\bfont-(semibold|medium|bold)\b/, 'font-bold');
          newClassStr = newClassStr.replace(/\btext-slate-[789]5?0\b/, 'text-slate-950');
          return `className="${newClassStr}"`;
        }
        return match;
      });

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated sub-titles in: ${filePath}`);
      }
    });
  });
}

updateSubtitles();
