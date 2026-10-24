import {test,expect} from 'bun:test';
import {validateCertificateBytes,MAX_CERTIFICATE_BYTES} from '../src/lib/certificates.schema';
test('only PDF JPEG and PNG signatures are accepted',()=>{
 expect(()=>validateCertificateBytes(new Uint8Array([37,80,68,70,45]),'application/pdf',5)).not.toThrow();
 expect(()=>validateCertificateBytes(new Uint8Array([255,216,255]),'image/jpeg',3)).not.toThrow();
 expect(()=>validateCertificateBytes(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png',8)).not.toThrow();
 expect(()=>validateCertificateBytes(new Uint8Array([60,104,116,109,108]),'application/pdf',5)).toThrow('INVALID_FILE_TYPE');
 expect(()=>validateCertificateBytes(new Uint8Array([37,80,68,70,45]),'text/html',5)).toThrow('INVALID_FILE_TYPE');
});
test('file size cannot exceed five MiB, be empty or misreported',()=>{
 expect(MAX_CERTIFICATE_BYTES).toBe(5242880);
 expect(()=>validateCertificateBytes(new Uint8Array(), 'application/pdf',0)).toThrow('INVALID_FILE_SIZE');
 expect(()=>validateCertificateBytes(new Uint8Array(MAX_CERTIFICATE_BYTES+1),'application/pdf',MAX_CERTIFICATE_BYTES+1)).toThrow('INVALID_FILE_SIZE');
 expect(()=>validateCertificateBytes(new Uint8Array([37,80,68,70,45]),'application/pdf',4)).toThrow('INVALID_FILE_SIZE');
});