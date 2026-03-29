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
        // Exclude buttons or containers
        const excludeRegex = /\b(px-\d+|py-\d+|p-\d+|border|border-[a-z]+|rounded-[a-z0-9]+|rounded|bg-[a-z]+-\d+|uppercase|inline-flex|flex|grid)\b/;
        if (excludeRegex.test(classStr)) {
          return match;
        }
        
        // Target sub-titles that are exactly text-lg font-bold text-slate-950
        if (/\btext-lg\b/.test(classStr) && /\bfont-bold\b/.test(classStr) && /\btext-slate-950\b/.test(classStr)) {
          let newClassStr = classStr.replace(/\btext-lg\b/, 'text-xl');
          return `className="${newClassStr}"`;
        }
        return match;
      });

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated sub-titles to 20px in: ${filePath}`);
      }
    });
  });
}

updateSubtitles();
