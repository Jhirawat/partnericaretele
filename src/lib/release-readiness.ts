// Browser-safe release readiness types and pure report helpers.
export const releaseStatuses=['pending','passed','failed','waived','blocked'] as const;
export type ReleaseStatus=typeof releaseStatuses[number];
export type SmokeStatus='passed'|'failed'|'blocked'|'unverified';
export interface SmokeCheck{check:string;status:SmokeStatus;count?:number;note?:string}
export interface ReleaseItem{key:string;category:string;sensitive:boolean;owner_role:string;versions:number;latest:null|{id:string;version:number;status:ReleaseStatus;effective:ReleaseStatus;evidence_reference:string;reason:string;mine:boolean;correlation_id:string;created_at:string;approval:null|{decision:'approved'|'rejected';reason:string;correlation_id:string;created_at:string}}}
export interface ReleaseData{items:ReleaseItem[];banner:null|{active:boolean;message:string;created_at:string;correlation_id:string}}
export const PUBLIC_ROUTES=['/','/auth','/partner-apply','/care-demo','/preview','/preview/admin','/preview/superadmin','/preview/doctor','/preview/partner','/preview/mcs','/release-handoff'] as const;
/** Signed-in flows can only be proven with a real test account; never report them passed here. */
export const SIGNED_IN_CHECKS=['signed_in_partner_flow','signed_in_admin_review','signed_in_doctor_flow'] as const;
export function blockedSignedIn(hasTestAccount:boolean):SmokeCheck[]{return SIGNED_IN_CHECKS.map(check=>({check,status:hasTestAccount?'unverified':'blocked',note:hasTestAccount?'run_manually':'no_test_account'}));}
const SENSITIVE=/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN/;
export function containsSensitive(value:unknown){return SENSITIVE.test(JSON.stringify(value)??'');}
export function routeCheck(path:string,status:number):SmokeCheck{return {check:`route ${path}`,status:status>=200&&status<400?'passed':'failed',count:status};}
/** Ready only when every item is effectively passed/waived and no smoke check failed or remains blocked/unverified. */
export function readiness(items:ReleaseItem[],checks:SmokeCheck[]){
  const open=items.filter(i=>!i.latest||!['passed','waived'].includes(i.latest.effective)).map(i=>i.key);
  const failed=checks.filter(c=>c.status==='failed').map(c=>c.check);
  const blocked=checks.filter(c=>c.status==='blocked'||c.status==='unverified').map(c=>c.check);
  return {ready:open.length===0&&failed.length===0&&blocked.length===0,open,failed,blocked};
}
