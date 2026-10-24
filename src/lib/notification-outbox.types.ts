export const notificationEvents=['partner_application','document_request','doctor_change','consultation_request','mcs_handoff','certificate_status','credit_anomaly','sla_reminder'] as const;
export type NotificationEvent=typeof notificationEvents[number];
export type NotificationStatus='queued'|'suppressed'|'sent_placeholder'|'failed'|'manual_review';
export interface NotificationRow {id:string;event_type:NotificationEvent;template_version:number;payload:{state?:string;previous_state?:string};status:NotificationStatus;retry_count:number;created_at:string;read_at:string|null;next_retry_at:string|null;correlation_id:string;recipient_user_id:string;}
export interface NotificationData {rows:NotificationRow[];total:number;unread:number;preferences:{event_type:NotificationEvent;enabled:boolean}[];history:{id:string;notification_id:string;action:string;reason_code:string;created_at:string}[];worker:{enabled:false;processed:0;reason:string};}
/** Approval is deliberately not configurable in this phase. No network or state mutation. */
export function disabledOutboxWorker(){return {enabled:false as const,processed:0,sent:0,reason:'provider_not_approved' as const};}
