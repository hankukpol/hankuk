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

function makeBolder() {
  ['components', 'app'].forEach(dir => {
    walkDir(path.join(__dirname, dir), function(filePath) {
      if (!filePath.endsWith('.tsx')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;
      
      // Make 3xl and above extrabold
      content = content.replace(/(text-(?:3xl|4xl|5xl|6xl))\s+font-(?:medium|semibold|bold)/g, '$1 font-extrabold');
      content = content.replace(/font-(?:medium|semibold|bold)\s+(text-(?:3xl|4xl|5xl|6xl))/g, 'font-extrabold $1');
      
      // Make lg, xl, 2xl bold
      content = content.replace(/(text-(?:lg|xl|2xl))\s+font-(?:medium|semibold)/g, '$1 font-bold');
      content = content.replace(/font-(?:medium|semibold)\s+(text-(?:lg|xl|2xl))/g, 'font-bold $1');
      
      // Make Base text titles bold (e.g. standard widget titles)
      // Be careful not to make ALL text-base bold, only when they were explicitly marked semibold or medium as titles
      // Actually let's just do text-base font-semibold -> font-bold
      content = content.replace(/(text-base)\s+font-(?:semibold)/g, '$1 font-bold');
      content = content.replace(/font-(?:semibold)\s+(text-base)/g, 'font-bold $1');

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Made titles bolder in: ${filePath}`);
      }
    });
  });
}

makeBolder();
