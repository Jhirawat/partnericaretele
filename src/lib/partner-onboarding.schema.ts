import { z } from 'zod';
export const applicationFormSchema=z.object({organizationName:z.string().trim().max(160),ownerName:z.string().trim().max(160),email:z.union([z.literal(''),z.string().trim().email().max(255)]),phone:z.string().trim().max(80),branchName:z.string().trim().max(160),address:z.string().trim().max(500),city:z.string().trim().max(120),countryCode:z.string().regex(/^[A-Z]{2}$/)}).strict();
export const applicationSchema=z.object({id:z.string().uuid(),owner_user_id:z.string().uuid(),organization_type:z.enum(['CLINIC','HEALTH_ESTABLISHMENT','MEDICAL_SERVICE']),form:applicationFormSchema.partial(),status:z.enum(['DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_DOCUMENTS','APPROVED','ACTIVE','REJECTED','SUSPENDED']),scope_partner_id:z.string().uuid().nullable(),partner_id:z.string().uuid().nullable(),reason:z.string().nullable(),reviewer:z.string().nullable(),reviewed_at:z.string().nullable(),updated_at:z.string()});
export const documentSchema=z.object({id:z.string().uuid(),application_id:z.string().uuid(),document_type:z.string(),primary_license:z.boolean(),object_path:z.string(),file_name:z.string(),issue_date:z.string(),expiry_date:z.string().nullable(),review_status:z.string(),reason:z.string().nullable(),reviewer:z.string().nullable(),reviewed_at:z.string().nullable()});
export const eventSchema=z.object({id:z.string(),application_id:z.string().uuid(),action:z.string(),from_state:z.string().nullable(),to_state:z.string().nullable(),reason:z.string().nullable(),actor_user_id:z.string(),created_at:z.string()});
export type Application=z.infer<typeof applicationSchema>;
export type ApplicationDocument=z.infer<typeof documentSchema>;
export type ApplicationForm=z.infer<typeof applicationFormSchema>;
export const emptyApplicationForm:ApplicationForm={organizationName:'',ownerName:'',email:'',phone:'',branchName:'',address:'',city:'',countryCode:'TH'};
export const applicationCommandSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('CREATE')}),
 z.object({op:z.literal('SAVE'),id:z.string().uuid(),args:z.object({organizationType:z.enum(['CLINIC','HEALTH_ESTABLISHMENT','MEDICAL_SERVICE']),form:applicationFormSchema})}),
 z.object({op:z.literal('DOCUMENT'),id:z.string().uuid(),args:z.object({documentType:z.string().trim().min(1).max(120),primaryLicense:z.boolean(),objectPath:z.string().regex(/^[a-f0-9-]+\/[a-f0-9-]+\.(pdf|png|jpg)$/),fileName:z.string().min(1).max(200),issueDate:z.iso.date(),expiryDate:z.iso.date().nullable()})}),
 z.object({op:z.literal('ASSIGN_SCOPE'),id:z.string().uuid(),args:z.object({scopePartnerId:z.string().uuid().nullable()})}),
 z.object({op:z.literal('REVIEW_DOCUMENT'),id:z.string().uuid(),args:z.object({documentId:z.string().uuid(),reviewStatus:z.enum(['ACCEPTED','NEED_MORE_INFO','REJECTED']),reason:z.string().trim().max(1000)})}),
 z.object({op:z.enum(['SUBMIT','REVIEW','REQUEST_DOCUMENTS','REJECT','APPROVE','ACTIVATE','SUSPEND']),id:z.string().uuid(),args:z.object({reason:z.string().trim().max(1000)}).optional()})
]);
export type ApplicationCommand=z.infer<typeof applicationCommandSchema>;
