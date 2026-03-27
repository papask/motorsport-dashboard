const https = require('https');

function getStints(sessionKey) {
  const url = `https://api.openf1.org/v1/stints?session_key=${sessionKey}`;
  https.get(url, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const stintsRaw = JSON.parse(rawData);
        const drivers = [63, 1, 81];
        for (const dn of drivers) {
           const dStints = stintsRaw.filter(s => s.driver_number === dn).sort((a,b) => a.stint_number - b.stint_number);
           console.log(`#${dn}:`, JSON.stringify(dStints.map(s => ({n: s.stint_number, s: s.lap_start, e: s.lap_end, c: s.compound}))));
        }
      } catch (e) {
        console.error(e.message);
      }
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
}

getStints(11245);
