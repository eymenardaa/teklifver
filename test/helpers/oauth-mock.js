// Sunucuya -r ile yüklenir: sağlayıcı isteklerini sahte yanıtlar. code değeri base64url JSON profildir.
const real = globalThis.fetch;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token') || u.includes('oauth/access_token') || u.includes('/oauth2/v2.0/token')) {
    const body = new URLSearchParams(options.body);
    const usesPkce = !u.includes('graph.facebook.com');
    if (usesPkce && !body.get('code_verifier')) return json({ error: 'pkce yok' }, 400);
    if (!body.get('client_secret')) return json({ error: 'secret yok' }, 400);
    if (body.get('code') === 'bozuk') return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: body.get('code') });
  }
  if (u.includes('openidconnect.googleapis.com') || u.includes('graph.facebook.com') || u.includes('graph.microsoft.com')) {
    const token = options.headers.Authorization.replace('Bearer ', '');
    return json(JSON.parse(Buffer.from(token, 'base64url').toString()));
  }
  return real(url, options);
};
