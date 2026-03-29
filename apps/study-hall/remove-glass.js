const fs = require('fs');
const path = require('path');

const files = [
  'components/ui/SlideOver.tsx',
  'components/ui/Modal.tsx',
  'components/ui/ConfirmDialog.tsx',
];

files.forEach(relPath => {
  const file = path.join(__dirname, relPath);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove glassmorphism blur and use a solid dark overlay
  content = content.replace(/backdrop-blur-sm/g, '');
  content = content.replace(/bg-slate-950\/50/g, 'bg-slate-950/60');
  content = content.replace(/bg-slate-950\/45/g, 'bg-slate-950/60');
  
  // Replace sticky white/95 backdrop blur from SlideOver
  content = content.replace(/bg-white\/95\s+backdrop-blur/g, 'bg-white');

  fs.writeFileSync(file, content);
  console.log(`Processed ${relPath}`);
});
