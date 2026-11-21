const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
const STRIP = ['x-frame-options','content-security-policy','content-security-policy-report-only'];
const SKIP = /^(data:|blob:|about:|javascript:|#)/i;

export async function handler(req, res) {
  const target = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('url') || '');
  if (!/^https?:\/\//i.test(target)) { res.statusCode = 400; return res.end('bad url'); }

  let up;
  try {
    up = await fetch(target, { headers: { 'user-agent': UA, 'accept-language': 'en-IN,en;q=0.9',
      referer: new URL(target).origin }, redirect: 'follow' });
  } catch { res.statusCode = 502; return res.end('upstream failed'); }

  const type = up.headers.get('content-type') || 'text/plain';
  const buf = Buffer.from(await up.arrayBuffer());
  res.statusCode = up.status;
  res.setHeader('content-type', type);
  res.setHeader('access-control-allow-origin', '*');
  STRIP.forEach(h => res.setHeader(h, ''));

  if (!type.includes('text/html')) return res.end(buf);

  const base = new URL(target);
  const prox = q => `/p/?url=${encodeURIComponent(q)}`;
  let html = buf.toString('utf8');

  html = html.replace(/(src|href|action|poster)="(\/[^/][^"]*)"/g,
    (_, a, p) => `${a}="${prox(base.origin + p)}"`);
  html = html.replace(/srcset="([^"]+)"/g, (_, set) =>
    `srcset="${set.split(',').map(s => {
      const [u, d] = s.trim().split(/\s+/);
      return (SKIP.test(u) ? u : prox(new URL(u, base).href)) + (d ? ' ' + d : '');
    }).join(', ')}"`);
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base.origin}">`);

  res.end(html);
}