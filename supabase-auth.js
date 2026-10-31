'use strict';
const {createClient} = require('@supabase/supabase-js');
const {randomBytes, randomUUID, createHash, createHmac, createCipheriv, createDecipheriv} = require('node:crypto');

const COOKIE = 'ps_session';
const fail = (status, message) => Object.assign(new Error(message), {status});
const unavailable = () => fail(503, '인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.');
const denied = () => fail(401, '아이디 또는 비밀번호를 확인하세요.');
const hash = token => createHash('sha256').update(token).digest('hex');
const ROLES = ['sysadmin', 'admin', 'worker'];

function configuration(env = process.env) {
  const {SUPABASE_URL:url, SUPABASE_PUBLISHABLE_KEY:publicKey, SUPABASE_SECRET_KEY:secretKey, SESSION_ENCRYPTION_KEY:key} = env;
  if (!url || !publicKey || !secretKey || !/^[a-f0-9]{64}$/i.test(key || ''))
    throw new Error('Supabase 서버 설정이 필요합니다. .env.example을 확인하세요.');
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local && env.NODE_ENV !== 'production')))
    throw new Error('Supabase URL은 HTTPS 또는 개발용 loopback 주소여야 합니다.');
  if (env.NODE_ENV === 'production' && env.SESSION_COOKIE_SECURE !== 'true')
    throw new Error('운영 Supabase 인증은 HTTPS와 SESSION_COOKIE_SECURE=true가 필요합니다.');
  return {url, publicKey, secretKey, key:Buffer.from(key, 'hex')};
}

function publicProfile(p) {
  // Explicit allowlist: no internal email, Auth metadata, password or service credentials.
  return {authProvider:'supabase', id:p.id, loginId:p.login_id, name:p.name, role:p.role, active:p.active,
    allowedSteps:p.allowed_steps || [],
    department:p.department || '', position:p.position || '', icon:p.icon || ''};
}

function createSupabaseBackend(config, {clientFactory = createClient, clock = Date.now} = {}) {
  const options = {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false},
    global:{fetch:(url, init = {}) => fetch(url, {...init, signal:AbortSignal.timeout(8000)})}};
  const admin = clientFactory(config.url, config.secretKey, options);
  const staffAdmin = require('./supabase-admin').createStaffAdmin(admin);
  const client = token => clientFactory(config.url, config.publicKey, {
    ...options, ...(token ? {global:{...options.global, headers:{Authorization:'Bearer '+token}}} : {})});
  const checked = result => {if (result.error) throw unavailable(); return result.data;};
  const seal = value => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', config.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  };
  const unseal = value => {
    const data = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', config.key, data.subarray(0,12));
    decipher.setAuthTag(data.subarray(12,28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  };
  async function profile(accessToken, authId) {
    const result = await client(accessToken).from('staff_profiles').select('*').eq('auth_user_id', authId).maybeSingle();
    if (result.error) throw unavailable();
    const p = result.data;
    return p?.active === true && ROLES.includes(p.role) ? p : null;
  }
  return {
    createUser: (actor, input) => staffAdmin.create(actor, input),
    updateUser: (actor, id, input) => staffAdmin.update(actor, id, input),
    async login(id, password, ip) {
      // Shared DB limiter survives process restarts and multiple server instances.
      for (const subject of ['ip:'+ip, 'login:'+id]) {
        const key = createHmac('sha256', config.key).update(subject).digest('hex');
        if (!checked(await admin.rpc('server_take_login_attempt', {input_key:key})))
          throw fail(429, '잠시 후 다시 시도하세요.');
      }
      const rows = checked(await admin.rpc('server_resolve_staff_login', {input_login:id}));
      const mapping = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      // Bind password verification to the epoch that existed before contacting Auth.
      const before = mapping ? checked(await admin.from('staff_profiles')
        .select('id,auth_user_id,active,role,session_version,admin_operation_id').eq('id', mapping.staff_id).maybeSingle()) : null;
      // Unknown accounts also use the password endpoint; no existence lookup response is exposed.
      const auth = await client().auth.signInWithPassword({email:mapping?.internal_email || randomUUID()+'@staff.invalid', password});
      if (auth.error) {
        if (!auth.error.status || auth.error.status >= 500) throw unavailable();
        throw denied();
      }
      const {user, session} = auth.data;
      if (!mapping || !before?.active || before.admin_operation_id || !ROLES.includes(before.role) ||
          before.auth_user_id !== mapping.auth_user_id || !session?.access_token || user?.id !== mapping.auth_user_id) throw denied();
      const p = await profile(session.access_token, user.id);
      if (!p || p.id !== mapping.staff_id || p.admin_operation_id || p.role !== before.role ||
          p.auth_user_id !== before.auth_user_id || p.session_version !== before.session_version) throw denied();
      const token = randomBytes(32).toString('hex');
      const expires = Math.min(Number(session.expires_at)*1000, clock()+8*60*60*1000);
      if (!Number.isFinite(expires) || expires <= clock()) throw denied();
      // The DB row lock serializes this final check/insert with account resets.
      if (!checked(await admin.rpc('server_create_staff_session', {input_staff:p.id, input_auth:before.auth_user_id,
        input_version:before.session_version, input_role:before.role, input_token_hash:hash(token),
        input_access_token:seal(session.access_token), input_expires:new Date(expires).toISOString()}))) throw denied();
      // Never return the upstream session or refresh token to a browser/mobile client.
      return {token, expires, user:publicProfile(p)};
    },
    async authenticate(token) {
      if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
      const session = checked(await admin.from('app_sessions').select('*').eq('token_hash', hash(token)).maybeSingle());
      if (!session || Date.parse(session.expires_at) <= clock()) return null;
      let accessToken;
      try {accessToken = unseal(session.encrypted_access_token);} catch {return null;}
      const auth = await client().auth.getUser(accessToken);
      if (auth.error) {if (!auth.error.status || auth.error.status >= 500) throw unavailable(); return null;}
      if (!auth.data.user) return null;
      const p = await profile(accessToken, auth.data.user.id);
      if (!p || p.id !== session.staff_id || p.session_version !== session.session_version) return null;
      return publicProfile(p);
    },
    async logout(token) {
      if (/^[a-f0-9]{64}$/.test(token || '')) checked(await admin.from('app_sessions').delete().eq('token_hash', hash(token)));
    },
    async listUsers() {
      const rows = checked(await admin.from('staff_profiles').select('id,login_id,name,role,active,allowed_steps,department,position,icon').order('name').limit(1000));
      return rows.map(publicProfile);
    },
    async downloadAttachment(token, id) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || !await this.authenticate(token)) return null;
      const session = checked(await admin.from('app_sessions').select('*').eq('token_hash',hash(token)).maybeSingle());
      if (!session) return null;
      // All Storage/metadata access uses the employee JWT and RLS, never the admin key.
      const scoped = client(unseal(session.encrypted_access_token));
      const record = checked(await scoped.from('as_attachments').select('id,storage_path,original_name').eq('id',id).maybeSingle());
      if (!record) return null;
      const result = await scoped.storage.from('as-attachments').download(record.storage_path);
      if (result.error) return null;
      return {name:record.original_name, blob:result.data};
    }
  };
}

function requestToken(req) {
  if (req.headers.authorization) return /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization)?.[1];
  const cookies = (req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(COOKIE+'='));
  return cookies.length === 1 ? cookies[0].slice(COOKIE.length+1) : undefined;
}
function createSupabaseAuth(backend, env = process.env) {
  const cookieOptions = req => ({httpOnly:true, sameSite:'strict', secure:env.SESSION_COOKIE_SECURE === 'true' || !!req.secure, path:'/'});
  const safeError = (res, error) => res.status([400,401,403,404,409,429,503].includes(error.status) ? error.status : 503)
    .json({error:[400,401,403,404,409,429].includes(error.status) ? error.message : unavailable().message});
  return {
    async login(req,res) {
      const {id, password} = req.body || {};
      if (typeof id !== 'string' || !id.trim() || id.length > 100 || typeof password !== 'string' || !password || password.length > 128)
        return res.status(400).json({error:'로그인 정보를 확인하세요.'});
      try {
        const result = await backend.login(id.trim(), password, req.ip);
        await backend.logout(requestToken(req)); // Rotate an existing session on successful login.
        const mobile = req.get('X-Client-Type') === 'mobile';
        if (!mobile) res.cookie(COOKIE, result.token, {...cookieOptions(req), maxAge:Math.max(0,result.expires-Date.now())});
        res.json({success:true, user:result.user, ...(mobile ? {token:result.token} : {})});
      } catch (error) {safeError(res,error);}
    },
    async resolve(req) {return backend.authenticate(requestToken(req));},
    async authenticate(req,res,next) {
      try {
        const user = await backend.authenticate(requestToken(req));
        if (!user) return res.status(401).json({error:'다시 로그인하세요.'});
        req.user = user; next();
      } catch (error) {safeError(res,error);}
    },
    async logout(req,res) {
      try {await backend.logout(requestToken(req)); res.clearCookie(COOKIE,cookieOptions(req)); res.json({success:true});}
      catch (error) {safeError(res,error);}
    },
    async users(req,res) {
      // SQL RPCs recheck the authenticated actor and serialize last-admin changes.
      if(req.user?.role!=='sysadmin')return res.status(403).json({error:'권한이 없습니다.'});
      const root=req.path==='/' || req.path==='';
      const id=/^\/([0-9a-f-]{36})\/?$/i.exec(req.path)?.[1];
      try {
        if(root&&['GET','HEAD'].includes(req.method))return res.json({users:await backend.listUsers()});
        if(root&&req.method==='POST')return res.json(await backend.createUser(req.user.id,req.body));
        if(id&&req.method==='PUT')return res.json(await backend.updateUser(req.user.id,id,req.body));
        if(id&&req.method==='DELETE')return res.json({...await backend.updateUser(req.user.id,id,{active:false}),deactivated:true});
        return res.status(404).json({error:'사용자 관리 경로를 확인하세요.'});
      } catch(error) {safeError(res,error);}
    },
    async attachment(req,res) {
      try {
        const file = await backend.downloadAttachment(requestToken(req),req.params.id);
        if (!file) return res.status(404).json({error:'첨부파일을 찾을 수 없습니다.'});
        res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",
          'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name)});
        res.send(Buffer.from(await file.blob.arrayBuffer()));
      } catch(error) {safeError(res,error);}
    }
  };
}
module.exports = {configuration, createSupabaseBackend, createSupabaseAuth, publicProfile, requestToken};
