'use strict';
const {randomBytes}=require('node:crypto');
const COOKIE='as_session';
function createSessionStore(ttl=8*60*60*1000,clock=Date.now){
 const sessions=new Map();
 const token=req=>(req.headers?.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 return {
  issue(req,res,userId){
   sessions.delete(token(req));
   for(const [key,value] of sessions)if(value.expires<=clock())sessions.delete(key);
   const key=randomBytes(32).toString('hex');sessions.set(key,{userId,expires:clock()+ttl});
   res.cookie(COOKIE,key,{httpOnly:true,sameSite:'strict',secure:!!req.secure,path:'/',maxAge:ttl});
  },
  userId(req){const key=token(req),session=sessions.get(key);if(!session)return null;if(session.expires<=clock()){sessions.delete(key);return null;}return session.userId;},
  revoke(req,res){sessions.delete(token(req));res.clearCookie(COOKIE,{httpOnly:true,sameSite:'strict',secure:!!req.secure,path:'/'});}
 };
}
module.exports={createSessionStore};
