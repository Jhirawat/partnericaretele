import { useI18n } from "@/i18n";

// Thai labels with English fallback, matching the onboarding copy convention.
const labels = {
  adminTitle: ["รับสมัครและมอบหมายแพทย์", "Doctor recruitment & assignment"],
  adminHint: ["ลงทะเบียนแพทย์ ตรวจสอบใบอนุญาต และมอบหมายให้องค์กร/สาขาภายในขอบเขตของคุณ", "Register doctors, verify licences and assign them to organizations/branches within your scope."],
  workspaceTitle: ["พื้นที่ทำงานแพทย์", "Doctor workspace"],
  register: ["ลงทะเบียนแพทย์", "Register doctor"],
  fullName: ["ชื่อแพทย์", "Doctor name"],
  license: ["เลขใบอนุญาต", "Licence number"],
  licenseExpiry: ["วันหมดอายุใบอนุญาต", "Licence expiry"],
  specialty: ["สาขาความเชี่ยวชาญ", "Specialty"],
  email: ["อีเมลเข้าสู่ระบบ", "Sign-in email"],
  phone: ["โทรศัพท์", "Phone"],
  homeBranch: ["สาขาหลัก", "Home branch"],
  none: ["ไม่ระบุ (ทั้งแพลตฟอร์ม)", "None (platform)"],
  save: ["บันทึก", "Save"],
  queue: ["คิวแพทย์", "Doctor queue"],
  pending: ["รอตรวจสอบ", "Pending"],
  active: ["ใช้งาน", "Active"],
  suspended: ["ระงับ", "Suspended"],
  all: ["ทั้งหมด", "All"],
  linked: ["เชื่อมบัญชีแล้ว", "Account linked"],
  notLinked: ["ยังไม่เชื่อมบัญชี", "Account not linked"],
  link: ["เชื่อมบัญชี", "Link account"],
  verify: ["ตรวจสอบและเปิดใช้งาน", "Verify & activate"],
  reinstate: ["เปิดใช้งานอีกครั้ง", "Reinstate"],
  suspend: ["ระงับ", "Suspend"],
  revoke: ["ยกเลิกสิทธิ์", "Revoke access"],
  reason: ["เหตุผล", "Reason"],
  assign: ["มอบหมาย", "Assign"],
  organization: ["องค์กร", "Organization"],
  branch: ["สาขา", "Branch"],
  anyBranch: ["ทุกสาขา", "All branches"],
  assignments: ["การมอบหมาย", "Assignments"],
  noDoctors: ["ยังไม่มีแพทย์ในขอบเขตของคุณ", "No doctors in your scope yet."],
  noAccess: ["เฉพาะผู้ดูแลระบบที่ได้รับสิทธิ์เท่านั้น", "Only authorized administrators can manage doctors."],
  notDoctor: ["บัญชีนี้ยังไม่ได้เชื่อมกับข้อมูลแพทย์ ผู้ดูแลระบบต้องลงทะเบียนและเชื่อมบัญชีให้ก่อน", "This account is not linked to a doctor record yet. An administrator must register and link it first."],
  statusPending: ["รอผู้ดูแลระบบตรวจสอบข้อมูลวิชาชีพ", "Waiting for an administrator to verify your professional details."],
  statusSuspended: ["บัญชีแพทย์ถูกระงับ ติดต่อผู้ดูแลระบบ", "Your doctor access is suspended. Contact an administrator."],
  statusActive: ["บัญชีแพทย์ใช้งานได้", "Your doctor access is active."],
  noAssignments: ["ยังไม่ได้รับมอบหมายให้องค์กรใด", "You have not been assigned to an organization yet."],
  availability: ["เวลาที่พร้อมให้บริการ", "Availability"],
  addSlot: ["เพิ่มช่วงเวลา", "Add time slot"],
  remove: ["ลบ", "Remove"],
  saved: ["บันทึกแล้ว", "Saved"],
  synthetic: ["ไม่มีการส่งอีเมลหรือการแจ้งเตือน ผู้ดูแลต้องแจ้งแพทย์เองให้สมัครด้วยอีเมลที่ลงทะเบียน", "No emails or notifications are sent. Ask the doctor to sign up with the registered email, then link the account."],
} as const;
export type DoctorLabel = keyof typeof labels;
export function useDoctorCopy() {
  const { locale } = useI18n();
  return (key: DoctorLabel) => labels[key][locale === "th" ? 0 : 1];
}
export const WEEKDAYS = [["อา.", "Sun"], ["จ.", "Mon"], ["อ.", "Tue"], ["พ.", "Wed"], ["พฤ.", "Thu"], ["ศ.", "Fri"], ["ส.", "Sat"]] as const;

const ERRORS: Record<string, [string, string]> = {
  MFA_REQUIRED: ["ต้องยืนยันตัวตนสองขั้นตอนก่อน", "Two-step verification is required first."],
  REVIEWER_REQUIRED: ["อยู่นอกขอบเขตสิทธิ์ของคุณ", "Outside your authorized scope."],
  LICENSE_ALREADY_REGISTERED: ["เลขใบอนุญาตนี้ลงทะเบียนแล้ว", "This licence number is already registered."],
  ACCOUNT_NOT_LINKED: ["ต้องเชื่อมบัญชีก่อนเปิดใช้งาน", "Link the doctor's account before activating."],
  ACCOUNT_NOT_FOUND: ["ยังไม่มีบัญชีที่ใช้อีเมลนี้", "No account exists with this email yet."],
  ACCOUNT_ALREADY_LINKED: ["บัญชีนี้เชื่อมกับแพทย์คนอื่นแล้ว", "That account is already linked to another doctor."],
  PROFESSIONAL_DETAILS_INCOMPLETE: ["ต้องมีสาขาความเชี่ยวชาญและใบอนุญาตที่ยังไม่หมดอายุ", "A specialty and an unexpired licence are required."],
  DOCTOR_NOT_ACTIVE: ["แพทย์ต้องอยู่ในสถานะใช้งาน", "The doctor must be active."],
  BRANCH_OUTSIDE_ORGANIZATION: ["สาขาไม่อยู่ในองค์กรนี้", "That branch does not belong to the organization."],
  ASSIGNMENT_REVOKED: ["การมอบหมายนี้ถูกยกเลิกถาวรแล้ว", "This assignment has been permanently revoked."],
  ASSIGNMENT_NOT_ACTIVE: ["การมอบหมายไม่ได้ใช้งานอยู่", "This assignment is not active."],
  REASON_REQUIRED: ["กรุณาระบุเหตุผล", "Please give a reason."],
  INVALID_AVAILABILITY: ["เวลาไม่ถูกต้อง", "Invalid time slot."],
  INVALID_TRANSITION: ["ไม่สามารถเปลี่ยนสถานะนี้ได้", "This status change is not allowed."],
};
export function doctorError(e: Error, locale: string) {
  const k = Object.keys(ERRORS).find((x) => e.message.includes(x));
  const m = k ? ERRORS[k] : undefined;
  return m ? m[locale === "th" ? 0 : 1] : locale === "th" ? "เกิดข้อผิดพลาด" : "Something went wrong.";
}
