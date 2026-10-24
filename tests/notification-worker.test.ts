import {test,expect} from 'bun:test';
import {disabledOutboxWorker} from '../src/lib/notification-outbox.types';
import {dispatchQueuedNotifications} from '../src/lib/notifications.server';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../src/integrations/supabase/types';
test('disabled worker deterministically does not send or process',()=>{for(let i=0;i<3;i++)expect(disabledOutboxWorker()).toEqual({enabled:false,processed:0,sent:0,reason:'provider_not_approved'});});
test('legacy dispatcher cannot access records or send externally',async()=>{
 const client=new Proxy({},{get(){throw new Error('Database must not be touched')}}) as SupabaseClient<Database>;
 expect(await dispatchQueuedNotifications(client)).toEqual({processed:0,sent:0,failed:0,skipped:0,disabled:true});
});
