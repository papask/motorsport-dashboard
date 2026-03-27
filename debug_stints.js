const https = require('https');
const fs = require('fs');
const path = require('path');

function getStints(sessionKey) {
  const url = `https://api.openf1.org/v1/stints?session_key=${sessionKey}`;
  https.get(url, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const stints = JSON.parse(rawData);
        const drivers = [63, 12, 1, 44, 16, 81, 10, 27, 2, 22];
        let output = '';
        for (const dn of drivers) {
           const dStints = stints.filter(s => s.driver_number === dn).sort((a,b) => a.stint_number - b.stint_number);
           output += `#${dn}: ${dStints.map(s => `Stint ${s.stint_number}(Lap ${s.lap_start}-${s.lap_end}, ${s.compound})`).join(' | ')}\n`;
        }
        const targetPath = path.join(process.cwd(), 'stint_debug_output.txt');
        fs.writeFileSync(targetPath, output);
        console.log(`Output written to ${targetPath}`);
      } catch (e) {
        console.error(e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
}

getStints(11245);
