'use strict';
const path=require('node:path');
const Sentry=require('@sentry/node');

// Allow only code locations: error messages can contain customer data or SQL values.
function sanitizeEvent(event){
  if(!event.exception?.values?.length)return null;
  return {
    event_id:event.event_id,timestamp:event.timestamp,platform:'node',level:'error',
    environment:process.env.SENTRY_ENVIRONMENT||'development',
    release:process.env.SENTRY_RELEASE||undefined,
    exception:{values:event.exception.values.map(error=>({
      type:['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','AggregateError'].includes(error.type)?error.type:'Error',
      value:'Server error (message removed for privacy)',
      stacktrace:{frames:(error.stacktrace?.frames||[]).map(frame=>{
        const relative=frame.filename?path.relative(__dirname,frame.filename):'';
        const local=relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&/\.[cm]?js$/.test(relative);
        return {filename:local?'app:///'+relative.replaceAll('\\','/'):'[external]',
          lineno:frame.lineno,colno:frame.colno};
      })}
    }))}
  };
}

if(process.env.SENTRY_DSN){
  Sentry.init({
    dsn:process.env.SENTRY_DSN,
    defaultIntegrations:false,
    integrations:[Sentry.onUncaughtExceptionIntegration(),Sentry.onUnhandledRejectionIntegration({mode:'strict'})],
    sendDefaultPii:false,enableLogs:false,sendClientReports:false,
    beforeSend:sanitizeEvent,
  });
}

function reportError(error){
  if(!process.env.SENTRY_DSN)return;
  const status=Number(error?.status||error?.statusCode||500);
  if(status>=400&&status<500)return;
  return Sentry.captureException(error);
}

module.exports={sanitizeEvent,reportError,flush:timeout=>Sentry.flush(timeout)};
