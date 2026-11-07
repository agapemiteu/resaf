import { createHmac, timingSafeEqual } from 'node:crypto';
function sign(value) { return createHmac('sha256', process.env.CALLBACK_SIGNING_SECRET).update(`demo-session:${value}`).digest('hex'); }
export function createDemoSession({role='merchant',resourceId=null}={}) {
  const data = Buffer.from(JSON.stringify({ role, resourceId, expires: Date.now() + 86400000 })).toString('base64url');
  return `${data}.${sign(data)}`;
}
export function sessionData(request) {
  const token = request.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('resaf_session='))?.slice(14);
  if (!token || !process.env.CALLBACK_SIGNING_SECRET) return false;
  const [data, signature] = token.split('.');
  if (!signature || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(data), 'hex'))) return false;
  try { const payload = JSON.parse(Buffer.from(data, 'base64url')); return ['merchant','demo'].includes(payload.role) && payload.expires > Date.now() ? payload : null; }
  catch { return false; }
}
export function merchantSession(request){return sessionData(request)?.role==='merchant';}
export function publicDemoSession(request){const session=sessionData(request);return session?.role==='demo'?session:null;}
export function demoResourceAllowed(request,resourceId){return !publicDemoSession(request)||publicDemoSession(request).resourceId===resourceId;}
export function demoControlAllowed(request){
  const session=publicDemoSession(request);if(!session)return false;
  const path=new URL(request.url,'http://localhost').pathname;
  return (request.method==='GET'&&path==='/api/v1/merchant/activity')||
    (request.method==='POST'&&['/api/demo/rounds','/api/demo/failure-drill','/api/demo/legacy-comparison'].includes(path))||
    (request.method==='POST'&&session.resourceId&&path===`/api/v1/resources/${session.resourceId}/policy`);
}
