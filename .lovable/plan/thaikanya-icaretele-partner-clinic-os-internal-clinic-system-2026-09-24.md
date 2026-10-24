# Thaikanya iCareTele Partner Clinic OS — internal clinic system (MCS optional)

The app will run fully on its own. The clinic system (MCS) connection becomes an optional add-on and no longer blocks anything. The work is split into phases so each one can be used and checked before the next starts.

## What changes for users

- **No waiting on MCS.** Consultations are created, run and closed inside iCareTele. The clinic system mode setting defaults to "Internal iCareTele Clinic System".
- **Doctors** sign in directly and get a queue, patient intake review, a consultation room, notes, prescription approve or reject, a PT.33 document with signature, follow-up plans and their own reports.
- **Patients** register, give consent, fill in intake, upload ID and documents, book and pay, join the video link, and see approved prescriptions, treatment plans, follow-ups and receipts.
- **Partner shops** register patients (including a QR intake link), book consultations, verify prescriptions by QR, record dispensing only when a valid prescription exists, manage products, batches, GACP/COA files and inventory, and see branch revenue and exports.
- **Admins** approve partners, doctors and product batches, review GACP/COA, block or recall products, and manage payments, exports, audit, LINE OA, email, the shop map and the system mode.

## Phases

1. **System mode + doctors + consent/intake.** Clinic system mode setting (Internal / MCS Connected / Hybrid). Doctor profiles with license number, license expiry, specialty, branch, fee, signature image and approval status. Patient consent and intake form. Consultations stop requiring MCS: they get an internal status flow (Waiting, Started, Completed, Cancelled, No Show) and assigned doctors.
2. **Telemedicine room + doctor dashboard.** Room page with patient sidebar, uploaded documents, notes (reusing the existing AI case summary), chat notes, a timer, and an external video link field (Google Meet, Zoom, LINE call, other). Doctor queue and reports.
3. **Prescriptions + PT.33.** Draft, approve (doctor only, active license required), then locked. Changes mean cancel and re-issue. Document number, QR code and a public verification page that shows status only. Printable PT.33.
4. **Partner shop compliance.** Products, batches, GACP/COA/license documents with expiry dates, inventory movements, and dispensing records. Blocking rules are enforced in the database. Unapproved partners see a locked dashboard.
5. **Patient dashboard + payments.** Uploads (private storage), booking, consultation fee payment (recorded manually for now), receipts, and a LINE OA support link.
6. **Import/export, notifications, MCS page.** CSV import (patients, doctors, appointments, prescriptions, consultations) and exports (all ledgers and reports). Notifications for the 10 events via info@thaikanya.com and LINE OA @577benvf, which send once the provider keys are added. The Integrations page is renamed "External Clinic System Integration" and shows the notice that MCS is optional.
7. **QA pass.** Browser checks for every role and blocking rule in all five languages, plus a written QA test-case list.

## Enforced rules (database level, not only in the UI)

- No prescription, no dispensing. Expired or already-used prescriptions are blocked.
- No doctor approval, no final PT.33. No active doctor license, no approval.
- No approved GACP/COA, product blocked. No approved partner, dashboard locked.
- No patient consent, consultation blocked.
- Partners cannot prescribe, approve, or edit doctor notes.
- Every sensitive action writes an audit log entry. Approved documents cannot be changed.

## Technical details

- Additive migrations only. Reuse existing records instead of creating duplicates: `patients` (customer), `partners` (partner shop), `locations` (branch), `consultations`, `consultation_notes` (medical note), `audit_log`, `notification_deliveries`, `payment_transactions` and ledger, `platform_settings` (system mode, LINE/email settings), and `bookings` (appointments).
- `DOCTOR` role already exists. Add a `doctors` table linked to the auth user.
- New tables: doctors, patient_consents, patient_intakes, patient_documents, prescriptions, pt33_documents, prescription_verifications, products, product_batches, compliance_documents (GACP/COA/LICENSE), inventory_movements, dispensing_records, invoices, report_exports.
- Blocking rules are implemented as triggers and SECURITY DEFINER functions (`approve_prescription`, `record_dispensing`). Approved prescriptions are immutable through a trigger.
- The MCS adapter stays as it is and only runs when the mode is MCS or Hybrid and credentials exist.
- Private storage buckets for ID and medical documents and for compliance files. Access is limited to the owner, the partner, and admins.
- Public route `/verify/$code` returns only the status and the document number.

## Needs your input later (not blocking)

- A Resend key (email) and a LINE Messaging API token, so notifications actually send.
- A Google Maps key for the shop map (Phase 6).
- Clinic legal name and address to print on the PT.33.

After approval, I start Phase 1 and continue through the phases in order.
