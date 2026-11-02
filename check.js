const fs = require('fs');
console.log(fs.readFileSync('frontend-web/public/dashboard/director.html','utf8').slice(0,100));
