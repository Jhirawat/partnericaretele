import {z} from 'zod';
const text=z.string().trim().max(2000);
const flag=z.string().trim().min(1).max(200);
export const screeningSettingsSchema=z.object({redFlags:z.array(flag).max(100),exclusions:z.array(flag).max(100),serviceReasons:z.array(flag).min(1).max(100),jurisdictions:z.array(flag).min(1).max(100),minimumAge:z.number().int().min(0).max(120),consentVersion:z.string().trim().min(1).max(100)}).strict();
export const intakeEvidenceSchema=z.object({
 redFlags:z.array(flag).max(100),exclusions:z.array(flag).max(100),redFlagsReviewed:z.boolean(),exclusionsReviewed:z.boolean(),telemedicineSuitable:z.boolean(),
 identityVerified:z.boolean(),contactVerified:z.boolean(),age:z.number().int().min(0).max(120).nullable(),guardianVerified:z.boolean(),jurisdiction:flag.or(z.literal('')),
 telemedicineConsent:z.boolean(),privacyConsent:z.boolean(),consentVersion:z.string().max(100),consentEvidence:z.string().trim().max(1000),serviceReason:flag.or(z.literal('')),
 history:text,medicines:text,allergies:text,riskFlags:text,dataComplete:z.boolean(),communicationReady:z.boolean(),nextStepReady:z.boolean(),channel:z.enum(['PHONE','VIDEO','IN_PERSON']),
 doctorId:z.string().uuid().or(z.literal('')),gateReasons:z.array(z.string().trim().min(1).max(1000)).length(4),
}).strict();
export type ScreeningSettings=z.infer<typeof screeningSettingsSchema>;
export type IntakeEvidence=z.infer<typeof intakeEvidenceSchema>;
export const partnerIntakeSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('CUSTOMER_SAVE'),id:z.string().uuid().nullable(),partnerId:z.string().uuid(),locationId:z.string().uuid(),firstName:z.string().trim().min(1).max(100),lastName:z.string().trim().min(1).max(100),email:z.email().max(255).or(z.literal('')),phone:z.string().trim().max(40)}).strict(),
 z.object({op:z.literal('ASSESS'),id:z.string().uuid(),evidence:intakeEvidenceSchema,reason:z.string().trim().min(1).max(1000)}).strict(),
 z.object({op:z.literal('REQUEST'),id:z.string().uuid()}).strict(),
 z.object({op:z.literal('REJECT'),id:z.string().uuid(),reason:z.string().trim().min(1).max(1000)}).strict(),
 z.object({op:z.literal('CONFIGURE'),partnerId:z.string().uuid(),settings:screeningSettingsSchema,reason:z.string().trim().min(1).max(1000)}).strict(),
]);
export type PartnerIntakeIntent=z.infer<typeof partnerIntakeSchema>;