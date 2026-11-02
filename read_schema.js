const fs = require('fs');
const s = fs.readFileSync('base de datos/schema.sql','utf8');
console.log(s.slice(0,300));
