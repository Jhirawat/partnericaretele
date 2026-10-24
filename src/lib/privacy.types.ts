export const privacyKinds=['access','export','correction','restriction','hold','release_hold','deletion','anonymization'] as const;
export const retentionKinds=['customer','request','screening','audit','notification','handoff','certificate'] as const;
export const privacyOps=['request','consent','verify','approve','reject','execute','package','policy_propose','policy_submit','policy_approve','policy_reject'] as const;
export type PrivacyOp=typeof privacyOps[number];
export interface PrivacyRow{id:string;patient_id:string;partner_id:string;location_id:string;kind:string;status:string;reason:string;proposed_correction:Record<string,string|null>;verification_method:string|null;created_at:string;verified_by:string|null;approved_by:string|null}
export interface PrivacyPolicy{id:string;partner_id:string;location_id:string|null;kind:string;version:number;days:number;effective_from:string;effective_to:string|null;status:string}
export interface PrivacyConsent{patient_id:string;purpose:string;state:string;policy_version:string;created_at:string;source:string}
export interface PrivacyData{rows:PrivacyRow[];customers:{id:string;partner_id:string;location_id:string;restricted:boolean;soft_deleted:boolean;anonymized:boolean;hold_type:string|null}[];policies:PrivacyPolicy[];consents:PrivacyConsent[];consent_history:PrivacyConsent[];events:{action:string;from_state:string|null;to_state:string;created_at:string;correlation_id:string}[];retention:{kind:string;id:string;policy_id:string|null;version:number|null;due_at:string|null;days_remaining:number|null;status:string}[]}
export interface PrivacyTotals{totals:{kind:string;status:string;count:number}[];policies:number;holds:number;withdrawals:number}
