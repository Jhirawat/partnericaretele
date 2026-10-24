import {z} from 'zod';
const handoffStates=['ready_to_create','entering_mcs','case_created','links_ready','patient_link_sent','waiting_connection','connected','certificate_pending','certificate_uploaded','closed','blocked','manual_review'] as const;
export const mcsHandoffCommandSchema=z.object({op:z.enum(['CREATE','ADVANCE','CANCEL','ASSIGN']),id:z.string().uuid(),key:z.string().uuid(),reason:z.string().trim().min(3).max(1000),to:z.enum(handoffStates).optional(),mcsCaseId:z.string().trim().min(3).max(64).optional(),patientLink:z.string().trim().url().startsWith('https://').optional(),doctorLink:z.string().trim().url().startsWith('https://').optional(),operatorId:z.string().uuid().optional()}).strict();
export type McsHandoffIntent=z.infer<typeof mcsHandoffCommandSchema>;
