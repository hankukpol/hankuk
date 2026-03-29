const fs = require('fs');
const path = require('path');

const files = [
  'components/ui/SlideOver.tsx',
  'components/ui/Modal.tsx',
  'components/layout/AdminShell.tsx',
  'components/layout/AdminSidebar.tsx',
  'components/dashboard/AdminDashboard.tsx',
  'components/settings/GeneralSettingsManager.tsx',
  'components/seats/SeatMap.tsx',
  'components/attendance/MobileCheckForm.tsx',
  'components/student-view/StudentPortalFrame.tsx',
  'components/student-view/StudentDashboard.tsx',
  'app/page.tsx',
  'app/super-admin/page.tsx'
];

files.forEach(relPath => {
  const file = path.join(__dirname, relPath);
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');
  
  // 1. Remove Tailwind radial/linear gradient classes
  content = content.replace(/bg-\[radial-gradient\([^\]]+\)\]/g, 'bg-slate-50');
  content = content.replace(/bg-\[linear-gradient\([^\]]+\)\]/g, 'bg-slate-50');
  
  // 2. Replace inline linear-gradient styles with solid background colors
  content = content.replace(/background:\s*`linear-gradient\([^`]+\)`/g, (match) => {
     if (match.includes('${division.color}')) return 'backgroundColor: `${division.color}`';
     if (match.includes('${data.division.color}')) return 'backgroundColor: `${data.division.color}`';
     if (match.includes('${divisionColor}')) return 'backgroundColor: `${divisionColor}`';
     if (match.includes('${form.color}')) return 'backgroundColor: `${form.color}`';
     if (match.includes('${bgColor.from}')) return 'backgroundColor: `${bgColor.from}`';
     return 'backgroundColor: "#0f172a"';
  });

  fs.writeFileSync(file, content);
  console.log(`Processed ${relPath}`);
});
