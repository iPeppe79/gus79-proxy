const http = require('http');
const https = require('https');

const RADIO_URL = 'http://62.149.195.154:8000/profcasa';
const PORT = process.env.PORT || 3000;

function getClient(url) {
  return url.startsWith('https://') ? https : http;
}

const server = http.createServer((req, res) => {
  // Log minimale utile su Render
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  // Root: piccola pagina di servizio
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(
      'GUS79 Proxy attivo.\n' +
      'Endpoint stream: /stream\n' +
      'Healthcheck: /health\n'
    );
    return;
  }

  // Healthcheck per Render / debug
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK');
    return;
  }

  // Accettiamo solo GET o HEAD su /stream
  if (req.url !== '/stream' || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const client = getClient(RADIO_URL);

  const upstreamReq = client.get(RADIO_URL, (radioRes) => {
    // Se la sorgente risponde male, propaghiamo lo stato
    if (radioRes.statusCode && radioRes.statusCode >= 400) {
      res.writeHead(radioRes.statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(`Stream sorgente non disponibile (${radioRes.statusCode})`);
      radioRes.resume();
      return;
    }

    const headers = {
      'Content-Type': radioRes.headers['content-type'] || 'audio/mpeg',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'Accept-Ranges': 'none',
      'X-Content-Type-Options': 'nosniff',
    };

    res.writeHead(200, headers);

    // Per HEAD inviamo solo gli header
    if (req.method === 'HEAD') {
      res.end();
      radioRes.destroy();
      return;
    }

    // Pipe dello stream
    radioRes.pipe(res);

    // Se il client chiude, chiudiamo anche la connessione verso la radio
    req.on('close', () => {
      radioRes.destroy();
    });

    res.on('close', () => {
      radioRes.destroy();
    });

    radioRes.on('error', (err) => {
      console.error('Errore stream sorgente:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Errore durante la lettura dello stream');
    });
  });

  upstreamReq.on('error', (err) => {
    console.error('Errore connessione sorgente:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
    }
    res.end('Stream non disponibile');
  });

  // Timeout prudente lato upstream
  upstreamReq.setTimeout(15000, () => {
    console.error('Timeout connessione sorgente');
    upstreamReq.destroy(new Error('Timeout connessione sorgente'));
  });

  // Se il browser/client chiude presto, chiudiamo tutto
  req.on('aborted', () => {
    upstreamReq.destroy();
  });
});

server.listen(PORT, () => {
  console.log(`Proxy GUS79 in ascolto sulla porta ${PORT}`);
});
