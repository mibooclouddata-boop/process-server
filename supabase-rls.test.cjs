'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
const {randomUUID} = require('node:crypto');

test('PostgreSQL schema, profile RLS, private mappings, session revocation and Storage policies',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  // Supabase-owned schemas are represented minimally; actual hosted integration remains unverified.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
  `);
  for(const file of ['202610260001_auth_foundation.sql','202610260002_private_attachments.sql','202610260003_staff_administration.sql','202611010004_shared_as_access.sql'])
    await db.exec(fs.readFileSync(path.join(__dirname,'supabase/migrations',file),'utf8'));
  const a=randomUUID(),b=randomUUID(),admin=randomUUID(),review=randomUUID(),inactive=randomUUID();
  const authIds=new Map(),profiles=[a,b,admin,review,inactive];
  for(const [i,id] of profiles.entries()){
    const authId=randomUUID();authIds.set(id,authId);
    await db.query('insert into auth.users values ($1)',[authId]);
    await db.query('insert into staff_profiles(id,auth_user_id,login_id,name,role,active,as_review) values ($1,$2,$3,$4,$5,$6,$7)',
      [id,authId,'staff'+i,'Same name',id===admin?'sysadmin':'worker',id!==inactive,id===review]);
    await db.query('insert into private.staff_login_identifiers values ($1,$2)',[id,randomUUID()+'@staff.invalid']);
  }
  const parent=randomUUID(),attachment=randomUUID(),storagePath=parent+'/'+attachment;
  await db.query('insert into as_records(id,created_by_id) values ($1,$2)',[parent,a]);
  await db.query('insert into as_attachments(id,as_id,uploaded_by_id,storage_path,original_name,size_bytes) values ($1,$2,$3,$4,$5,$6)',
    [attachment,parent,a,storagePath,'fixture.txt',12]);
  const asUser=async(id,fn)=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id?authIds.get(id):'']);
    await db.exec('set role '+(id?'authenticated':'anon'));
    try{return await fn();}finally{await db.exec('reset role');}
  };
  await t.test('only self profile can be read; nobody can elevate their own role or read mappings/sessions',async()=>{
    await asUser(a,async()=>{
      const rows=(await db.query('select * from staff_profiles')).rows;assert.equal(rows.length,1);assert.equal(rows[0].id,a);
      await assert.rejects(db.exec("update staff_profiles set role='sysadmin'"));
      await assert.rejects(db.exec('select * from private.staff_login_identifiers'));
      await assert.rejects(db.exec("select * from server_resolve_staff_login('staff0')"));
      await assert.rejects(db.exec('select * from app_sessions'));
      await assert.rejects(db.exec("select server_take_login_attempt(repeat('a',64))"));
    });
    await asUser(null,async()=>{await assert.rejects(db.exec('select * from staff_profiles'));});
    await asUser(inactive,async()=>{assert.equal((await db.query('select * from staff_profiles')).rows.length,0);});
    await db.exec('set role service_role');
    try {assert.equal((await db.query("select * from server_resolve_staff_login('staff0')")).rows[0].staff_id,a);}
    finally{await db.exec('reset role');}
  });
  await t.test('immutable UUID, constrained roles and permission changes invalidate sessions',async()=>{
    await assert.rejects(db.query('update staff_profiles set id=$1 where id=$2',[randomUUID(),a]));
    await assert.rejects(db.query("update staff_profiles set role='owner' where id=$1",[a]));
    await assert.rejects(db.query("update staff_profiles set allowed_steps=array['unknown'] where id=$1",[a]));
    await db.query("update staff_profiles set allowed_steps=array['incoming'] where id=$1",[a]);
    assert.equal((await db.query('select session_version from staff_profiles where id=$1',[a])).rows[0].session_version,2);
    await assert.rejects(db.query('update staff_profiles set session_version=1 where id=$1',[a]));
  });
  await t.test('bucket stays private; all active staff can upload/delete linked attachments only',async()=>{
    assert.equal((await db.query("select public from storage.buckets where id='as-attachments'")).rows[0].public,false);
    await asUser(inactive,()=>assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('as-attachments',$1)",[storagePath])));
    await asUser(null,()=>assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('as-attachments',$1)",[storagePath])));
    for(const id of [a,b,admin,review])await asUser(id,async()=>{
      assert.equal((await db.query('select private.staff_can_manage_as($1) as allowed',[randomUUID()])).rows[0].allowed,false);
      await db.query("insert into storage.objects(bucket_id,name) values ('as-attachments',$1)",[storagePath]);
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1);
    });
    await asUser(a,async()=>{
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('as-attachments',$1)",[parent+'/'+randomUUID()]));
      await db.query("insert into storage.objects(bucket_id,name) values ('as-attachments',$1)",[storagePath]);
      assert.equal((await db.query("update storage.objects set name='tamper' returning id")).rows.length,0);
    });
    // Existing AS visibility is shared among active staff, including attachments.
    await asUser(inactive,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query('delete from storage.objects returning id')).rows.length,0);});
    await asUser(b,async()=>{
      assert.equal((await db.query('select * from storage.objects')).rows.length,1);
      assert.equal((await db.query('delete from storage.objects returning id')).rows.length,1);
    });
    await asUser(inactive,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);});
    await db.query('update staff_profiles set active=false where id=$1',[a]);
    await asUser(a,async()=>{assert.equal((await db.query('select * from storage.objects')).rows.length,0);});
  });
  await t.test('administrator RPCs protect last admin and atomically map, revoke and lock accounts',async()=>{
    const change=(actor,id,changes,reset=false)=>db.query('select server_staff_change($1,$2,$3,$4) as op',[actor,id,JSON.stringify(changes),reset]);
    await asUser(b,()=>assert.rejects(change(admin,b,{role:'sysadmin'})));
    await db.exec('set role service_role');
    try {
      await assert.rejects(change(b,b,{role:'sysadmin'}));
      await assert.rejects(change(admin,admin,{active:false}));
      await assert.rejects(change(admin,admin,{role:'worker'}));
      await assert.rejects(change(admin,admin,{},true));
      await assert.rejects(db.query('select server_staff_create(null,$1,$2,$3)',[authIds.get(b),'x@staff.invalid',JSON.stringify({id:'bootstrap',name:'Boot',role:'sysadmin'})]));
      const op=(await change(admin,b,{name:'Changed'},true)).rows[0].op;
      await assert.rejects(change(admin,b,{active:true}));
      await db.query('select server_staff_finish_reset($1,false)',[op.operation]);
    }finally{await db.exec('reset role');}
    assert.equal((await db.query('select active from staff_profiles where id=$1',[b])).rows[0].active,false);
    const newAuth=randomUUID();await db.query('insert into auth.users values ($1)',[newAuth]);
    await db.exec('set role service_role');
    let created;
    try {
      created=(await db.query('select server_staff_create($1,$2,$3,$4) as id',[admin,newAuth,randomUUID()+'@staff.invalid',JSON.stringify({id:'new-staff',name:'New',role:'worker'})])).rows[0].id;
      assert.equal((await db.query("select * from server_resolve_staff_login('new-staff')")).rows[0].staff_id,created);
      const op=(await change(admin,created,{},true)).rows[0].op;
      await db.query('select server_staff_finish_reset($1,true)',[op.operation]);
      await assert.rejects(db.query('select server_staff_finish_reset($1,true)',[op.operation]));
    }finally{await db.exec('reset role');}
    assert.equal((await db.query('select active from staff_profiles where id=$1',[created])).rows[0].active,true);
  });
  await t.test('database rate limit is bounded and rejects the twenty-first attempt',async()=>{
    await db.exec('set role service_role');
    try {for(let i=1;i<=21;i++)assert.equal((await db.query("select server_take_login_attempt(repeat('a',64)) as allowed")).rows[0].allowed,i<=20);}
    finally{await db.exec('reset role');}
  });
});
