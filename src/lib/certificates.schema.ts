import {z} from 'zod';
export const certificateCommandSchema=z.object({op:z.enum(['OPEN','REVIEW','REJECT','MANUAL_REVIEW','FORWARD']),id:z.string().uuid(),key:z.string().uuid(),reason:z.string().trim().min(3).max(1000),channel:z.enum(['PARTNER','CUSTOMER_MANUAL']).optional()}).strict();
export const certificateDownloadSchema=z.object({id:z.string().uuid(),key:z.string().uuid(),reason:z.string().trim().min(3).max(1000)}).strict();
export const MAX_CERTIFICATE_BYTES=5*1024*1024;
export function validateCertificateBytes(bytes:Uint8Array,mime:string,size:number){
 if(size!==bytes.length||size<1||size>MAX_CERTIFICATE_BYTES)throw new Error('INVALID_FILE_SIZE');
 const pdf=mime==='application/pdf'&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
 const png=mime==='image/png'&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpg=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!pdf&&!png&&!jpg)throw new Error('INVALID_FILE_TYPE');
}