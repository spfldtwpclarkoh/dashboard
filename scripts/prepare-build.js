const fs = require('fs');
const path = require('path');

const outputDirectory = path.resolve(__dirname, '..', 'app');
fs.mkdirSync(outputDirectory, { recursive: true });
console.log(`Prepared ${outputDirectory}.`);
