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

// 1. Fix Modal overlays
['components/ui/Modal.tsx', 'components/ui/ConfirmDialog.tsx', 'components/ui/SlideOver.tsx'].forEach(p => {
  let file = path.join(__dirname, p);
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace messed up overlays with the classic dark blur
    content = content.replace(/bg-white\s+"/g, 'bg-slate-900/40 backdrop-blur-sm"');
    content = content.replace(/bg-slate-950\/60/g, 'bg-slate-900/40 backdrop-blur-sm');
    
    fs.writeFileSync(file, content);
    console.log(`Restored overlay for ${p}`);
  }
});

// 2. Remove all pastel backgrounds from layout containers
walkDir(path.join(__dirname, 'components'), function(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  // Replace pastel tones with pure white to eliminate AI vibes
  content = content.replace(/bg-amber-[5]0/g, 'bg-white');
  content = content.replace(/bg-rose-50/g, 'bg-white');
  content = content.replace(/bg-sky-50/g, 'bg-white');
  content = content.replace(/bg-blue-50/g, 'bg-white');
  content = content.replace(/bg-emerald-50/g, 'bg-white');
  content = content.replace(/bg-orange-50/g, 'bg-white');
  content = content.replace(/bg-indigo-50/g, 'bg-white');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Stripped pastels from ${filePath}`);
  }
});

walkDir(path.join(__dirname, 'app'), function(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  content = content.replace(/bg-amber-[5]0/g, 'bg-white');
  content = content.replace(/bg-rose-50/g, 'bg-white');
  content = content.replace(/bg-sky-50/g, 'bg-white');
  content = content.replace(/bg-blue-50/g, 'bg-white');
  content = content.replace(/bg-emerald-50/g, 'bg-white');
  content = content.replace(/bg-orange-50/g, 'bg-white');
  content = content.replace(/bg-indigo-50/g, 'bg-white');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Stripped pastels from ${filePath}`);
  }
});
