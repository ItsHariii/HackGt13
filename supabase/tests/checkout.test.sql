begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.plans(id,user_id,title) values('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Checkout');
insert into public.contracts(id,plan_id) values('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001');
insert into public.contract_versions(id,contract_id,plan_id,version,body,body_hash,status,autonomy,expires_at)
values('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',1,
 '{"economics":{"currency":"USD","maxTotalMinor":100},"merchants":[{"id":"greathub"}]}','sha256:'||repeat('a',64),'awaiting_signature','{}',now()+interval '10 minutes');
select lives_ok($$select public.srv_bind_approved_checkout('c0000000-0000-4000-8000-000000000001','cs_checkout','greathub','{"approval":true,"checkout":{}}','sha256:'||repeat('b',64))$$,'Approval snapshot binds before signing');
insert into public.contract_signatures(contract_version_id,credential_public_key,body_hash,challenge,authenticator_data,client_data_json,signature,verified_at)
values('c0000000-0000-4000-8000-000000000001','\x01','sha256:'||repeat('a',64),'challenge','\x01','\x01','\x01',now());
select internal.transition_contract('c0000000-0000-4000-8000-000000000001','signed');
select throws_ok($$select public.srv_bind_approved_checkout('c0000000-0000-4000-8000-000000000001','other','greathub','{"approval":true,"checkout":{}}','sha256:'||repeat('b',64))$$,'approval_already_signed','Approval cannot be rebound after signing');
insert into public.consent_diffs(id,contract_version_id,snapshot_id,classification,current_total_minor)
select 'd0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',id,'identical',100 from public.checkout_snapshots where acp_session_id='cs_checkout';
create temp table execution as select internal.begin_execution('c0000000-0000-4000-8000-000000000001','checkout-test-key','d0000000-0000-4000-8000-000000000001','simulated') id;
select internal.consume_execution_token((select id from execution));
create temp table event as select jsonb_build_object('event_id','event1','type','order_created','created_at',now(),'data',jsonb_build_object(
  'checkout_session_id','cs_checkout','order_id','order1','status','confirmed','total_minor',100,'currency','USD',
  'contract',jsonb_build_object('contract_id','b0000000-0000-4000-8000-000000000001','version',1,'body_hash','sha256:'||repeat('a',64)),
  'payment',jsonb_build_object('rail','simulated','transaction_id','sim_txn'))) payload;
select is(public.srv_receive_greathub_event((select payload from event)),'processed','Webhook completes in-flight payment');
select is((select count(*)::int from public.orders where merchant_order_id='order1'),1,'One order created');
select is(public.srv_receive_greathub_event((select payload from event)),'duplicate','Duplicate event is ignored');
select is((select count(*)::int from public.ledger_events where type='order.updated'),1,'Replay appends no duplicate ledger entry');
select is((select rail_ref from public.payment_executions where id=(select id from execution)),'sim_txn','Transaction reference recorded');
select throws_ok($$select public.srv_receive_greathub_event(jsonb_set(jsonb_set((select payload from event),'{event_id}','"bad-amount"'),'{data,total_minor}','101'))$$,'webhook_payment_mismatch','Wrong amount rejected atomically');
select is((select count(*)::int from public.webhook_events where event_id='bad-amount'),0,'Failed event can be retried; no partial dedupe record');
select is(public.srv_receive_greathub_event(jsonb_set(jsonb_set((select payload from event),'{event_id}','"shipped"'),'{data,status}','"shipped"')),'processed','Shipment applied');
select is(public.srv_receive_greathub_event(jsonb_set(jsonb_set(jsonb_set((select payload from event),'{event_id}','"late"'),'{data,status}','"created"'),'{created_at}',to_jsonb(now()-interval '1 hour'))),'processed','Late event retained');
select is((select status::text from public.orders where merchant_order_id='order1'),'shipped','Late event does not regress status');
insert into greathub.checkout_sessions(id,status,items) values('cs_grant1','ready_for_payment','[{"id":"PICA-1080","quantity":1}]'),('cs_grant2','ready_for_payment','[{"id":"PICA-1080","quantity":1}]');
select is(greathub.reserve_payment_grant('single-grant','cs_grant1'),true,'Grant reserved before dispatch');
select is(greathub.reserve_payment_grant('single-grant','cs_grant2'),false,'Grant cannot charge another checkout');
select greathub.claim_session('cs_grant1','key1');
update greathub.checkout_sessions set completing_at=now()-interval '1 hour' where id='cs_grant1';
select is(greathub.claim_session('cs_grant1','key2'),false,'Unresolved claims never age into a second charge');
select ok(not has_function_privilege('authenticated','public.srv_receive_greathub_event(jsonb)','execute'),'Clients cannot forge payment webhooks');
select ok(not has_function_privilege('authenticated','public.srv_record_checkout_proof(uuid,text,text,jsonb,text,jsonb,jsonb)','execute'),'Clients cannot mint consent diffs');
select * from finish();
rollback;
