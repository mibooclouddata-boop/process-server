(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.AsPermissions=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const keys=Object.freeze(['create','production','painting','delivery']);
  function can(actor,key){
    return keys.includes(key)&&!!actor&&typeof actor.id==='string'&&!!actor.id&&actor.active!==false&&!actor.passwordResetRequired&&
      ['sysadmin','admin','worker'].includes(actor.role)&&(actor.role==='sysadmin'||Array.isArray(actor.asPermissions)&&actor.asPermissions.includes(key));
  }
  function forStatus(status){
    if(['접수','검토 요청','승인 요청','처리 대기'].includes(status))return 'create';
    return ['production','painting','delivery'][['제작 요청','도장 요청','납품 요청'].indexOf(status)]||null;
  }
  return Object.freeze({keys,can,forStatus});
});
