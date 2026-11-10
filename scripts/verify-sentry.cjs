'use strict';
const monitoring=require('../sentry-monitoring');
(async()=>{
  if(!process.env.SENTRY_DSN)throw new Error('SENTRY_DSN is required');
  let status;
  const unsubscribe=require('@sentry/node').getClient().on('afterSendEvent',(_event,response)=>{status=response.statusCode;});
  const id=monitoring.reportError(new Error('Synthetic Sentry connectivity check'));
  if(!await monitoring.flush(10000))throw new Error('Sentry flush timed out');
  unsubscribe();
  if(status!==200)throw new Error('Sentry did not accept the event');
  console.log('Sentry accepted synthetic event (HTTP 200):',id);
  console.log('Confirm the event in Sentry Issues. No business data was used.');
})().catch(()=>{console.error('Sentry verification failed');process.exitCode=1;});
