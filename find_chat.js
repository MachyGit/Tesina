const fs = require('fs');
const path = require('path');
const dir = 'frontend-web/public/dashboard';
for (const f of fs.readdirSync(dir)) {
  if (f.endsWith('.html')) {
    const s = fs.readFileSync(path.join(dir,f),'utf8');
    if (s.includes('chat.js')) console.log(f);
  }
}
