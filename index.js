const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('log.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  JSON.parse(line)
});
