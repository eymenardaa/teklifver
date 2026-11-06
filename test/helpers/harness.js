// Testler için geçici veritabanı, sahte SMTP sunucusu ve site süreci başlatır.
// Gerçek veritabanı ve .env kullanılmaz: site boş bir klasörde, yalnızca verilen ayarlarla çalışır.
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ROOT = path.join(__dirname, '..', '..');

const startMongo = () => MongoMemoryServer.create();

const baseEnv = () => ({
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  HOME: process.env.HOME,
  SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
  NODE_ENV: 'test'
});

// Sitenin açılmasını bekler; günlükleri server.logs içinde toplar.
async function startSite({ uri, port = 3101, env = {}, preload, cwd, entry }) {
  const workDir = cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'teklifver-test-'));
  const args = [...(preload ? ['-r', preload] : []), entry || path.join(ROOT, 'server.js')];
  const server = spawn(process.execPath, args, {
    cwd: workDir,
    env: { ...baseEnv(), MONGODB_URI: uri, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.logs = '';
  server.stdout.on('data', chunk => { server.logs += chunk; });
  server.stderr.on('data', chunk => { server.logs += chunk; });
  server.url = `http://127.0.0.1:${port}`;

  const exited = new Promise(resolve => server.once('exit', resolve));
  server.stop = async () => {
    server.kill();
    await exited;
    if (!cwd) fs.rmSync(workDir, { recursive: true, force: true });
  };

  for (let i = 0; i < 240; i += 1) {
    if (server.exitCode !== null) throw new Error(`Site kapandı:\n${server.logs}`);
    try {
      if ((await fetch(`${server.url}/healthz`)).ok) return server;
    } catch { /* henüz açılmadı */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  server.kill();
  throw new Error(`Site açılmadı:\n${server.logs}`);
}

// Gelen e-postaları toplayan küçük SMTP sunucusu. Gerçek SMTP akışını sınar, dışarı e-posta göndermez.
function startSmtpSink(port = 2526) {
  const mails = [];
  const server = net.createServer(socket => {
    let inData = false;
    let buffer = '';
    let current = null;
    socket.write('220 test SMTP\r\n');
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.raw = buffer.slice(0, end);
          mails.push(current);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write('250 OK\r\n');
          continue;
        }
        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const command = line.slice(0, 4).toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write('250 test\r\n');
        else if (command === 'MAIL') { current = { to: [], raw: '' }; socket.write('250 OK\r\n'); }
        else if (command === 'RCPT') { current.to.push((line.match(/<([^>]+)>/) || [])[1]); socket.write('250 OK\r\n'); }
        else if (command === 'DATA') { inData = true; socket.write('354 devam\r\n'); }
        else if (command === 'QUIT') { socket.write('221 kapanıyor\r\n'); socket.end(); }
        else socket.write('250 OK\r\n');
      }
    });
  });
  return new Promise(resolve => {
    server.listen(port, '127.0.0.1', () => {
      resolve({
        mails,
        stop: () => new Promise(done => server.close(done)),
        // E-posta gövdesini (quoted-printable veya base64) okunur metne çevirir.
        textOf: mail => {
          const quoted = mail.raw
            .replace(/=\r\n/g, '')
            .replace(/(=[0-9A-F]{2})+/g, match => Buffer.from(match.replace(/=/g, ''), 'hex').toString('utf8'));
          const decoded = [...mail.raw.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+\/=\r\n]+)/g)]
            .map(part => Buffer.from(part[1].replace(/\s/g, ''), 'base64').toString('utf8'));
          return [quoted, ...decoded].join('\n');
        },
        waitFor: async (predicate, timeout = 5000) => {
          const started = Date.now();
          while (Date.now() - started < timeout) {
            const found = mails.find(predicate);
            if (found) return found;
            await new Promise(r => setTimeout(r, 50));
          }
          return null;
        }
      });
    });
  });
}

// Çerezi hatırlayan basit tarayıcı
function client(base) {
  let cookie = '';
  const request = async (url, options = {}) => {
    const res = await fetch(url.startsWith('http') ? url : base + url, {
      redirect: 'manual',
      ...options,
      headers: { cookie, ...(options.headers || {}) }
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const buffer = Buffer.from(await res.arrayBuffer());
    return { status: res.status, location: res.headers.get('location') || '', headers: res.headers, setCookie: set || '', buffer, text: buffer.toString() };
  };
  const self = {
    get: url => request(url),
    post: (url, data = {}, headers = {}) =>
      request(url, {
        method: 'POST',
        body: new URLSearchParams(data).toString(),
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }
      }),
    form: (url, body) => request(url, { method: 'POST', body }),
    follow: async url => {
      let res = await request(url);
      while (res.status >= 300 && res.status < 400) res = await request(res.location);
      return res;
    }
  };
  return self;
}

function reporter() {
  let pass = 0;
  let fail = 0;
  return {
    check: (name, ok, extra = '') => {
      if (ok) pass += 1;
      else {
        fail += 1;
        console.log(`  HATA: ${name}${extra ? ` — ${extra}` : ''}`);
      }
    },
    finish: () => {
      console.log(`${pass} geçti, ${fail} hata`);
      process.exitCode = fail ? 1 : 0;
    }
  };
}

const MINI_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

module.exports = { ROOT, startMongo, startSite, startSmtpSink, client, reporter, MINI_PNG };
