'use strict';
const {randomBytes,createHash}=require('node:crypto');
const COOKIE='as_session';
const fingerprint=u=>createHash('sha256').update(JSON.stringify([u.passwordHash,u.role,u.allowedSteps,u.passwordResetRequired])).digest('hex');
function createSessionStore(ttl=8*60*60*1000,clock=Date.now){
 const sessions=new Map();
 const token=req=>req.headers?.authorization ? /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization)?.[1] : (req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const cookieOptions=req=>({httpOnly:true,sameSite:'strict',secure:process.env.SESSION_COOKIE_SECURE==='true'||!!req.secure,path:'/'});
 function get(req){const key=token(req),session=sessions.get(key);if(!session)return null;if(session.expires<=clock()){sessions.delete(key);return null;}return session;}
 return {
  issue(req,res,userId,user){
   sessions.delete(token(req));
   for(const [key,value] of sessions)if(value.expires<=clock())sessions.delete(key);
   if(sessions.size>=10000)sessions.delete(sessions.keys().next().value);
   const key=randomBytes(32).toString('hex');sessions.set(key,{userId,expires:clock()+ttl,fingerprint:user&&fingerprint(user)});
   if(req.headers?.['x-client-type']!=='mobile')res.cookie(COOKIE,key,{...cookieOptions(req),maxAge:ttl});
   return key;
  },
  userId(req){return get(req)?.userId||null;},
  matches(req,user){return get(req)?.fingerprint===fingerprint(user);},
  revokeUser(id){for(const [key,value] of sessions)if(value.userId===id)sessions.delete(key);},
  revoke(req,res){sessions.delete(token(req));res.clearCookie(COOKIE,cookieOptions(req));}
 };
}
module.exports={createSessionStore};
