import {test,expect} from 'bun:test';
import {blockedSignedIn,containsSensitive,readiness,routeCheck,PUBLIC_ROUTES,type ReleaseItem} from '../src/lib/release-readiness';
import {disabledOutboxWorker} from '../src/lib/notification-outbox.types';
const item=(effective:string|null):ReleaseItem=>({key:'k',category:'security',sensitive:true,owner_role:'SUPER_ADMIN',versions:1,latest:effective?{id:'i',version:1,status:'passed',effective:effective as never,evidence_reference:'EV',reason:'r',mine:false,correlation_id:'c',created_at:'',approval:null}:null});
test('signed-in checks are never passed without a test account',()=>{expect(blockedSignedIn(false).every(c=>c.status==='blocked')).toBe(true);expect(blockedSignedIn(true).some(c=>c.status==='passed')).toBe(false);});
test('blocked or unverified checks prevent readiness',()=>{expect(readiness([item('passed')],[{check:'a',status:'passed'}]).ready).toBe(true);expect(readiness([item('passed')],blockedSignedIn(false)).ready).toBe(false);expect(readiness([item('pending')],[]).ready).toBe(false);expect(readiness([item(null)],[]).open).toEqual(['k']);});
test('redaction detects emails, keys and tokens',()=>{expect(containsSensitive({a:'x@y.co'})).toBe(true);expect(containsSensitive('sb_secret_abc')).toBe(true);expect(containsSensitive({ok:'EVID-1'})).toBe(false);});
test('route smoke classification',()=>{expect(routeCheck('/',200).status).toBe('passed');expect(routeCheck('/',500).status).toBe('failed');expect(routeCheck('/',0).status).toBe('failed');expect(PUBLIC_ROUTES).toContain('/auth');});
test('external integrations stay disabled',()=>{expect(disabledOutboxWorker().enabled).toBe(false);});
