// Google, Facebook ve Microsoft ile giriş (OAuth 2.0 yetkilendirme kodu akışı).
// Anahtarlar .env dosyasından okunur; hangi sağlayıcının tanımlı olduğu burada belirlenir.
const crypto = require('crypto');

const FACEBOOK_VERSION = 'v21.0';

const PROVIDERS = {
  google: {
    label: 'Google',
    envPrefix: 'GOOGLE',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    pkce: true,
    readProfile: data => ({
      id: data.sub,
      name: data.name,
      email: data.email_verified === false ? '' : data.email
    })
  },
  facebook: {
    label: 'Facebook',
    envPrefix: 'FACEBOOK',
    authorizeUrl: `https://www.facebook.com/${FACEBOOK_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${FACEBOOK_VERSION}/oauth/access_token`,
    profileUrl: `https://graph.facebook.com/${FACEBOOK_VERSION}/me?fields=id,name,email`,
    scope: 'email,public_profile',
    pkce: false,
    readProfile: data => ({ id: data.id, name: data.name, email: data.email })
  },
  microsoft: {
    label: 'Microsoft',
    envPrefix: 'MICROSOFT',
    // Kurumsal dizinlerde e-posta alanı doğrulanmadan değiştirilebildiği için yalnızca kişisel hesaplar kabul edilir.
    authorizeUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    profileUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile',
    pkce: true,
    readProfile: data => ({ id: data.sub, name: data.name, email: data.email })
  }
};

const credentials = key => {
  const { envPrefix } = PROVIDERS[key];
  return {
    clientId: process.env[`${envPrefix}_CLIENT_ID`],
    clientSecret: process.env[`${envPrefix}_CLIENT_SECRET`]
  };
};

const isKnown = key => Object.hasOwn(PROVIDERS, key);

function isConfigured(key) {
  const { clientId, clientSecret } = credentials(key);
  return Boolean(clientId && clientSecret);
}

// Canlıda yalnızca anahtarı tanımlı olanlar görünür; geliştirmede hepsi görünür, tıklanınca kurulum hatırlatılır.
function visibleProviders() {
  return Object.entries(PROVIDERS)
    .filter(([key]) => process.env.NODE_ENV !== 'production' || isConfigured(key))
    .map(([key, provider]) => ({ key, label: provider.label }));
}

const randomToken = () => crypto.randomBytes(32).toString('base64url');
const challengeFor = verifier => crypto.createHash('sha256').update(verifier).digest('base64url');

function buildAuthorizeUrl(key, { redirectUri, state, verifier }) {
  const provider = PROVIDERS[key];
  const params = new URLSearchParams({
    client_id: credentials(key).clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: provider.scope,
    state
  });
  if (provider.pkce) {
    params.set('code_challenge', challengeFor(verifier));
    params.set('code_challenge_method', 'S256');
  }
  return `${provider.authorizeUrl}?${params}`;
}

// Geçici kodu sağlayıcıda erişim anahtarına çevirir ve kullanıcı bilgisini okur.
async function fetchProfile(key, { code, redirectUri, verifier }) {
  const provider = PROVIDERS[key];
  const { clientId, clientSecret } = credentials(key);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret
  });
  if (provider.pkce) body.set('code_verifier', verifier);

  const tokenResponse = await fetch(provider.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(10000)
  });
  if (!tokenResponse.ok) throw new Error(`${provider.label} anahtar isteği ${tokenResponse.status} döndürdü`);
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) throw new Error(`${provider.label} erişim anahtarı vermedi`);

  const profileResponse = await fetch(provider.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!profileResponse.ok) throw new Error(`${provider.label} profil isteği ${profileResponse.status} döndürdü`);

  const profile = provider.readProfile(await profileResponse.json());
  if (!profile.id) throw new Error(`${provider.label} kullanıcı kimliği vermedi`);

  return {
    id: String(profile.id),
    name: String(profile.name || '').trim(),
    email: String(profile.email || '').trim().toLowerCase()
  };
}

const labelOf = key => PROVIDERS[key].label;

module.exports = { isKnown, isConfigured, visibleProviders, randomToken, buildAuthorizeUrl, fetchProfile, labelOf };
