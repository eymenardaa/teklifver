// Tüm testleri çalıştırır: npm test
// Her takım temiz veritabanı ve yeni bir site süreciyle başlar.
const { spawn } = require('child_process');
const path = require('path');
const { startMongo, startSite } = require('./helpers/harness');

// BASE adresine bağlanan takımlar
const siteSuites = ['e2e.js', 'upload.js', 'features.js', 'messages.js', 'content.js', 'new-features.js', 'fuzz.js', 'deals.js', 'seo.js', 'matching.js', 'extras.js'];
// Kendi sitesini kendisi başlatan takımlar
const selfContained = ['style.js', 'session.js', 'oauth.js', 'email.js', 'security.js', 'browser.js', 'production.js'];

const only = process.argv.slice(2);
const wanted = name => !only.length || only.some(item => name.includes(item));

// Site süreci bu süreçe günlük yazar; bekleme engellemeyen olmalı, yoksa dolan boru siteyi kilitler.
function runSuite(file, env = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, 'suites', file)], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    const timer = setTimeout(() => {
      text += '\nHATA: zaman aşımı';
      child.kill();
    }, 600000);
    child.on('exit', code => {
      clearTimeout(timer);
      const output = text.trim().split('\n');
      const problems = output.filter(line => /HATA|^FAIL|Error:|^\s+at /.test(line)).slice(0, 25);
      console.log(`${code === 0 ? 'GEÇTİ' : 'KALDI'}  ${file}  (${output[output.length - 1]})`);
      problems.forEach(line => {
        console.log(`   ${line}`);
        // GitHub Actions'ta hata özetinde görünsün
        if (process.env.GITHUB_ACTIONS && /HATA|^FAIL|Error:/.test(line)) console.log(`::error title=${file}::${line.trim().replace(/[\r\n]+/g, ' ')}`);
      });
      resolve(code === 0);
    });
  });
}

(async () => {
  let failed = 0;
  for (const file of siteSuites.filter(wanted)) {
    const mongo = await startMongo();
    const site = await startSite({ uri: mongo.getUri('suite'), env: { RATE_LIMIT_PER_MINUTE: '100000' } });
    if (!(await runSuite(file, { BASE: site.url, MONGO_URI: mongo.getUri('suite') }))) failed += 1;
    await site.stop();
    await mongo.stop();
  }
  for (const file of selfContained.filter(wanted)) {
    if (!(await runSuite(file))) failed += 1;
  }
  console.log(failed ? `\n${failed} takım kaldı.` : '\nTüm takımlar geçti.');
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
