import { createHmac, timingSafeEqual } from 'node:crypto';
function sign(value) { return createHmac('sha256', process.env.CALLBACK_SIGNING_SECRET).update(`demo-session:${value}`).digest('hex'); }
export function createDemoSession() {
  const data = Buffer.from(JSON.stringify({ role: 'merchant', expires: Date.now() + 86400000 })).toString('base64url');
  return `${data}.${sign(data)}`;
}
export function merchantSession(request) {
  const token = request.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('resaf_session='))?.slice(14);
  if (!token || !process.env.CALLBACK_SIGNING_SECRET) return false;
  const [data, signature] = token.split('.');
  if (!signature || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(data), 'hex'))) return false;
  try { const payload = JSON.parse(Buffer.from(data, 'base64url')); return payload.role === 'merchant' && payload.expires > Date.now(); }
  catch { return false; }
}
