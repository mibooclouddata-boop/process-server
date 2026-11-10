const {test}=require('node:test');
const assert=require('node:assert/strict');
// Never send real events even when a developer's shell has a production DSN.
delete process.env.SENTRY_DSN;
const {sanitizeEvent,reportError}=require('./sentry-monitoring');

test('only technical stack locations survive the outgoing privacy filter',()=>{
  const secret='CUSTOMER_PRIVATE_TOKEN';
  const event={event_id:'abc',timestamp:123,platform:'node',level:'error',
    request:{data:secret,headers:{authorization:secret}},user:{email:secret},
    breadcrumbs:[{message:secret}],extra:{secret},contexts:{secret},tags:{secret},message:secret,
    exception:{values:[{type:'Error',value:secret,stacktrace:{frames:[{
      filename:__filename,lineno:12,colno:3,function:secret,vars:{secret},pre_context:[secret]
    }]}}]}};
  const clean=sanitizeEvent(event);
  assert.equal(JSON.stringify(clean).includes(secret),false);
  assert.equal(clean.exception.values[0].stacktrace.frames[0].filename,'app:///sentry-monitoring.test.cjs');
  assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno,12);
});

test('expected 4xx errors are not reported and no DSN leaves reporting disabled',()=>{
  assert.equal(reportError(Object.assign(new Error('validation'),{status:400})),undefined);
  assert.equal(reportError(new Error('offline test')),undefined);
});

test('SDK transport receives a sanitized 500 error but not a validation failure',async()=>{
  const Sentry=require('@sentry/node');
  const previous=process.env.SENTRY_DSN;
  process.env.SENTRY_DSN='https://public@example.invalid/1';
  const envelopes=[];
  Sentry.init({dsn:process.env.SENTRY_DSN,defaultIntegrations:false,beforeSend:sanitizeEvent,
    transport:()=>({send:async envelope=>{envelopes.push(envelope);return {statusCode:200};},flush:async()=>true})});
  try{
    Sentry.setUser({email:'CUSTOMER_PRIVATE_TOKEN'});
    Sentry.setExtra('private','CUSTOMER_PRIVATE_TOKEN');
    reportError(Object.assign(new Error('validation'),{status:400}));
    reportError(new Error('CUSTOMER_PRIVATE_TOKEN'));
    assert.equal(await Sentry.flush(2000),true);
    assert.equal(envelopes.length,1);
    assert.equal(JSON.stringify(envelopes).includes('CUSTOMER_PRIVATE_TOKEN'),false);
    const event=envelopes[0][1][0][1];
    assert.ok(event.exception.values[0].stacktrace.frames.some(frame=>frame.filename==='app:///sentry-monitoring.test.cjs'));
  }finally{
    await Sentry.close(2000);
    if(previous===undefined)delete process.env.SENTRY_DSN;else process.env.SENTRY_DSN=previous;
  }
});
