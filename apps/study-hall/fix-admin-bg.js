const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFiles(dir) {
  walkDir(path.join(__dirname, dir), function(filePath) {
    if (!filePath.endsWith('.tsx')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replace "border-slate-200 bg-slate-50" with "border-slate-200 bg-white"
    content = content.replace(/border-slate-200 bg-slate-50/g, 'border-slate-200 bg-white');
    
    // Replace "border border-slate-200 bg-slate-50" with bg-white
    content = content.replace(/border border-slate-200 bg-slate-50/g, 'border border-slate-200 bg-white');

    // Replace table row background that might be hardcoded
    content = content.replace(/thead className="bg-slate-50/g, 'thead className="bg-white');
    
    // Replace bg-slate-50 combined with padding commonly used on articles
    content = content.replace(/bg-slate-50(\s*p-[3456])/g, 'bg-white$1');
    content = content.replace(/bg-slate-50(\s*px-\d+\s*py-\d+)/g, 'bg-white$1');
    
    // For dashed borders (empty states), bg-slate-50 is fine, so we don't blanket replace bg-slate-50.
    // However, ensure bg-white handles focus states if the original input had focus:bg-white
    
    // Also remove translucent backgrounds (bg-slate-50/50 etc)
    content = content.replace(/bg-slate-\d+\/\d+/g, 'bg-white');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content);
      console.log('Fixed background in', filePath);
    }
  });
}

processFiles('components');
processFiles('app');
