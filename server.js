const http = require('http');
const https = require('https');

const RADIO_URL = 'http://62.149.195.154:8000/profcasa';
const PORT = process.env.PORT || 3000;

https.createServer = undefined; // non serve SSL qui, lo gestisce Render

const server = http.createServer((req, res) => {
  if (req.url !== '/stream') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  http.get(RADIO_URL, (radioRes) => {
    res.writeHead(200, {
      'Content-Type': radioRes.headers['content-type'] || 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    radioRes.pipe(res);
  }).on('error', (err) => {
    console.error('Errore stream:', err.message);
    res.writeHead(502);
    res.end('Stream non disponibile');
  });
});

server.listen(PORT, () => {
  console.log(`Proxy GUS79 in ascolto su porta ${PORT}`);
});
