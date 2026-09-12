import { createPublicKey, verify } from 'node:crypto';

export function makeAuthenticator(env = process.env) {
  const local = env.LOCAL_DEMO === 'true' && env.NODE_ENV !== 'production';
  const domain = env.AUTH0_DOMAIN || env.VITE_AUTH0_DOMAIN;
  const audience = env.AUTH0_AUDIENCE || env.VITE_AUTH0_AUDIENCE;
  let keys = [], expires = 0;
  return async (token, clientId, name) => {
    if (local) {
      if (typeof clientId !== 'string' || !/^[a-z0-9_-]{8,128}$/i.test(clientId)) throw Object.assign(Error('Invalid local client ID.'), { status: 401 });
      return { id: 'demo-' + clientId, name: String(name || 'Student').slice(0, 24) };
    }
    try {
      if (!domain || !audience || typeof token !== 'string' || token.length > 20000) throw Error();
      const parts = token.split('.'); if (parts.length !== 3) throw Error();
      const head = JSON.parse(Buffer.from(parts[0], 'base64url'));
      const body = JSON.parse(Buffer.from(parts[1], 'base64url'));
      if (head.alg !== 'RS256') throw Error();
      if (Date.now() > expires) { const r = await fetch(`https://${domain}/.well-known/jwks.json`, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw Error(); keys = (await r.json()).keys; expires = Date.now() + 300000; }
      const key = keys.find(k => k.kid === head.kid && k.kty === 'RSA');
      if (!key || !verify('RSA-SHA256', Buffer.from(parts[0]+'.'+parts[1]), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw Error();
      const now = Date.now()/1000;
      if (body.iss !== `https://${domain}/` || ![].concat(body.aud).includes(audience) || !Number.isFinite(body.exp) || body.exp <= now || (body.nbf && body.nbf > now) || typeof body.sub !== 'string') throw Error();
      return { id: body.sub, name: String(body.name || name || 'Student').slice(0, 24) };
    } catch { throw Object.assign(Error('Authentication failed. Sign in with an Auth0 API audience configured.'), { status: 401 }); }
  };
}
