export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_audit: {
        Row: {
          correlation_id: string
          created_at: string
          evidence_ref: string
          expected: string
          id: string
          item_key: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          required_scope: string
          reviewer_role: string
          sensitivity: string
          status: string
          version: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          evidence_ref: string
          expected: string
          id?: string
          item_key: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          required_scope: string
          reviewer_role: string
          sensitivity: string
          status: string
          version: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          evidence_ref?: string
          expected?: string
          id?: string
          item_key?: string
          lineage?: string
          next_action?: string
          owner_role?: string
          recorder?: string
          required_scope?: string
          reviewer_role?: string
          sensitivity?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      access_audit_confirmations: {
        Row: {
          audit_id: string
          correlation_id: string
          created_at: string
          id: string
          note: string
          outcome: string
          reviewer: string
        }
        Insert: {
          audit_id: string
          correlation_id?: string
          created_at?: string
          id?: string
          note: string
          outcome: string
          reviewer: string
        }
        Update: {
          audit_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          note?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_audit_confirmations_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "access_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          location_id: string | null
          metadata: Json
          partner_id: string | null
        }
        Insert: {
          action: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          location_id?: string | null
          metadata?: Json
          partner_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_evidence: {
        Row: {
          backup_date: string | null
          correlation_id: string
          created_at: string
          environment_label: string
          evidence_ref: string
          id: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          restore_result: string
          restore_test_date: string | null
          retention_days: number | null
          reviewer_role: string
          scope_label: string
          status: string
          version: number
        }
        Insert: {
          backup_date?: string | null
          correlation_id?: string
          created_at?: string
          environment_label: string
          evidence_ref: string
          id?: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          restore_result: string
          restore_test_date?: string | null
          retention_days?: number | null
          reviewer_role: string
          scope_label: string
          status: string
          version: number
        }
        Update: {
          backup_date?: string | null
          correlation_id?: string
          created_at?: string
          environment_label?: string
          evidence_ref?: string
          id?: string
          lineage?: string
          next_action?: string
          owner_role?: string
          recorder?: string
          restore_result?: string
          restore_test_date?: string | null
          retention_days?: number | null
          reviewer_role?: string
          scope_label?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      backup_evidence_confirmations: {
        Row: {
          correlation_id: string
          created_at: string
          evidence_id: string
          id: string
          note: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          evidence_id: string
          id?: string
          note: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          evidence_id?: string
          id?: string
          note?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_evidence_confirmations_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "backup_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          cancelled: boolean
          created_at: string
          ends_at: string
          id: string
          line_total: number
          quantity: number
          room_id: string | null
          service_id: string
          starts_at: string
          therapist_id: string | null
          unit_price: number
        }
        Insert: {
          booking_id: string
          cancelled?: boolean
          created_at?: string
          ends_at: string
          id?: string
          line_total?: number
          quantity?: number
          room_id?: string | null
          service_id: string
          starts_at: string
          therapist_id?: string | null
          unit_price?: number
        }
        Update: {
          booking_id?: string
          cancelled?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          line_total?: number
          quantity?: number
          room_id?: string | null
          service_id?: string
          starts_at?: string
          therapist_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_resources: {
        Row: {
          booking_item_id: string
          id: string
          quantity: number
          resource_id: string
        }
        Insert: {
          booking_item_id: string
          id?: string
          quantity?: number
          resource_id: string
        }
        Update: {
          booking_item_id?: string
          id?: string
          quantity?: number
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_resources_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_code: string
          cancellation_reason: string | null
          channel: Database["public"]["Enums"]["booking_channel"]
          consultation_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          ends_at: string
          id: string
          location_id: string
          notes: string | null
          paid_amount: number
          partner_id: string
          patient_id: string
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          booking_code: string
          cancellation_reason?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_at: string
          id?: string
          location_id: string
          notes?: string | null
          paid_amount?: number
          partner_id: string
          patient_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          booking_code?: string
          cancellation_reason?: string | null
          channel?: Database["public"]["Enums"]["booking_channel"]
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          paid_amount?: number
          partner_id?: string
          patient_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_result_confirmations: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          note: string
          outcome: string
          result_id: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          note: string
          outcome: string
          result_id: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          note?: string
          outcome?: string
          result_id?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_result_confirmations_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "campaign_results"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_results: {
        Row: {
          check_id: string
          correlation_id: string
          created_at: string
          evidence_ref: string
          expected: string
          id: string
          next_action: string
          owner_role: string
          prerequisite_state: string
          run_id: string
          scope: string
          simulated: boolean
          status: string
          suite: string
        }
        Insert: {
          check_id: string
          correlation_id?: string
          created_at?: string
          evidence_ref: string
          expected: string
          id?: string
          next_action: string
          owner_role: string
          prerequisite_state: string
          run_id: string
          scope: string
          simulated: boolean
          status: string
          suite: string
        }
        Update: {
          check_id?: string
          correlation_id?: string
          created_at?: string
          evidence_ref?: string
          expected?: string
          id?: string
          next_action?: string
          owner_role?: string
          prerequisite_state?: string
          run_id?: string
          scope?: string
          simulated?: boolean
          status?: string
          suite?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "campaign_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_runs: {
        Row: {
          campaign_version: string
          correlation_id: string
          created_at: string
          id: string
          label: string
          recorder: string
          run_no: number
          simulated: boolean
        }
        Insert: {
          campaign_version: string
          correlation_id?: string
          created_at?: string
          id?: string
          label: string
          recorder: string
          run_no?: never
          simulated: boolean
        }
        Update: {
          campaign_version?: string
          correlation_id?: string
          created_at?: string
          id?: string
          label?: string
          recorder?: string
          run_no?: never
          simulated?: boolean
        }
        Relationships: []
      }
      care_annual_usage: {
        Row: {
          action: string
          actor: string | null
          consultation_id: string
          created_at: string
          id: string
          membership_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          consultation_id: string
          created_at?: string
          id?: string
          membership_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          consultation_id?: string
          created_at?: string
          id?: string
          membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_annual_usage_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_annual_usage_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      care_appointment_documents: {
        Row: {
          appointment_id: string
          body: string
          created_at: string
          doctor_id: string
          id: string
          idempotency_key: string
          issued_at: string | null
          partner_id: string
          patient_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          body: string
          created_at?: string
          doctor_id: string
          id?: string
          idempotency_key: string
          issued_at?: string | null
          partner_id: string
          patient_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          body?: string
          created_at?: string
          doctor_id?: string
          id?: string
          idempotency_key?: string
          issued_at?: string | null
          partner_id?: string
          patient_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_appointment_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "care_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointment_documents_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointment_documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointment_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_appointments: {
        Row: {
          cancellation_reason: string | null
          clinical_state: string
          created_at: string
          created_by: string
          doctor_id: string | null
          document_state: string
          ends_at: string
          funding_state: string
          id: string
          idempotency_key: string
          partner_id: string
          patient_id: string
          payment_id: string | null
          payment_state: string
          service_version_id: string
          starts_at: string
          state: string
          updated_at: string
          video_room_name: string | null
          video_room_url: string | null
          video_state: string
        }
        Insert: {
          cancellation_reason?: string | null
          clinical_state?: string
          created_at?: string
          created_by: string
          doctor_id?: string | null
          document_state?: string
          ends_at: string
          funding_state?: string
          id?: string
          idempotency_key: string
          partner_id: string
          patient_id: string
          payment_id?: string | null
          payment_state?: string
          service_version_id: string
          starts_at: string
          state?: string
          updated_at?: string
          video_room_name?: string | null
          video_room_url?: string | null
          video_state?: string
        }
        Update: {
          cancellation_reason?: string | null
          clinical_state?: string
          created_at?: string
          created_by?: string
          doctor_id?: string | null
          document_state?: string
          ends_at?: string
          funding_state?: string
          id?: string
          idempotency_key?: string
          partner_id?: string
          patient_id?: string
          payment_id?: string | null
          payment_state?: string
          service_version_id?: string
          starts_at?: string
          state?: string
          updated_at?: string
          video_room_name?: string | null
          video_room_url?: string | null
          video_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_appointments_service_version_id_fkey"
            columns: ["service_version_id"]
            isOneToOne: false
            referencedRelation: "care_service_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          entity_id: string | null
          id: string
          partner_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          id?: string
          partner_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          id?: string
          partner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_audit_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      care_branch_permissions: {
        Row: {
          id: string
          location_id: string
          monthly_limit: number | null
          partner_id: string
          queue_allowed: boolean
          user_id: string
        }
        Insert: {
          id?: string
          location_id: string
          monthly_limit?: number | null
          partner_id: string
          queue_allowed?: boolean
          user_id: string
        }
        Update: {
          id?: string
          location_id?: string
          monthly_limit?: number | null
          partner_id?: string
          queue_allowed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_branch_permissions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_branch_permissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      care_certificate_events: {
        Row: {
          actor_user_id: string
          certificate_id: string
          correlation_id: string
          created_at: string
          from_state: string | null
          id: string
          operation: string
          reason: string
          revision_id: string | null
          to_state: string
        }
        Insert: {
          actor_user_id: string
          certificate_id: string
          correlation_id: string
          created_at?: string
          from_state?: string | null
          id?: string
          operation: string
          reason: string
          revision_id?: string | null
          to_state: string
        }
        Update: {
          actor_user_id?: string
          certificate_id?: string
          correlation_id?: string
          created_at?: string
          from_state?: string | null
          id?: string
          operation?: string
          reason?: string
          revision_id?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_certificate_events_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "care_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_certificate_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "care_certificate_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_certificate_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          result?: Json
        }
        Relationships: []
      }
      care_certificate_revisions: {
        Row: {
          certificate_id: string
          created_at: string
          id: string
          mime_type: string
          sha256: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          id: string
          mime_type: string
          sha256: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_certificate_revisions_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "care_certificates"
            referencedColumns: ["id"]
          },
        ]
      }
      care_certificates: {
        Row: {
          channel: string | null
          created_at: string
          current_revision_id: string | null
          id: string
          request_id: string
          state: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          request_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          request_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_certificates_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "consultation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_current_revision_fk"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "care_certificate_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_clinical_notes: {
        Row: {
          appointment_id: string
          assessment: string | null
          created_at: string
          doctor_id: string
          id: string
          idempotency_key: string
          objective: string | null
          partner_id: string
          patient_id: string
          plan: string | null
          status: string
          subjective: string | null
          updated_at: string
        }
        Insert: {
          appointment_id: string
          assessment?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          idempotency_key: string
          objective?: string | null
          partner_id: string
          patient_id: string
          plan?: string | null
          status?: string
          subjective?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          assessment?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          idempotency_key?: string
          objective?: string | null
          partner_id?: string
          patient_id?: string
          plan?: string | null
          status?: string
          subjective?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_clinical_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "care_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_clinical_notes_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_clinical_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_clinical_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_clinician_payables: {
        Row: {
          amount_minor: number
          approved_by: string
          consultation_id: string
          contract_reference: string
          created_at: string
          doctor_id: string
          id: string
        }
        Insert: {
          amount_minor: number
          approved_by: string
          consultation_id: string
          contract_reference: string
          created_at?: string
          doctor_id: string
          id?: string
        }
        Update: {
          amount_minor?: number
          approved_by?: string
          consultation_id?: string
          contract_reference?: string
          created_at?: string
          doctor_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_clinician_payables_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_clinician_payables_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      care_credit_lots: {
        Row: {
          expires_at: string
          granted: number
          id: string
          opening_reference: string | null
          partner_id: string
          payment_id: string | null
          purchased_at: string
          snapshot: Json
          used: number
          voided: number
        }
        Insert: {
          expires_at: string
          granted: number
          id?: string
          opening_reference?: string | null
          partner_id: string
          payment_id?: string | null
          purchased_at?: string
          snapshot: Json
          used?: number
          voided?: number
        }
        Update: {
          expires_at?: string
          granted?: number
          id?: string
          opening_reference?: string | null
          partner_id?: string
          payment_id?: string | null
          purchased_at?: string
          snapshot?: Json
          used?: number
          voided?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_credit_lots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_credit_lots_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      care_document_grants: {
        Row: {
          document_id: string
          expires_at: string
          granted_by: string
          user_id: string
        }
        Insert: {
          document_id: string
          expires_at: string
          granted_by: string
          user_id: string
        }
        Update: {
          document_id?: string
          expires_at?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_document_grants_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "care_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      care_documents: {
        Row: {
          consultation_id: string
          created_at: string
          document_date: string
          id: string
          kind: string
          object_path: string
          provider_reference: string
        }
        Insert: {
          consultation_id: string
          created_at?: string
          document_date: string
          id?: string
          kind: string
          object_path: string
          provider_reference: string
        }
        Update: {
          consultation_id?: string
          created_at?: string
          document_date?: string
          id?: string
          kind?: string
          object_path?: string
          provider_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_documents_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_escalations: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          proposed_partner_id: string | null
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          proposed_partner_id?: string | null
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          proposed_partner_id?: string | null
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_escalations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_escalations_proposed_partner_id_fkey"
            columns: ["proposed_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      care_followups: {
        Row: {
          appointment_id: string
          created_at: string
          doctor_id: string
          due_at: string
          id: string
          idempotency_key: string
          instructions: string
          partner_id: string
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          doctor_id: string
          due_at: string
          id?: string
          idempotency_key: string
          instructions: string
          partner_id: string
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          doctor_id?: string
          due_at?: string
          id?: string
          idempotency_key?: string
          instructions?: string
          partner_id?: string
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_followups_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "care_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_followups_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_followups_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_followups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_holds: {
        Row: {
          consultation_id: string
          created_at: string
          id: string
          lot_id: string | null
          membership_id: string | null
          partner_id: string
          payment_id: string | null
          resolved_at: string | null
          state: string
          terms_snapshot: Json
        }
        Insert: {
          consultation_id: string
          created_at?: string
          id?: string
          lot_id?: string | null
          membership_id?: string | null
          partner_id: string
          payment_id?: string | null
          resolved_at?: string | null
          state?: string
          terms_snapshot?: Json
        }
        Update: {
          consultation_id?: string
          created_at?: string
          id?: string
          lot_id?: string | null
          membership_id?: string | null
          partner_id?: string
          payment_id?: string | null
          resolved_at?: string | null
          state?: string
          terms_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "care_holds_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_holds_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "care_credit_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_holds_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_holds_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_holds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      care_mcs_handoff_events: {
        Row: {
          actor_user_id: string
          correlation_id: string
          created_at: string
          from_state: string | null
          handoff_id: string
          id: string
          reason: string
          to_state: string
        }
        Insert: {
          actor_user_id: string
          correlation_id: string
          created_at?: string
          from_state?: string | null
          handoff_id: string
          id?: string
          reason: string
          to_state: string
        }
        Update: {
          actor_user_id?: string
          correlation_id?: string
          created_at?: string
          from_state?: string | null
          handoff_id?: string
          id?: string
          reason?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_mcs_handoff_events_handoff_id_fkey"
            columns: ["handoff_id"]
            isOneToOne: false
            referencedRelation: "care_mcs_handoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      care_mcs_handoff_operations: {
        Row: {
          actor_user_id: string
          args: Json
          correlation_id: string
          created_at: string
          operation: string
          result: Json
          target_id: string
        }
        Insert: {
          actor_user_id: string
          args: Json
          correlation_id: string
          created_at?: string
          operation: string
          result: Json
          target_id: string
        }
        Update: {
          actor_user_id?: string
          args?: Json
          correlation_id?: string
          created_at?: string
          operation?: string
          result?: Json
          target_id?: string
        }
        Relationships: []
      }
      care_mcs_handoffs: {
        Row: {
          created_at: string
          created_by: string
          doctor_link: string | null
          id: string
          location_id: string
          mcs_case_id: string | null
          operator_user_id: string | null
          packet: Json
          partner_id: string
          patient_link: string | null
          request_id: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          doctor_link?: string | null
          id?: string
          location_id: string
          mcs_case_id?: string | null
          operator_user_id?: string | null
          packet?: Json
          partner_id: string
          patient_link?: string | null
          request_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          doctor_link?: string | null
          id?: string
          location_id?: string
          mcs_case_id?: string | null
          operator_user_id?: string | null
          packet?: Json
          partner_id?: string
          patient_link?: string | null
          request_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_mcs_handoffs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_mcs_handoffs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_mcs_handoffs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "consultation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      care_membership_periods: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          payment_id: string | null
          period_end: string
          period_start: string
          plan_version_id: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          payment_id?: string | null
          period_end: string
          period_start: string
          plan_version_id: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          payment_id?: string | null
          period_end?: string
          period_start?: string
          plan_version_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_membership_periods_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_membership_periods_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_membership_periods_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "care_plan_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      care_operations: {
        Row: {
          actor: string
          created_at: string
          key: string
          operation: string
          request: Json
          result: Json
        }
        Insert: {
          actor: string
          created_at?: string
          key: string
          operation: string
          request: Json
          result: Json
        }
        Update: {
          actor?: string
          created_at?: string
          key?: string
          operation?: string
          request?: Json
          result?: Json
        }
        Relationships: []
      }
      care_payment_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          payload_hash: string | null
          payment_id: string
          provider: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          payload_hash?: string | null
          payment_id: string
          provider: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          payload_hash?: string | null
          payment_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      care_payments: {
        Row: {
          amount_minor: number
          channel: string
          collector: string
          created_at: string
          created_by: string
          credit_order_id: string | null
          credits: number | null
          currency: string
          evidence_reference: string | null
          external_reference: string | null
          id: string
          kind: string
          membership_id: string | null
          paid_at: string | null
          partner_id: string | null
          patient_id: string | null
          provider: string
          provider_checkout_id: string | null
          provider_environment: string | null
          provider_environment_locked_at: string | null
          snapshot: Json
          status: string
          terms_id: string
          verified_by: string | null
        }
        Insert: {
          amount_minor: number
          channel: string
          collector: string
          created_at?: string
          created_by: string
          credit_order_id?: string | null
          credits?: number | null
          currency?: string
          evidence_reference?: string | null
          external_reference?: string | null
          id?: string
          kind: string
          membership_id?: string | null
          paid_at?: string | null
          partner_id?: string | null
          patient_id?: string | null
          provider?: string
          provider_checkout_id?: string | null
          provider_environment?: string | null
          provider_environment_locked_at?: string | null
          snapshot: Json
          status?: string
          terms_id: string
          verified_by?: string | null
        }
        Update: {
          amount_minor?: number
          channel?: string
          collector?: string
          created_at?: string
          created_by?: string
          credit_order_id?: string | null
          credits?: number | null
          currency?: string
          evidence_reference?: string | null
          external_reference?: string | null
          id?: string
          kind?: string
          membership_id?: string | null
          paid_at?: string | null
          partner_id?: string | null
          patient_id?: string | null
          provider?: string
          provider_checkout_id?: string | null
          provider_environment?: string | null
          provider_environment_locked_at?: string | null
          snapshot?: Json
          status?: string
          terms_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_payments_credit_order_id_fkey"
            columns: ["credit_order_id"]
            isOneToOne: false
            referencedRelation: "credit_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_payments_terms_id_fkey"
            columns: ["terms_id"]
            isOneToOne: false
            referencedRelation: "care_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      care_personal_holds: {
        Row: {
          amount_minor: number
          appointment_id: string
          created_at: string
          id: string
          lot_id: string
          quantity: number
          resolved_at: string | null
          state: string
        }
        Insert: {
          amount_minor?: number
          appointment_id: string
          created_at?: string
          id?: string
          lot_id: string
          quantity?: number
          resolved_at?: string | null
          state?: string
        }
        Update: {
          amount_minor?: number
          appointment_id?: string
          created_at?: string
          id?: string
          lot_id?: string
          quantity?: number
          resolved_at?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_personal_holds_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "care_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_holds_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "care_personal_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      care_personal_ledger: {
        Row: {
          actor: string
          amount_minor: number
          appointment_id: string | null
          balance_count_after: number | null
          balance_minor_after: number | null
          created_at: string
          id: string
          idempotency_key: string
          lot_id: string | null
          metadata: Json
          patient_id: string
          quantity: number
          reference: string | null
          type: string
        }
        Insert: {
          actor: string
          amount_minor?: number
          appointment_id?: string | null
          balance_count_after?: number | null
          balance_minor_after?: number | null
          created_at?: string
          id?: string
          idempotency_key: string
          lot_id?: string | null
          metadata?: Json
          patient_id: string
          quantity?: number
          reference?: string | null
          type: string
        }
        Update: {
          actor?: string
          amount_minor?: number
          appointment_id?: string | null
          balance_count_after?: number | null
          balance_minor_after?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string
          lot_id?: string | null
          metadata?: Json
          patient_id?: string
          quantity?: number
          reference?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_personal_ledger_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "care_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_ledger_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "care_personal_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_ledger_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_personal_lots: {
        Row: {
          currency: string
          doctor_id: string | null
          environment: string
          expires_at: string
          granted_count: number
          granted_minor: number
          id: string
          kind: string
          partner_id: string
          patient_id: string
          payment_id: string | null
          plan_version_id: string
          purchased_at: string
          service_id: string | null
          used_count: number
          used_minor: number
        }
        Insert: {
          currency?: string
          doctor_id?: string | null
          environment?: string
          expires_at: string
          granted_count?: number
          granted_minor?: number
          id?: string
          kind: string
          partner_id: string
          patient_id: string
          payment_id?: string | null
          plan_version_id: string
          purchased_at?: string
          service_id?: string | null
          used_count?: number
          used_minor?: number
        }
        Update: {
          currency?: string
          doctor_id?: string | null
          environment?: string
          expires_at?: string
          granted_count?: number
          granted_minor?: number
          id?: string
          kind?: string
          partner_id?: string
          patient_id?: string
          payment_id?: string | null
          plan_version_id?: string
          purchased_at?: string
          service_id?: string | null
          used_count?: number
          used_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_personal_lots_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_lots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_lots_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_lots_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_lots_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "care_plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_personal_lots_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plan_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_renew: boolean
          created_at: string
          currency: string
          duration_months: number
          id: string
          name: string
          name_th: string | null
          plan_code: string
          price_minor: number
          quota: number | null
          service_coverage: Json
          status: string
          unlimited: boolean
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_renew?: boolean
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          name: string
          name_th?: string | null
          plan_code: string
          price_minor: number
          quota?: number | null
          service_coverage?: Json
          status?: string
          unlimited?: boolean
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_renew?: boolean
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          name?: string
          name_th?: string | null
          plan_code?: string
          price_minor?: number
          quota?: number | null
          service_coverage?: Json
          status?: string
          unlimited?: boolean
          version?: number
        }
        Relationships: []
      }
      care_refunds: {
        Row: {
          actor: string
          amount_minor: number
          created_at: string
          id: string
          payment_id: string
          reason: string
          reference: string
        }
        Insert: {
          actor: string
          amount_minor: number
          created_at?: string
          id?: string
          payment_id: string
          reason: string
          reference: string
        }
        Update: {
          actor?: string
          amount_minor?: number
          created_at?: string
          id?: string
          payment_id?: string
          reason?: string
          reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      care_relationships: {
        Row: {
          created_at: string
          doctor_id: string
          granted_by: string
          id: string
          partner_id: string
          patient_id: string
          revoke_reason: string | null
          revoked_at: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          doctor_id: string
          granted_by: string
          id?: string
          partner_id: string
          patient_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string
          granted_by?: string
          id?: string
          partner_id?: string
          patient_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_relationships_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_relationships_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_relationships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reminders: {
        Row: {
          channel: string
          created_at: string
          created_by: string
          due_at: string
          id: string
          idempotency_key: string
          partner_id: string | null
          patient_id: string
          purpose: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by: string
          due_at: string
          id?: string
          idempotency_key: string
          partner_id?: string | null
          patient_id: string
          purpose: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          idempotency_key?: string
          partner_id?: string | null
          patient_id?: string
          purpose?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_reminders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reward_allocations: {
        Row: {
          entry_id: string
          points: number
          reservation_id: string
        }
        Insert: {
          entry_id: string
          points: number
          reservation_id: string
        }
        Update: {
          entry_id?: string
          points?: number
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_reward_allocations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "care_reward_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reward_allocations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "care_reward_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reward_entries: {
        Row: {
          actor: string
          created_at: string
          delta: number
          eligible_spend_minor: number | null
          event_key: string
          expires_at: string | null
          id: string
          partner_id: string
          payment_id: string | null
          reason: string
          rules_snapshot: Json
          source_entry_id: string | null
        }
        Insert: {
          actor: string
          created_at?: string
          delta: number
          eligible_spend_minor?: number | null
          event_key: string
          expires_at?: string | null
          id?: string
          partner_id: string
          payment_id?: string | null
          reason: string
          rules_snapshot?: Json
          source_entry_id?: string | null
        }
        Update: {
          actor?: string
          created_at?: string
          delta?: number
          eligible_spend_minor?: number | null
          event_key?: string
          expires_at?: string | null
          id?: string
          partner_id?: string
          payment_id?: string | null
          reason?: string
          rules_snapshot?: Json
          source_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "care_reward_entries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reward_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reward_entries_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "care_reward_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reward_reservations: {
        Row: {
          coupon_invalidated: boolean
          created_at: string
          discount_minor: number
          fulfilment_reference: string | null
          id: string
          partner_id: string
          points: number
          product_code: string
          rules_snapshot: Json
          state: string
        }
        Insert: {
          coupon_invalidated?: boolean
          created_at?: string
          discount_minor?: number
          fulfilment_reference?: string | null
          id?: string
          partner_id: string
          points: number
          product_code: string
          rules_snapshot?: Json
          state?: string
        }
        Update: {
          coupon_invalidated?: boolean
          created_at?: string
          discount_minor?: number
          fulfilment_reference?: string | null
          id?: string
          partner_id?: string
          points?: number
          product_code?: string
          rules_snapshot?: Json
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_reward_reservations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      care_service_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancellation_policy: Json
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          name_th: string | null
          partner_id: string
          price_minor: number
          scope: string | null
          service_id: string | null
          status: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_policy?: Json
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          name: string
          name_th?: string | null
          partner_id: string
          price_minor: number
          scope?: string | null
          service_id?: string | null
          status?: string
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancellation_policy?: Json
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          name_th?: string | null
          partner_id?: string
          price_minor?: number
          scope?: string | null
          service_id?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_service_versions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_service_versions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      care_terms: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          settings: Json
          version: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          settings: Json
          version: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          settings?: Json
          version?: string
        }
        Relationships: []
      }
      commission_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          effective_from: string
          id: string
          name: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          effective_from?: string
          id?: string
          name: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          effective_from?: string
          id?: string
          name?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_plans_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          basis: Database["public"]["Enums"]["commission_basis"]
          created_at: string
          fixed_amount: number
          id: string
          plan_id: string
          priority: number
          rate: number
          service_category:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_id: string | null
        }
        Insert: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          created_at?: string
          fixed_amount?: number
          id?: string
          plan_id: string
          priority?: number
          rate?: number
          service_category?:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_id?: string | null
        }
        Update: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          created_at?: string
          fixed_amount?: number
          id?: string
          plan_id?: string
          priority?: number
          rate?: number
          service_category?:
            | Database["public"]["Enums"]["service_category"]
            | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_snapshots: {
        Row: {
          base_amount: number
          basis: Database["public"]["Enums"]["commission_basis"]
          booking_item_id: string
          computed_amount: number
          created_at: string
          fixed_amount: number
          id: string
          plan_id: string | null
          rate: number
          rule_id: string | null
        }
        Insert: {
          base_amount?: number
          basis: Database["public"]["Enums"]["commission_basis"]
          booking_item_id: string
          computed_amount?: number
          created_at?: string
          fixed_amount?: number
          id?: string
          plan_id?: string | null
          rate?: number
          rule_id?: string | null
        }
        Update: {
          base_amount?: number
          basis?: Database["public"]["Enums"]["commission_basis"]
          booking_item_id?: string
          computed_amount?: number
          created_at?: string
          fixed_amount?: number
          id?: string
          plan_id?: string | null
          rate?: number
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_snapshots_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: true
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_snapshots_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_snapshots_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_notes: {
        Row: {
          author_user_id: string | null
          consultation_id: string
          created_at: string
          id: string
          model: string | null
          notes: string
          partner_id: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          author_user_id?: string | null
          consultation_id: string
          created_at?: string
          id?: string
          model?: string | null
          notes: string
          partner_id: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string | null
          consultation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          notes?: string
          partner_id?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_notes_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_request_events: {
        Row: {
          actor_user_id: string
          correlation_id: string
          created_at: string
          from_state: string | null
          id: string
          reason: string
          request_id: string
          to_state: string
        }
        Insert: {
          actor_user_id: string
          correlation_id: string
          created_at?: string
          from_state?: string | null
          id?: string
          reason: string
          request_id: string
          to_state: string
        }
        Update: {
          actor_user_id?: string
          correlation_id?: string
          created_at?: string
          from_state?: string | null
          id?: string
          reason?: string
          request_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "consultation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_request_operations: {
        Row: {
          actor_user_id: string
          args: Json
          correlation_id: string
          created_at: string
          operation: string
          result: Json
          target_id: string
        }
        Insert: {
          actor_user_id: string
          args: Json
          correlation_id: string
          created_at?: string
          operation: string
          result: Json
          target_id: string
        }
        Update: {
          actor_user_id?: string
          args?: Json
          correlation_id?: string
          created_at?: string
          operation?: string
          result?: Json
          target_id?: string
        }
        Relationships: []
      }
      consultation_requests: {
        Row: {
          consultation_id: string | null
          created_at: string
          created_by: string
          id: string
          intake_id: string
          location_id: string
          partner_id: string
          patient_id: string
          state: string
          updated_at: string
        }
        Insert: {
          consultation_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          intake_id: string
          location_id: string
          partner_id: string
          patient_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          consultation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          intake_id?: string
          location_id?: string
          partner_id?: string
          patient_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_requests_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: true
            referencedRelation: "partner_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          assigned_doctor_id: string | null
          cancellation_reason: string | null
          care_kind: string | null
          care_location_id: string | null
          care_membership_id: string | null
          care_model: boolean
          care_payment_id: string | null
          care_price_snapshot: Json | null
          completed_at: string | null
          consultation_id: string
          created_at: string
          credit_status: Database["public"]["Enums"]["credit_status"]
          credit_transaction_id: string | null
          doctor_id: string | null
          external_order_id: string | null
          external_video_link: string | null
          hn_snapshot: string | null
          id: string
          idempotency_key: string | null
          mcs_consultation_id: string | null
          mcs_last_event_at: string | null
          mcs_patient_id: string | null
          partner_id: string
          patient_id: string
          room_url: string | null
          scheduled_at: string | null
          source: Database["public"]["Enums"]["consultation_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["consultation_status"]
          system_mode: string
          updated_at: string
        }
        Insert: {
          assigned_doctor_id?: string | null
          cancellation_reason?: string | null
          care_kind?: string | null
          care_location_id?: string | null
          care_membership_id?: string | null
          care_model?: boolean
          care_payment_id?: string | null
          care_price_snapshot?: Json | null
          completed_at?: string | null
          consultation_id?: string
          created_at?: string
          credit_status?: Database["public"]["Enums"]["credit_status"]
          credit_transaction_id?: string | null
          doctor_id?: string | null
          external_order_id?: string | null
          external_video_link?: string | null
          hn_snapshot?: string | null
          id?: string
          idempotency_key?: string | null
          mcs_consultation_id?: string | null
          mcs_last_event_at?: string | null
          mcs_patient_id?: string | null
          partner_id: string
          patient_id: string
          room_url?: string | null
          scheduled_at?: string | null
          source?: Database["public"]["Enums"]["consultation_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["consultation_status"]
          system_mode?: string
          updated_at?: string
        }
        Update: {
          assigned_doctor_id?: string | null
          cancellation_reason?: string | null
          care_kind?: string | null
          care_location_id?: string | null
          care_membership_id?: string | null
          care_model?: boolean
          care_payment_id?: string | null
          care_price_snapshot?: Json | null
          completed_at?: string | null
          consultation_id?: string
          created_at?: string
          credit_status?: Database["public"]["Enums"]["credit_status"]
          credit_transaction_id?: string | null
          doctor_id?: string | null
          external_order_id?: string | null
          external_video_link?: string | null
          hn_snapshot?: string | null
          id?: string
          idempotency_key?: string | null
          mcs_consultation_id?: string | null
          mcs_last_event_at?: string | null
          mcs_patient_id?: string | null
          partner_id?: string
          patient_id?: string
          room_url?: string | null
          scheduled_at?: string | null
          source?: Database["public"]["Enums"]["consultation_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["consultation_status"]
          system_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_payment_fk"
            columns: ["care_payment_id"]
            isOneToOne: false
            referencedRelation: "care_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_care_location_id_fkey"
            columns: ["care_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_care_membership_id_fkey"
            columns: ["care_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_approval: {
        Row: {
          canonical_source: string
          category: string
          correlation_id: string
          created_at: string
          evidence_ref: string
          id: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date: string | null
          reviewer_role: string
          status: string
          surface: string
          version: number
        }
        Insert: {
          canonical_source: string
          category: string
          correlation_id?: string
          created_at?: string
          evidence_ref: string
          id?: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date?: string | null
          reviewer_role: string
          status: string
          surface: string
          version: number
        }
        Update: {
          canonical_source?: string
          category?: string
          correlation_id?: string
          created_at?: string
          evidence_ref?: string
          id?: string
          lineage?: string
          owner_role?: string
          recorder?: string
          required_action?: string
          review_date?: string | null
          reviewer_role?: string
          status?: string
          surface?: string
          version?: number
        }
        Relationships: []
      }
      content_approval_reviews: {
        Row: {
          approval_id: string
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          approval_id: string
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          reviewer: string
        }
        Update: {
          approval_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_approval_reviews_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "content_approval"
            referencedColumns: ["id"]
          },
        ]
      }
      content_review: {
        Row: {
          correlation_id: string
          created_at: string
          decision_reason: string
          evidence_ref: string
          id: string
          item_type: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          review_date: string | null
          reviewer_role: string
          route_scope: string
          scope_label: string
          status: string
          version: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          decision_reason: string
          evidence_ref: string
          id?: string
          item_type: string
          lineage: string
          next_action: string
          owner_role: string
          recorder: string
          review_date?: string | null
          reviewer_role: string
          route_scope: string
          scope_label: string
          status: string
          version: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          decision_reason?: string
          evidence_ref?: string
          id?: string
          item_type?: string
          lineage?: string
          next_action?: string
          owner_role?: string
          recorder?: string
          review_date?: string | null
          reviewer_role?: string
          route_scope?: string
          scope_label?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      content_review_acks: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          note: string
          outcome: string
          review_id: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          note: string
          outcome: string
          review_id: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          note?: string
          outcome?: string
          review_id?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_review_acks_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "content_review"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_orders: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credits: number
          currency: string
          id: string
          notes: string | null
          order_code: string
          package_code: string
          partner_id: string
          payment_method: string
          payment_reference: string | null
          status: Database["public"]["Enums"]["credit_order_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credits?: number
          currency?: string
          id?: string
          notes?: string | null
          order_code?: string
          package_code?: string
          partner_id: string
          payment_method?: string
          payment_reference?: string | null
          status?: Database["public"]["Enums"]["credit_order_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credits?: number
          currency?: string
          id?: string
          notes?: string | null
          order_code?: string
          package_code?: string
          partner_id?: string
          payment_method?: string
          payment_reference?: string | null
          status?: Database["public"]["Enums"]["credit_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          balance_after: number
          consultation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          metadata: Json
          partner_id: string
          quantity: number
          reference_id: string | null
          type: Database["public"]["Enums"]["credit_txn_type"]
        }
        Insert: {
          balance_after: number
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json
          partner_id: string
          quantity: number
          reference_id?: string | null
          type: Database["public"]["Enums"]["credit_txn_type"]
        }
        Update: {
          balance_after?: number
          consultation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json
          partner_id?: string
          quantity?: number
          reference_id?: string | null
          type?: Database["public"]["Enums"]["credit_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_signoffs: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          round: number
          signer: string
          signer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          round: number
          signer: string
          signer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          round?: number
          signer?: string
          signer_role?: string
        }
        Relationships: []
      }
      doctor_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          doctor_id: string
          id: string
          location_id: string | null
          partner_id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          doctor_id: string
          id?: string
          location_id?: string | null
          partner_id: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          doctor_id?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_assignments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_assignments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_availability: {
        Row: {
          assignment_id: string
          created_at: string
          doctor_id: string
          end_time: string
          id: string
          start_time: string
          weekday: number
        }
        Insert: {
          assignment_id: string
          created_at?: string
          doctor_id: string
          end_time: string
          id?: string
          start_time: string
          weekday: number
        }
        Update: {
          assignment_id?: string
          created_at?: string
          doctor_id?: string
          end_time?: string
          id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "doctor_availability_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "doctor_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_availability_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auth_user_id: string | null
          availability: string | null
          consultation_fee: number
          created_at: string
          email: string | null
          full_name: string
          id: string
          license_expires_on: string | null
          license_number: string
          location_id: string | null
          phone: string | null
          signature_url: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["doctor_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          availability?: string | null
          consultation_fee?: number
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          license_expires_on?: string | null
          license_number: string
          location_id?: string | null
          phone?: string | null
          signature_url?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["doctor_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auth_user_id?: string | null
          availability?: string | null
          consultation_fee?: number
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          license_expires_on?: string | null
          license_number?: string
          location_id?: string | null
          phone?: string | null
          signature_url?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["doctor_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_inspector_item: {
        Row: {
          blocker_reason: string | null
          correlation_id: string
          created_at: string
          evidence_ref: string
          expected_result: string
          id: string
          lineage: string
          next_action: string
          observed_status: string
          owner_role: string
          recorder: string
          register: string
          review_date: string | null
          reviewer_role: string
          rule: string
          version: number
        }
        Insert: {
          blocker_reason?: string | null
          correlation_id?: string
          created_at?: string
          evidence_ref: string
          expected_result: string
          id?: string
          lineage: string
          next_action: string
          observed_status: string
          owner_role: string
          recorder: string
          register: string
          review_date?: string | null
          reviewer_role: string
          rule: string
          version: number
        }
        Update: {
          blocker_reason?: string | null
          correlation_id?: string
          created_at?: string
          evidence_ref?: string
          expected_result?: string
          id?: string
          lineage?: string
          next_action?: string
          observed_status?: string
          owner_role?: string
          recorder?: string
          register?: string
          review_date?: string | null
          reviewer_role?: string
          rule?: string
          version?: number
        }
        Relationships: []
      }
      evidence_inspector_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_inspector_review_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evidence_inspector_item"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_adjustments: {
        Row: {
          created_at: string
          created_by: string
          evidence_reference: string
          id: string
          location_id: string | null
          partner_id: string
          quantity: number
          reason: string
          reversal_of: string | null
          source: string
          source_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          evidence_reference: string
          id?: string
          location_id?: string | null
          partner_id: string
          quantity: number
          reason: string
          reversal_of?: string | null
          source: string
          source_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evidence_reference?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          quantity?: number
          reason?: string
          reversal_of?: string | null
          source?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_adjustments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_adjustments_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: true
            referencedRelation: "fin_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_compensating_entries: {
        Row: {
          actor: string
          adjustment_id: string
          approver: string
          correlation_id: string
          created_at: string
          id: string
          location_id: string | null
          partner_id: string
          quantity: number
          source: string
          source_id: string
        }
        Insert: {
          actor: string
          adjustment_id: string
          approver: string
          correlation_id: string
          created_at?: string
          id?: string
          location_id?: string | null
          partner_id: string
          quantity: number
          source: string
          source_id: string
        }
        Update: {
          actor?: string
          adjustment_id?: string
          approver?: string
          correlation_id?: string
          created_at?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          quantity?: number
          source?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_compensating_entries_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: true
            referencedRelation: "fin_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_control_events: {
        Row: {
          action: string
          actor: string
          adjustment_id: string | null
          correlation_id: string
          created_at: string
          evidence_reference: string
          id: string
          location_id: string | null
          partner_id: string
          reason: string
          snapshot_id: string | null
          verification_method: string | null
        }
        Insert: {
          action: string
          actor: string
          adjustment_id?: string | null
          correlation_id: string
          created_at?: string
          evidence_reference: string
          id?: string
          location_id?: string | null
          partner_id: string
          reason: string
          snapshot_id?: string | null
          verification_method?: string | null
        }
        Update: {
          action?: string
          actor?: string
          adjustment_id?: string | null
          correlation_id?: string
          created_at?: string
          evidence_reference?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          reason?: string
          snapshot_id?: string | null
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_control_events_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "fin_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_control_events_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "fin_reconciliation_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_control_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          location_id: string | null
          partner_id: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          location_id?: string | null
          partner_id: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          location_id?: string | null
          partner_id?: string
          result?: Json
        }
        Relationships: []
      }
      fin_reconciliation_snapshots: {
        Row: {
          actor: string
          created_at: string
          fingerprint: string
          id: string
          location_id: string | null
          partner_id: string
          period_from: string
          period_to: string
          report: Json
        }
        Insert: {
          actor: string
          created_at?: string
          fingerprint: string
          id?: string
          location_id?: string | null
          partner_id: string
          period_from: string
          period_to: string
          report: Json
        }
        Update: {
          actor?: string
          created_at?: string
          fingerprint?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          period_from?: string
          period_to?: string
          report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fin_reconciliation_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_reconciliation_snapshots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      human_packet_decision: {
        Row: {
          correlation_id: string
          created_at: string
          decision: string
          id: string
          packet_version: number
          reason: string
          reviewer: string
          reviewer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          decision: string
          id?: string
          packet_version: number
          reason: string
          reviewer: string
          reviewer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          decision?: string
          id?: string
          packet_version?: number
          reason?: string
          reviewer?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "human_packet_decision_packet_version_fkey"
            columns: ["packet_version"]
            isOneToOne: false
            referencedRelation: "human_packet_version"
            referencedColumns: ["packet_version"]
          },
        ]
      }
      human_packet_version: {
        Row: {
          correlation_id: string
          created_at: string
          fingerprint: string
          id: string
          open_blockers: number
          open_prerequisites: number
          opened_by: string
          opener_role: string
          packet_version: number
          unpassed_artifacts: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          fingerprint: string
          id?: string
          open_blockers: number
          open_prerequisites: number
          opened_by: string
          opener_role: string
          packet_version: number
          unpassed_artifacts: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          fingerprint?: string
          id?: string
          open_blockers?: number
          open_prerequisites?: number
          opened_by?: string
          opener_role?: string
          packet_version?: number
          unpassed_artifacts?: number
        }
        Relationships: []
      }
      incident_console_item: {
        Row: {
          affected_scope: string
          blocker_reason: string | null
          correlation_id: string
          created_at: string
          environment: string
          evidence_ref: string
          id: string
          incident_class: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date: string | null
          reviewer_role: string
          severity: string
          status: string
          stop_condition: string
          trigger_category: string
          version: number
        }
        Insert: {
          affected_scope: string
          blocker_reason?: string | null
          correlation_id?: string
          created_at?: string
          environment: string
          evidence_ref: string
          id?: string
          incident_class: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date?: string | null
          reviewer_role: string
          severity: string
          status: string
          stop_condition: string
          trigger_category: string
          version: number
        }
        Update: {
          affected_scope?: string
          blocker_reason?: string | null
          correlation_id?: string
          created_at?: string
          environment?: string
          evidence_ref?: string
          id?: string
          incident_class?: string
          lineage?: string
          owner_role?: string
          recorder?: string
          required_action?: string
          review_date?: string | null
          reviewer_role?: string
          severity?: string
          status?: string
          stop_condition?: string
          trigger_category?: string
          version?: number
        }
        Relationships: []
      }
      incident_console_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_console_review_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "incident_console_item"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_conflicts: {
        Row: {
          conflict_type: string
          consultation_id: string | null
          created_at: string
          details: Json
          id: string
          partner_id: string | null
          patient_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["conflict_status"]
        }
        Insert: {
          conflict_type: string
          consultation_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          partner_id?: string | null
          patient_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conflict_status"]
        }
        Update: {
          conflict_type?: string
          consultation_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          partner_id?: string | null
          patient_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["conflict_status"]
        }
        Relationships: [
          {
            foreignKeyName: "integration_conflicts_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflicts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_conflicts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_safety_item: {
        Row: {
          blocker_reason: string | null
          capability: string
          category: string
          correlation_id: string
          created_at: string
          environment: string
          evidence_ref: string
          id: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date: string | null
          reviewer_role: string
          status: string
          version: number
        }
        Insert: {
          blocker_reason?: string | null
          capability: string
          category: string
          correlation_id?: string
          created_at?: string
          environment: string
          evidence_ref: string
          id?: string
          lineage: string
          owner_role: string
          recorder: string
          required_action: string
          review_date?: string | null
          reviewer_role: string
          status: string
          version: number
        }
        Update: {
          blocker_reason?: string | null
          capability?: string
          category?: string
          correlation_id?: string
          created_at?: string
          environment?: string
          evidence_ref?: string
          id?: string
          lineage?: string
          owner_role?: string
          recorder?: string
          required_action?: string
          review_date?: string | null
          reviewer_role?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      integration_safety_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_safety_review_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "integration_safety_item"
            referencedColumns: ["id"]
          },
        ]
      }
      launch_control_item: {
        Row: {
          blocker_reason: string | null
          checklist_group: string
          correlation_id: string
          created_at: string
          environment: string
          evidence_ref: string
          id: string
          lineage: string
          owner_role: string
          phase: string
          planned_window: string
          recorder: string
          release_candidate: string
          required_action: string
          review_date: string | null
          reviewer_role: string
          rollback_trigger: string
          status: string
          version: number
        }
        Insert: {
          blocker_reason?: string | null
          checklist_group: string
          correlation_id?: string
          created_at?: string
          environment: string
          evidence_ref: string
          id?: string
          lineage: string
          owner_role: string
          phase: string
          planned_window: string
          recorder: string
          release_candidate: string
          required_action: string
          review_date?: string | null
          reviewer_role: string
          rollback_trigger: string
          status: string
          version: number
        }
        Update: {
          blocker_reason?: string | null
          checklist_group?: string
          correlation_id?: string
          created_at?: string
          environment?: string
          evidence_ref?: string
          id?: string
          lineage?: string
          owner_role?: string
          phase?: string
          planned_window?: string
          recorder?: string
          release_candidate?: string
          required_action?: string
          review_date?: string | null
          reviewer_role?: string
          rollback_trigger?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      launch_control_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "launch_control_review_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "launch_control_item"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["ledger_account_kind"]
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["ledger_account_kind"]
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["ledger_account_kind"]
          name?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          direction: string
          entry_group: string
          id: string
          location_id: string | null
          memo: string | null
          partner_id: string
          payment_transaction_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          direction: string
          entry_group: string
          id?: string
          location_id?: string | null
          memo?: string | null
          partner_id: string
          payment_transaction_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          direction?: string
          entry_group?: string
          id?: string
          location_id?: string | null
          memo?: string | null
          partner_id?: string
          payment_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          code: string
          country_code: string
          created_at: string
          id: string
          name: string
          opening_hours: Json
          partner_id: string
          phone: string | null
          status: Database["public"]["Enums"]["location_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country_code?: string
          created_at?: string
          id?: string
          name: string
          opening_hours?: Json
          partner_id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          opening_hours?: Json
          partner_id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["location_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          duration_months: number
          id: string
          included_consultations: number | null
          name: string
          price: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          included_consultations?: number | null
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          duration_months?: number
          id?: string
          included_consultations?: number | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      memberships: {
        Row: {
          care_activation_id: string | null
          care_channel: string | null
          care_collector: string | null
          care_sponsor_id: string | null
          care_terms: Json | null
          care_used: number
          created_at: string
          expires_at: string | null
          id: string
          patient_id: string
          payment_reference: string | null
          payment_status: string
          plan_id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
        }
        Insert: {
          care_activation_id?: string | null
          care_channel?: string | null
          care_collector?: string | null
          care_sponsor_id?: string | null
          care_terms?: Json | null
          care_used?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          patient_id: string
          payment_reference?: string | null
          payment_status?: string
          plan_id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Update: {
          care_activation_id?: string | null
          care_channel?: string | null
          care_collector?: string | null
          care_sponsor_id?: string | null
          care_terms?: Json | null
          care_used?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          patient_id?: string
          payment_reference?: string | null
          payment_status?: string
          plan_id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_care_sponsor_id_fkey"
            columns: ["care_sponsor_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          consultation_id: string | null
          destination: string | null
          id: string
          last_error: string | null
          locale: string
          partner_id: string | null
          patient_id: string | null
          payload: Json
          queued_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          consultation_id?: string | null
          destination?: string | null
          id?: string
          last_error?: string | null
          locale?: string
          partner_id?: string | null
          patient_id?: string | null
          payload?: Json
          queued_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          consultation_id?: string | null
          destination?: string | null
          id?: string
          last_error?: string | null
          locale?: string
          partner_id?: string | null
          patient_id?: string | null
          payload?: Json
          queued_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_health_checks: {
        Row: {
          checked_at: string
          checked_by: string
          evidence: Json
          id: string
        }
        Insert: {
          checked_at?: string
          checked_by: string
          evidence: Json
          id?: string
        }
        Update: {
          checked_at?: string
          checked_by?: string
          evidence?: Json
          id?: string
        }
        Relationships: []
      }
      operational_maintenance: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          id: string
          location_id: string | null
          partner_id: string
          reason: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          location_id?: string | null
          partner_id: string
          reason: string
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          location_id?: string | null
          partner_id?: string
          reason?: string
          starts_at?: string
        }
        Relationships: []
      }
      operational_notification_history: {
        Row: {
          action: string
          actor_user_id: string | null
          correlation_id: string
          created_at: string
          from_status: string | null
          id: string
          notification_id: string | null
          reason_code: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          correlation_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          notification_id?: string | null
          reason_code: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          correlation_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          notification_id?: string | null
          reason_code?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_notification_history_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "operational_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_notification_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          result?: Json
        }
        Relationships: []
      }
      operational_notification_preferences: {
        Row: {
          enabled: boolean
          event_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          event_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          event_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      operational_notifications: {
        Row: {
          correlation_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          location_id: string | null
          next_retry_at: string | null
          partner_id: string | null
          payload: Json
          read_at: string | null
          recipient_user_id: string
          retry_count: number
          source_event_id: string
          source_id: string
          source_kind: string
          status: string
          template_version: number
          updated_at: string
        }
        Insert: {
          correlation_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          location_id?: string | null
          next_retry_at?: string | null
          partner_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_user_id: string
          retry_count?: number
          source_event_id: string
          source_id: string
          source_kind: string
          status?: string
          template_version?: number
          updated_at?: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          location_id?: string | null
          next_retry_at?: string | null
          partner_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_user_id?: string
          retry_count?: number
          source_event_id?: string
          source_id?: string
          source_kind?: string
          status?: string
          template_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      operational_sla_cases: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          elapsed_minutes: number
          episode: string
          id: string
          kind: string
          location_id: string | null
          owner_user_id: string | null
          partner_id: string
          paused_at: string | null
          policy_id: string | null
          source_active: boolean
          source_id: string
          started_at: string
          state: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          elapsed_minutes?: number
          episode: string
          id?: string
          kind: string
          location_id?: string | null
          owner_user_id?: string | null
          partner_id: string
          paused_at?: string | null
          policy_id?: string | null
          source_active?: boolean
          source_id: string
          started_at: string
          state: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          elapsed_minutes?: number
          episode?: string
          id?: string
          kind?: string
          location_id?: string | null
          owner_user_id?: string | null
          partner_id?: string
          paused_at?: string | null
          policy_id?: string | null
          source_active?: boolean
          source_id?: string
          started_at?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_sla_cases_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "operational_sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_sla_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          result?: Json
        }
        Relationships: []
      }
      operational_sla_policies: {
        Row: {
          breach_minutes: number
          business_days: number[]
          clock_mode: string
          closes: string
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          escalation_level: number
          id: string
          kind: string
          location_id: string | null
          maintenance_from: string | null
          maintenance_to: string | null
          opens: string
          owner_role: Database["public"]["Enums"]["app_role"]
          partner_id: string
          reason: string
          reviewed_by: string | null
          status: string
          suppression_from: string | null
          suppression_to: string | null
          timezone: string
          version: number
          warning_minutes: number
        }
        Insert: {
          breach_minutes: number
          business_days: number[]
          clock_mode: string
          closes: string
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          escalation_level: number
          id?: string
          kind: string
          location_id?: string | null
          maintenance_from?: string | null
          maintenance_to?: string | null
          opens: string
          owner_role: Database["public"]["Enums"]["app_role"]
          partner_id: string
          reason: string
          reviewed_by?: string | null
          status?: string
          suppression_from?: string | null
          suppression_to?: string | null
          timezone: string
          version: number
          warning_minutes: number
        }
        Update: {
          breach_minutes?: number
          business_days?: number[]
          clock_mode?: string
          closes?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          escalation_level?: number
          id?: string
          kind?: string
          location_id?: string | null
          maintenance_from?: string | null
          maintenance_to?: string | null
          opens?: string
          owner_role?: Database["public"]["Enums"]["app_role"]
          partner_id?: string
          reason?: string
          reviewed_by?: string | null
          status?: string
          suppression_from?: string | null
          suppression_to?: string | null
          timezone?: string
          version?: number
          warning_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_sla_policies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_sla_policies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_sla_timeline: {
        Row: {
          action: string
          actor_user_id: string
          case_id: string | null
          correlation_id: string
          created_at: string
          from_state: string | null
          id: string
          location_id: string | null
          partner_id: string
          policy_id: string | null
          reason: string
          to_state: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          case_id?: string | null
          correlation_id: string
          created_at?: string
          from_state?: string | null
          id?: string
          location_id?: string | null
          partner_id: string
          policy_id?: string | null
          reason: string
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          case_id?: string | null
          correlation_id?: string
          created_at?: string
          from_state?: string | null
          id?: string
          location_id?: string | null
          partner_id?: string
          policy_id?: string | null
          reason?: string
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_sla_timeline_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "operational_sla_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_sla_timeline_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "operational_sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      operations_audit_evidence: {
        Row: {
          audit_id: string
          fingerprint: string
          recorded_at: string
        }
        Insert: {
          audit_id: string
          fingerprint: string
          recorded_at?: string
        }
        Update: {
          audit_id?: string
          fingerprint?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_audit_evidence_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: true
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_action_items: {
        Row: {
          correlation_id: string
          created_at: string
          evidence_label: string
          id: string
          item_key: string
          owner_role: string
          recorder: string
          required_action: string
          review_due: string
          reviewer_role: string
          status: string
          version: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          evidence_label: string
          id?: string
          item_key: string
          owner_role: string
          recorder: string
          required_action: string
          review_due: string
          reviewer_role: string
          status: string
          version: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          id?: string
          item_key?: string
          owner_role?: string
          recorder?: string
          required_action?: string
          review_due?: string
          reviewer_role?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      owner_action_reviews: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_id?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_action_reviews_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "owner_action_items"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_closure_record: {
        Row: {
          blocker_key: string
          correlation_id: string
          created_at: string
          evidence_label: string
          id: string
          next_action: string
          reason: string
          recorder: string
          source_fingerprint: string
          status: string
          version: number
        }
        Insert: {
          blocker_key: string
          correlation_id?: string
          created_at?: string
          evidence_label: string
          id?: string
          next_action: string
          reason: string
          recorder: string
          source_fingerprint: string
          status: string
          version: number
        }
        Update: {
          blocker_key?: string
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          id?: string
          next_action?: string
          reason?: string
          recorder?: string
          source_fingerprint?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      owner_closure_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          record_id: string
          reviewer: string
          reviewer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          record_id: string
          reviewer: string
          reviewer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          record_id?: string
          reviewer?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_closure_review_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: true
            referencedRelation: "owner_closure_record"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_application_documents: {
        Row: {
          application_id: string
          created_at: string
          document_type: string
          expiry_date: string | null
          file_name: string
          id: string
          issue_date: string
          object_path: string
          primary_license: boolean
          reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewer: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          document_type: string
          expiry_date?: string | null
          file_name: string
          id?: string
          issue_date: string
          object_path: string
          primary_license?: boolean
          reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          id?: string
          issue_date?: string
          object_path?: string
          primary_license?: boolean
          reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_application_events: {
        Row: {
          action: string
          actor_user_id: string
          application_id: string
          context: Json
          created_at: string
          from_state: string | null
          id: string
          reason: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          application_id: string
          context?: Json
          created_at?: string
          from_state?: string | null
          id?: string
          reason?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          application_id?: string
          context?: Json
          created_at?: string
          from_state?: string | null
          id?: string
          reason?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_applications: {
        Row: {
          created_at: string
          form: Json
          id: string
          organization_type: string
          owner_user_id: string
          partner_id: string | null
          reason: string | null
          reviewed_at: string | null
          reviewer: string | null
          scope_partner_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          form?: Json
          id?: string
          organization_type?: string
          owner_user_id: string
          partner_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          scope_partner_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          form?: Json
          id?: string
          organization_type?: string
          owner_user_id?: string
          partner_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          scope_partner_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_applications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_applications_scope_partner_id_fkey"
            columns: ["scope_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_customers: {
        Row: {
          created_at: string
          created_by: string
          location_id: string
          partner_id: string
          patient_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          location_id: string
          partner_id: string
          patient_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          location_id?: string
          partner_id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_customers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_customers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_customers_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_intake_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          intake_id: string | null
          partner_id: string
          patient_id: string
          reason: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          intake_id?: string | null
          partner_id: string
          patient_id: string
          reason: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          intake_id?: string | null
          partner_id?: string
          patient_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_intake_events_intake_id_fkey"
            columns: ["intake_id"]
            isOneToOne: false
            referencedRelation: "partner_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intake_events_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intake_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_intakes: {
        Row: {
          config_id: string | null
          consultation_id: string | null
          creation_tx: string | null
          emergency: boolean
          evaluated_at: string
          evaluated_by: string
          evidence: Json
          gates: Json
          id: string
          location_id: string
          partner_id: string
          patient_id: string
          reason: string
          status: string
        }
        Insert: {
          config_id?: string | null
          consultation_id?: string | null
          creation_tx?: string | null
          emergency?: boolean
          evaluated_at?: string
          evaluated_by: string
          evidence: Json
          gates: Json
          id?: string
          location_id: string
          partner_id: string
          patient_id: string
          reason: string
          status: string
        }
        Update: {
          config_id?: string | null
          consultation_id?: string | null
          creation_tx?: string | null
          emergency?: boolean
          evaluated_at?: string
          evaluated_by?: string
          evidence?: Json
          gates?: Json
          id?: string
          location_id?: string
          partner_id?: string
          patient_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_intakes_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "partner_screening_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intakes_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intakes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intakes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_intakes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "partner_customers"
            referencedColumns: ["patient_id"]
          },
        ]
      }
      partner_screening_configs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          partner_id: string
          settings: Json
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          partner_id: string
          settings: Json
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          partner_id?: string
          settings?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_screening_configs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          address: string | null
          branch_name: string | null
          care_credit_model: string
          country_code: string
          created_at: string
          credit_balance: number
          default_location_id: string | null
          display_name: string
          email: string | null
          id: string
          legal_name: string
          partner_code: string
          partner_type: Database["public"]["Enums"]["partner_type"]
          phone: string | null
          status: Database["public"]["Enums"]["partner_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_name?: string | null
          care_credit_model?: string
          country_code?: string
          created_at?: string
          credit_balance?: number
          default_location_id?: string | null
          display_name: string
          email?: string | null
          id?: string
          legal_name: string
          partner_code: string
          partner_type?: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_name?: string | null
          care_credit_model?: string
          country_code?: string
          created_at?: string
          credit_balance?: number
          default_location_id?: string | null
          display_name?: string
          email?: string | null
          id?: string
          legal_name?: string
          partner_code?: string
          partner_type?: Database["public"]["Enums"]["partner_type"]
          phone?: string | null
          status?: Database["public"]["Enums"]["partner_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_default_location_id_fkey"
            columns: ["default_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_consents: {
        Row: {
          accepted: boolean
          consent_type: string
          created_at: string
          id: string
          patient_id: string
          recorded_by: string | null
          version: string
        }
        Insert: {
          accepted?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          patient_id: string
          recorded_by?: string | null
          version?: string
        }
        Update: {
          accepted?: boolean
          consent_type?: string
          created_at?: string
          id?: string
          patient_id?: string
          recorded_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_intakes: {
        Row: {
          allergies: string | null
          chief_complaint: string
          created_at: string
          current_medications: string | null
          id: string
          medical_history: string | null
          patient_id: string
          submitted_by: string | null
        }
        Insert: {
          allergies?: string | null
          chief_complaint: string
          created_at?: string
          current_medications?: string | null
          id?: string
          medical_history?: string | null
          patient_id: string
          submitted_by?: string | null
        }
        Update: {
          allergies?: string | null
          chief_complaint?: string
          created_at?: string
          current_medications?: string | null
          id?: string
          medical_history?: string | null
          patient_id?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_intakes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          auth_user_id: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          date_of_birth: string | null
          email: string | null
          external_patient_id: string
          first_name: string
          gender: string | null
          hn: string | null
          id: string
          last_name: string
          line_user_id: string | null
          marketing_consent: boolean
          mcs_patient_id: string | null
          notes: string | null
          notify_email: boolean
          notify_line: boolean
          notify_whatsapp: boolean
          partner_id: string | null
          phone_number: string | null
          preferred_language: string
          service_reminder_consent: boolean
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          date_of_birth?: string | null
          email?: string | null
          external_patient_id?: string
          first_name: string
          gender?: string | null
          hn?: string | null
          id?: string
          last_name: string
          line_user_id?: string | null
          marketing_consent?: boolean
          mcs_patient_id?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_line?: boolean
          notify_whatsapp?: boolean
          partner_id?: string | null
          phone_number?: string | null
          preferred_language?: string
          service_reminder_consent?: boolean
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type"]
          date_of_birth?: string | null
          email?: string | null
          external_patient_id?: string
          first_name?: string
          gender?: string | null
          hn?: string | null
          id?: string
          last_name?: string
          line_user_id?: string | null
          marketing_consent?: boolean
          mcs_patient_id?: string | null
          notes?: string | null
          notify_email?: boolean
          notify_line?: boolean
          notify_whatsapp?: boolean
          partner_id?: string | null
          phone_number?: string | null
          preferred_language?: string
          service_reminder_consent?: boolean
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          captured_at: string | null
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          created_by: string | null
          currency: string
          fee_amount: number
          id: string
          location_id: string | null
          metadata: Json
          partner_id: string
          patient_id: string | null
          provider: string
          provider_reference: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          captured_at?: string | null
          channel?: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          created_by?: string | null
          currency?: string
          fee_amount?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          partner_id: string
          patient_id?: string | null
          provider?: string
          provider_reference?: string | null
          reference: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          captured_at?: string | null
          channel?: Database["public"]["Enums"]["payment_channel"]
          created_at?: string
          created_by?: string | null
          currency?: string
          fee_amount?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          partner_id?: string
          patient_id?: string | null
          provider?: string
          provider_reference?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          revision: number
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          revision?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          revision?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_settings_history: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          revision: number
          setting_key: string
          value: Json
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          revision: number
          setting_key: string
          value: Json
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          revision?: number
          setting_key?: string
          value?: Json
        }
        Relationships: []
      }
      privacy_consent_events: {
        Row: {
          actor_user_id: string
          correlation_id: string
          created_at: string
          id: string
          location_id: string
          partner_id: string
          patient_id: string
          policy_version: string
          purpose: string
          reason: string
          source: string
          state: string
        }
        Insert: {
          actor_user_id: string
          correlation_id: string
          created_at?: string
          id?: string
          location_id: string
          partner_id: string
          patient_id: string
          policy_version: string
          purpose: string
          reason: string
          source: string
          state: string
        }
        Update: {
          actor_user_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          location_id?: string
          partner_id?: string
          patient_id?: string
          policy_version?: string
          purpose?: string
          reason?: string
          source?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_consent_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "partner_customers"
            referencedColumns: ["patient_id"]
          },
        ]
      }
      privacy_controls: {
        Row: {
          anonymized: boolean
          correction: Json
          hold_type: string | null
          hold_until: string | null
          location_id: string
          partner_id: string
          patient_id: string
          request_id: string | null
          restricted: boolean
          soft_deleted: boolean
          updated_at: string
        }
        Insert: {
          anonymized?: boolean
          correction?: Json
          hold_type?: string | null
          hold_until?: string | null
          location_id: string
          partner_id: string
          patient_id: string
          request_id?: string | null
          restricted?: boolean
          soft_deleted?: boolean
          updated_at?: string
        }
        Update: {
          anonymized?: boolean
          correction?: Json
          hold_type?: string | null
          hold_until?: string | null
          location_id?: string
          partner_id?: string
          patient_id?: string
          request_id?: string | null
          restricted?: boolean
          soft_deleted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_controls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "partner_customers"
            referencedColumns: ["patient_id"]
          },
          {
            foreignKeyName: "privacy_controls_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "privacy_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_events: {
        Row: {
          action: string
          actor_user_id: string
          correlation_id: string
          created_at: string
          from_state: string | null
          id: string
          location_id: string | null
          partner_id: string
          policy_id: string | null
          reason: string
          request_id: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          correlation_id: string
          created_at?: string
          from_state?: string | null
          id?: string
          location_id?: string | null
          partner_id: string
          policy_id?: string | null
          reason: string
          request_id?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          correlation_id?: string
          created_at?: string
          from_state?: string | null
          id?: string
          location_id?: string | null
          partner_id?: string
          policy_id?: string | null
          reason?: string
          request_id?: string | null
          to_state?: string | null
        }
        Relationships: []
      }
      privacy_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          result?: Json
        }
        Relationships: []
      }
      privacy_policies: {
        Row: {
          created_at: string
          created_by: string
          days: number
          effective_from: string
          effective_to: string | null
          id: string
          kind: string
          location_id: string | null
          partner_id: string
          reason: string
          reviewed_by: string | null
          status: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          days: number
          effective_from: string
          effective_to?: string | null
          id?: string
          kind: string
          location_id?: string | null
          partner_id: string
          reason: string
          reviewed_by?: string | null
          status?: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          days?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          kind?: string
          location_id?: string | null
          partner_id?: string
          reason?: string
          reviewed_by?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "privacy_policies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_policies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          kind: string
          location_id: string
          partner_id: string
          patient_id: string
          proposed_correction: Json
          reason: string
          status: string
          verification_method: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          kind: string
          location_id: string
          partner_id: string
          patient_id: string
          proposed_correction?: Json
          reason: string
          status?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          location_id?: string
          partner_id?: string
          patient_id?: string
          proposed_correction?: Json
          reason?: string
          status?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_requests_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privacy_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "partner_customers"
            referencedColumns: ["patient_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          preferred_language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      protection_evidence: {
        Row: {
          applied_date: string | null
          correlation_id: string
          created_at: string
          environment_label: string
          evidence_ref: string
          id: string
          lineage: string
          migration_history: string
          migration_label: string
          next_action: string
          owner_role: string
          protected_tables: string
          recorder: string
          reviewer_role: string
          rls_result: string
          status: string
          storage_policy: string
          version: number
        }
        Insert: {
          applied_date?: string | null
          correlation_id?: string
          created_at?: string
          environment_label: string
          evidence_ref: string
          id?: string
          lineage: string
          migration_history: string
          migration_label: string
          next_action: string
          owner_role: string
          protected_tables: string
          recorder: string
          reviewer_role: string
          rls_result: string
          status: string
          storage_policy: string
          version: number
        }
        Update: {
          applied_date?: string | null
          correlation_id?: string
          created_at?: string
          environment_label?: string
          evidence_ref?: string
          id?: string
          lineage?: string
          migration_history?: string
          migration_label?: string
          next_action?: string
          owner_role?: string
          protected_tables?: string
          recorder?: string
          reviewer_role?: string
          rls_result?: string
          status?: string
          storage_policy?: string
          version?: number
        }
        Relationships: []
      }
      protection_evidence_confirmations: {
        Row: {
          correlation_id: string
          created_at: string
          evidence_id: string
          id: string
          note: string
          outcome: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          evidence_id: string
          id?: string
          note: string
          outcome: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          evidence_id?: string
          id?: string
          note?: string
          outcome?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "protection_evidence_confirmations_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "protection_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_decision_event: {
        Row: {
          correlation_id: string
          created_at: string
          decision: string
          dependency_impact: string
          event_version: number
          evidence_label: string
          id: string
          kind: string
          new_status: string
          owner_role: string
          prior_status: string
          reason: string
          register_key: string
          resulting_version: number
          reviewer_role: string | null
          source_version: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          decision: string
          dependency_impact: string
          event_version: number
          evidence_label: string
          id?: string
          kind: string
          new_status: string
          owner_role: string
          prior_status: string
          reason: string
          register_key: string
          resulting_version: number
          reviewer_role?: string | null
          source_version: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          decision?: string
          dependency_impact?: string
          event_version?: number
          evidence_label?: string
          id?: string
          kind?: string
          new_status?: string
          owner_role?: string
          prior_status?: string
          reason?: string
          register_key?: string
          resulting_version?: number
          reviewer_role?: string | null
          source_version?: number
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          payment_transaction_id: string
          provider_reference: string | null
          reason: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          payment_transaction_id: string
          provider_reference?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payment_transaction_id?: string
          provider_reference?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      release_approvals: {
        Row: {
          actor: string
          correlation_id: string
          created_at: string
          decision: string
          id: string
          reason: string
          signoff_id: string
        }
        Insert: {
          actor: string
          correlation_id: string
          created_at?: string
          decision: string
          id?: string
          reason: string
          signoff_id: string
        }
        Update: {
          actor?: string
          correlation_id?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string
          signoff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_approvals_signoff_id_fkey"
            columns: ["signoff_id"]
            isOneToOne: true
            referencedRelation: "release_signoffs"
            referencedColumns: ["id"]
          },
        ]
      }
      release_artifact_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          reviewer: string
          reviewer_role: string
          snapshot_id: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          reviewer: string
          reviewer_role: string
          snapshot_id: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          reviewer?: string
          reviewer_role?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_artifact_review_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "release_artifact_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      release_artifact_snapshot: {
        Row: {
          blocker_reason: string
          correlation_id: string
          created_at: string
          id: string
          observed_status: string
          recorder: string
          register: string
          source_count: number
          source_fingerprint: string
          source_version: number
          version: number
        }
        Insert: {
          blocker_reason: string
          correlation_id?: string
          created_at?: string
          id?: string
          observed_status: string
          recorder: string
          register: string
          source_count: number
          source_fingerprint: string
          source_version: number
          version: number
        }
        Update: {
          blocker_reason?: string
          correlation_id?: string
          created_at?: string
          id?: string
          observed_status?: string
          recorder?: string
          register?: string
          source_count?: number
          source_fingerprint?: string
          source_version?: number
          version?: number
        }
        Relationships: []
      }
      release_banner_events: {
        Row: {
          active: boolean
          actor: string
          correlation_id: string
          created_at: string
          id: string
          message: string
          reason: string
        }
        Insert: {
          active: boolean
          actor: string
          correlation_id: string
          created_at?: string
          id?: string
          message: string
          reason: string
        }
        Update: {
          active?: boolean
          actor?: string
          correlation_id?: string
          created_at?: string
          id?: string
          message?: string
          reason?: string
        }
        Relationships: []
      }
      release_checklist_items: {
        Row: {
          category: string
          key: string
          owner_role: Database["public"]["Enums"]["app_role"]
          position: number
          sensitive: boolean
        }
        Insert: {
          category: string
          key: string
          owner_role: Database["public"]["Enums"]["app_role"]
          position: number
          sensitive: boolean
        }
        Update: {
          category?: string
          key?: string
          owner_role?: Database["public"]["Enums"]["app_role"]
          position?: number
          sensitive?: boolean
        }
        Relationships: []
      }
      release_drill_runs: {
        Row: {
          actor: string
          correlation_id: string
          created_at: string
          evidence_ref: string
          expected: string
          id: string
          next_action: string
          observed: string
          scenario: string
          status: string
          synthetic: boolean
        }
        Insert: {
          actor: string
          correlation_id?: string
          created_at?: string
          evidence_ref: string
          expected: string
          id?: string
          next_action: string
          observed: string
          scenario: string
          status: string
          synthetic?: boolean
        }
        Update: {
          actor?: string
          correlation_id?: string
          created_at?: string
          evidence_ref?: string
          expected?: string
          id?: string
          next_action?: string
          observed?: string
          scenario?: string
          status?: string
          synthetic?: boolean
        }
        Relationships: []
      }
      release_evidence: {
        Row: {
          actor: string
          blocked_reason: string | null
          correlation_id: string
          created_at: string
          evidence_type: string
          id: string
          item_key: string
          lineage: string
          next_action: string
          owner_role: Database["public"]["Enums"]["app_role"]
          reference_label: string
          review_due: string | null
          status: string
          version: number
        }
        Insert: {
          actor: string
          blocked_reason?: string | null
          correlation_id: string
          created_at?: string
          evidence_type: string
          id?: string
          item_key: string
          lineage: string
          next_action: string
          owner_role: Database["public"]["Enums"]["app_role"]
          reference_label: string
          review_due?: string | null
          status: string
          version: number
        }
        Update: {
          actor?: string
          blocked_reason?: string | null
          correlation_id?: string
          created_at?: string
          evidence_type?: string
          id?: string
          item_key?: string
          lineage?: string
          next_action?: string
          owner_role?: Database["public"]["Enums"]["app_role"]
          reference_label?: string
          review_due?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "release_evidence_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "release_checklist_items"
            referencedColumns: ["key"]
          },
        ]
      }
      release_operations: {
        Row: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Insert: {
          actor: string
          intent: Json
          key: string
          result: Json
        }
        Update: {
          actor?: string
          intent?: Json
          key?: string
          result?: Json
        }
        Relationships: []
      }
      release_review_acks: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          item_key: string
          note: string
          outcome: string
          reviewer: string
          round: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_key: string
          note: string
          outcome: string
          reviewer: string
          round?: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          item_key?: string
          note?: string
          outcome?: string
          reviewer?: string
          round?: number
        }
        Relationships: []
      }
      release_signoffs: {
        Row: {
          actor: string
          correlation_id: string
          created_at: string
          evidence_reference: string
          id: string
          item_key: string
          owner_role: Database["public"]["Enums"]["app_role"]
          reason: string
          status: string
          version: number
        }
        Insert: {
          actor: string
          correlation_id: string
          created_at?: string
          evidence_reference: string
          id?: string
          item_key: string
          owner_role: Database["public"]["Enums"]["app_role"]
          reason: string
          status: string
          version: number
        }
        Update: {
          actor?: string
          correlation_id?: string
          created_at?: string
          evidence_reference?: string
          id?: string
          item_key?: string
          owner_role?: Database["public"]["Enums"]["app_role"]
          reason?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "release_signoffs_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "release_checklist_items"
            referencedColumns: ["key"]
          },
        ]
      }
      resources: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["resource_kind"]
          location_id: string
          name: string
          quantity: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["resource_kind"]
          location_id: string
          name: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["resource_kind"]
          location_id?: string
          name?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      review_decisions: {
        Row: {
          correlation_id: string
          created_at: string
          decision: string
          id: string
          reason: string
          reviewer: string
          reviewer_role: string
          round: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          decision: string
          id?: string
          reason: string
          reviewer: string
          reviewer_role: string
          round: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          decision?: string
          id?: string
          reason?: string
          reviewer?: string
          reviewer_role?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_decisions_round_fkey"
            columns: ["round"]
            isOneToOne: false
            referencedRelation: "review_rounds"
            referencedColumns: ["round"]
          },
        ]
      }
      review_handoff_event: {
        Row: {
          actor: string
          correlation_id: string
          created_at: string
          evidence_label: string
          handoff_type: string
          id: string
          next_action: string
          packet_label: string
          reason: string
          recipient_role: string
          reviewer_role: string | null
          root_id: string | null
          sender_role: string
          snapshot_id: string
        }
        Insert: {
          actor: string
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          handoff_type: string
          id?: string
          next_action: string
          packet_label?: string
          reason: string
          recipient_role: string
          reviewer_role?: string | null
          root_id?: string | null
          sender_role: string
          snapshot_id: string
        }
        Update: {
          actor?: string
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          handoff_type?: string
          id?: string
          next_action?: string
          packet_label?: string
          reason?: string
          recipient_role?: string
          reviewer_role?: string | null
          root_id?: string | null
          sender_role?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_handoff_event_root_id_fkey"
            columns: ["root_id"]
            isOneToOne: false
            referencedRelation: "review_handoff_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_handoff_event_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "review_handoff_snapshot"
            referencedColumns: ["id"]
          },
        ]
      }
      review_handoff_snapshot: {
        Row: {
          artifact_count: number
          blocker_count: number
          created_at: string
          decision_state: string
          discrepancy_count: number
          fingerprint: string
          id: string
          manifest: Json
          packet_version: number
          prerequisite_count: number
          source_version: number
        }
        Insert: {
          artifact_count: number
          blocker_count: number
          created_at?: string
          decision_state: string
          discrepancy_count: number
          fingerprint: string
          id?: string
          manifest: Json
          packet_version: number
          prerequisite_count: number
          source_version?: never
        }
        Update: {
          artifact_count?: number
          blocker_count?: number
          created_at?: string
          decision_state?: string
          discrepancy_count?: number
          fingerprint?: string
          id?: string
          manifest?: Json
          packet_version?: number
          prerequisite_count?: number
          source_version?: never
        }
        Relationships: [
          {
            foreignKeyName: "review_handoff_snapshot_packet_version_fkey"
            columns: ["packet_version"]
            isOneToOne: false
            referencedRelation: "human_packet_version"
            referencedColumns: ["packet_version"]
          },
        ]
      }
      review_rounds: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          opened_by: string
          round: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          opened_by: string
          round: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          opened_by?: string
          round?: number
        }
        Relationships: []
      }
      rooms: {
        Row: {
          active: boolean
          capacity: number
          code: string
          created_at: string
          id: string
          location_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          code: string
          created_at?: string
          id?: string
          location_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number
          code?: string
          created_at?: string
          id?: string
          location_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_prices: {
        Row: {
          active: boolean
          channel: string
          created_at: string
          currency: string
          id: string
          location_id: string | null
          price: number
          service_id: string
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          active?: boolean
          channel?: string
          created_at?: string
          currency?: string
          id?: string
          location_id?: string | null
          price: number
          service_id: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          active?: boolean
          channel?: string
          created_at?: string
          currency?: string
          id?: string
          location_id?: string | null
          price?: number
          service_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_prices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_prices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_resources: {
        Row: {
          id: string
          quantity: number
          resource_id: string
          service_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          resource_id: string
          service_id: string
        }
        Update: {
          id?: string
          quantity?: number
          resource_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_resources_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_resources_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          buffer_minutes: number
          category: Database["public"]["Enums"]["service_category"]
          code: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          name_th: string | null
          partner_id: string
          requires_room: boolean
          requires_therapist: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          buffer_minutes?: number
          category?: Database["public"]["Enums"]["service_category"]
          code: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          name_th?: string | null
          partner_id: string
          requires_room?: boolean
          requires_therapist?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          buffer_minutes?: number
          category?: Database["public"]["Enums"]["service_category"]
          code?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          name_th?: string | null
          partner_id?: string
          requires_room?: boolean
          requires_therapist?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      session_result_record: {
        Row: {
          blocker_reason: string
          correlation_id: string
          created_at: string
          environment_label: string
          evidence_label: string
          expected: string
          id: string
          next_action: string
          owner_role: string
          recorder: string
          result_label: string
          session_key: string
          source_session_version: number
          status: string
          suite_key: string
          version: number
        }
        Insert: {
          blocker_reason: string
          correlation_id?: string
          created_at?: string
          environment_label: string
          evidence_label: string
          expected: string
          id?: string
          next_action: string
          owner_role: string
          recorder: string
          result_label: string
          session_key: string
          source_session_version: number
          status: string
          suite_key: string
          version: number
        }
        Update: {
          blocker_reason?: string
          correlation_id?: string
          created_at?: string
          environment_label?: string
          evidence_label?: string
          expected?: string
          id?: string
          next_action?: string
          owner_role?: string
          recorder?: string
          result_label?: string
          session_key?: string
          source_session_version?: number
          status?: string
          suite_key?: string
          version?: number
        }
        Relationships: []
      }
      session_result_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          record_id: string
          review_slot: number
          reviewer: string
          reviewer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          record_id: string
          review_slot: number
          reviewer: string
          reviewer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          record_id?: string
          review_slot?: number
          reviewer?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_result_review_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "session_result_record"
            referencedColumns: ["id"]
          },
        ]
      }
      session_start_event: {
        Row: {
          blocker_reason: string
          correlation_id: string
          created_at: string
          environment_label: string
          evidence_label: string
          id: string
          next_action: string
          owner_role: string
          recorder: string
          session_key: string
          source_validation_version: number
          status: string
          suite_group: string
          version: number
        }
        Insert: {
          blocker_reason: string
          correlation_id?: string
          created_at?: string
          environment_label: string
          evidence_label: string
          id?: string
          next_action: string
          owner_role: string
          recorder: string
          session_key: string
          source_validation_version: number
          status: string
          suite_group: string
          version: number
        }
        Update: {
          blocker_reason?: string
          correlation_id?: string
          created_at?: string
          environment_label?: string
          evidence_label?: string
          id?: string
          next_action?: string
          owner_role?: string
          recorder?: string
          session_key?: string
          source_validation_version?: number
          status?: string
          suite_group?: string
          version?: number
        }
        Relationships: []
      }
      session_start_review: {
        Row: {
          correlation_id: string
          created_at: string
          event_id: string
          id: string
          outcome: string
          reviewer: string
          reviewer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          event_id: string
          id?: string
          outcome: string
          reviewer: string
          reviewer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          event_id?: string
          id?: string
          outcome?: string
          reviewer?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_start_review_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "session_start_event"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_security_state: {
        Row: {
          reset_required: boolean
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          reset_required?: boolean
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          reset_required?: boolean
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      test_prerequisite_reviews: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          prerequisite_id: string
          reviewer: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          prerequisite_id: string
          reviewer: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          prerequisite_id?: string
          reviewer?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_prerequisite_reviews_prerequisite_id_fkey"
            columns: ["prerequisite_id"]
            isOneToOne: false
            referencedRelation: "test_prerequisites"
            referencedColumns: ["id"]
          },
        ]
      }
      test_prerequisites: {
        Row: {
          correlation_id: string
          created_at: string
          evidence_label: string
          id: string
          owner_role: string
          prerequisite_key: string
          recorder: string
          required_action: string
          review_due: string
          status: string
          version: number
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          evidence_label: string
          id?: string
          owner_role: string
          prerequisite_key: string
          recorder: string
          required_action: string
          review_due: string
          status: string
          version: number
        }
        Update: {
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          id?: string
          owner_role?: string
          prerequisite_key?: string
          recorder?: string
          required_action?: string
          review_due?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      test_session_reviews: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          reviewer: string
          session_id: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          reviewer: string
          session_id: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          reviewer?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_session_reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "test_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_sessions: {
        Row: {
          blocker_reason: string
          campaign_version: string
          correlation_id: string
          created_at: string
          environment_label: string
          evidence_label: string
          expected: string
          id: string
          next_action: string
          owner_role: string
          prerequisite_state: string
          recorder: string
          reviewer_role: string
          status: string
          suite_key: string
          version: number
        }
        Insert: {
          blocker_reason: string
          campaign_version: string
          correlation_id?: string
          created_at?: string
          environment_label: string
          evidence_label: string
          expected: string
          id?: string
          next_action: string
          owner_role: string
          prerequisite_state: string
          recorder: string
          reviewer_role: string
          status: string
          suite_key: string
          version: number
        }
        Update: {
          blocker_reason?: string
          campaign_version?: string
          correlation_id?: string
          created_at?: string
          environment_label?: string
          evidence_label?: string
          expected?: string
          id?: string
          next_action?: string
          owner_role?: string
          prerequisite_state?: string
          recorder?: string
          reviewer_role?: string
          status?: string
          suite_key?: string
          version?: number
        }
        Relationships: []
      }
      therapist_availability: {
        Row: {
          end_time: string
          id: string
          location_id: string | null
          start_time: string
          therapist_id: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          location_id?: string | null
          start_time: string
          therapist_id: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          location_id?: string | null
          start_time?: string
          therapist_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "therapist_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_availability_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_earnings: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          booking_item_id: string | null
          created_at: string
          currency: string
          earned_on: string
          id: string
          partner_id: string
          snapshot_id: string | null
          status: Database["public"]["Enums"]["earning_status"]
          therapist_id: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          booking_item_id?: string | null
          created_at?: string
          currency?: string
          earned_on?: string
          id?: string
          partner_id: string
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["earning_status"]
          therapist_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          booking_item_id?: string | null
          created_at?: string
          currency?: string
          earned_on?: string
          id?: string
          partner_id?: string
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["earning_status"]
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_earnings_booking_item_id_fkey"
            columns: ["booking_item_id"]
            isOneToOne: false
            referencedRelation: "booking_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_earnings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_earnings_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "commission_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_earnings_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_qualifications: {
        Row: {
          created_at: string
          expires_on: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          reference: string | null
          therapist_id: string
          title: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          reference?: string | null
          therapist_id: string
          title: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          reference?: string | null
          therapist_id?: string
          title?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "therapist_qualifications_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_service_eligibility: {
        Row: {
          id: string
          service_id: string
          skill_level: number
          therapist_id: string
        }
        Insert: {
          id?: string
          service_id: string
          skill_level?: number
          therapist_id: string
        }
        Update: {
          id?: string
          service_id?: string
          skill_level?: number
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_service_eligibility_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapist_service_eligibility_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapist_time_off: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
          therapist_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
          therapist_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
          therapist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapist_time_off_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapists: {
        Row: {
          auth_user_id: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          employment_type: Database["public"]["Enums"]["employment_type"]
          first_name: string
          home_location_id: string | null
          id: string
          languages: string[]
          last_name: string
          partner_id: string
          phone: string | null
          staff_code: string
          status: Database["public"]["Enums"]["therapist_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          first_name: string
          home_location_id?: string | null
          id?: string
          languages?: string[]
          last_name: string
          partner_id: string
          phone?: string | null
          staff_code: string
          status?: Database["public"]["Enums"]["therapist_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          employment_type?: Database["public"]["Enums"]["employment_type"]
          first_name?: string
          home_location_id?: string | null
          id?: string
          languages?: string[]
          last_name?: string
          partner_id?: string
          phone?: string | null
          staff_code?: string
          status?: Database["public"]["Enums"]["therapist_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapists_home_location_id_fkey"
            columns: ["home_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "therapists_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          partner_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_snapshot_record: {
        Row: {
          blocker_reason: string
          check_key: string
          correlation_id: string
          created_at: string
          evidence_label: string
          id: string
          numeric_count: number | null
          optional_skip: string
          recorder: string
          status: string
          version: number
        }
        Insert: {
          blocker_reason: string
          check_key: string
          correlation_id?: string
          created_at?: string
          evidence_label: string
          id?: string
          numeric_count?: number | null
          optional_skip?: string
          recorder: string
          status: string
          version: number
        }
        Update: {
          blocker_reason?: string
          check_key?: string
          correlation_id?: string
          created_at?: string
          evidence_label?: string
          id?: string
          numeric_count?: number | null
          optional_skip?: string
          recorder?: string
          status?: string
          version?: number
        }
        Relationships: []
      }
      validation_snapshot_review: {
        Row: {
          correlation_id: string
          created_at: string
          id: string
          outcome: string
          record_id: string
          reviewer: string
          reviewer_role: string
        }
        Insert: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome: string
          record_id: string
          reviewer: string
          reviewer_role: string
        }
        Update: {
          correlation_id?: string
          created_at?: string
          id?: string
          outcome?: string
          record_id?: string
          reviewer?: string
          reviewer_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_snapshot_review_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: true
            referencedRelation: "validation_snapshot_record"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_type: string
          external_event_id: string
          id: string
          last_error: string | null
          payload: Json
          payload_hash: string | null
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["webhook_processing_status"]
          provider: string
          received_at: string
          retry_count: number
        }
        Insert: {
          event_type: string
          external_event_id: string
          id?: string
          last_error?: string | null
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          provider?: string
          received_at?: string
          retry_count?: number
        }
        Update: {
          event_type?: string
          external_event_id?: string
          id?: string
          last_error?: string | null
          payload?: Json
          payload_hash?: string | null
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["webhook_processing_status"]
          provider?: string
          received_at?: string
          retry_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_audit_confirm: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: Json
      }
      access_audit_console: { Args: never; Returns: Json }
      access_audit_record: {
        Args: {
          _expected: string
          _key: string
          _lineage: string
          _next: string
          _owner: string
          _ref: string
          _reviewer: string
          _scope: string
          _sens: string
          _status: string
        }
        Returns: Json
      }
      access_unsafe: { Args: { _t: string }; Returns: boolean }
      apply_credit_transaction: {
        Args: {
          _actor?: string
          _consultation_id?: string
          _idempotency_key: string
          _metadata?: Json
          _partner_id: string
          _quantity: number
          _reference_id?: string
          _type: Database["public"]["Enums"]["credit_txn_type"]
        }
        Returns: {
          balance_after: number
          consultation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          metadata: Json
          partner_id: string
          quantity: number
          reference_id: string | null
          type: Database["public"]["Enums"]["credit_txn_type"]
        }
        SetofOptions: {
          from: "*"
          to: "credit_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backup_evidence_confirm: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: Json
      }
      backup_evidence_console: { Args: never; Returns: Json }
      backup_evidence_record: {
        Args: {
          _backup_date: string
          _env: string
          _lineage: string
          _next: string
          _owner: string
          _ref: string
          _restore_date: string
          _result: string
          _retention: number
          _reviewer: string
          _scope: string
          _status: string
        }
        Returns: Json
      }
      backup_unsafe: { Args: { _t: string }; Returns: boolean }
      belongs_to_partner: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      booking_partner: { Args: { _booking_id: string }; Returns: string }
      campaign_console: { Args: never; Returns: Json }
      campaign_result_confirm: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: Json
      }
      campaign_run_record: {
        Args: {
          _label: string
          _results: Json
          _simulated: boolean
          _version: string
        }
        Returns: Json
      }
      can_manage_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_partner: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_finance: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_location: {
        Args: { _location_id: string; _user_id: string }
        Returns: boolean
      }
      can_read_partner: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      can_write_platform: { Args: { _user_id: string }; Returns: boolean }
      care_appointment_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_available: { Args: { _p: string }; Returns: number }
      care_bind_checkout: {
        Args: { _checkout_id: string; _environment: string; _id: string }
        Returns: undefined
      }
      care_cancel_existing: {
        Args: { _id: string; _key: string; _reason: string }
        Returns: Json
      }
      care_catalog: { Args: { _org: string }; Returns: Json }
      care_clinical_access: {
        Args: { _c: string; _u: string }
        Returns: boolean
      }
      care_clinical_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_clinical_read: { Args: { _appointment: string }; Returns: Json }
      care_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_coordinator: { Args: { _u: string }; Returns: boolean }
      care_coverage_audit: {
        Args: {
          _action: string
          _actor: string
          _before: Json
          _coverage: string
          _credit: boolean
          _encounter: string
          _key: string
          _member: string
          _org: string
          _reason: string
          _reference: string
        }
        Returns: undefined
      }
      care_coverage_balance: {
        Args: { _member: string; _org: string }
        Returns: Json
      }
      care_derived_key: { Args: { _id: string; _tag: string }; Returns: string }
      care_document_access: {
        Args: { _d: string; _u: string }
        Returns: boolean
      }
      care_document_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_encounter_scope: {
        Args: { _id: string; _u: string }
        Returns: boolean
      }
      care_entitlement: {
        Args: { _at: string; _patient: string; _service?: string }
        Returns: Json
      }
      care_finance: { Args: { _u: string }; Returns: boolean }
      care_finance_scope: { Args: { _p: string; _u: string }; Returns: boolean }
      care_followup_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_grant_relationship: {
        Args: { _doctor: string; _patient: string; _valid_until: string }
        Returns: string
      }
      care_history: {
        Args: { _page?: number; _patient: string; _query?: string }
        Returns: Json
      }
      care_legacy_credit_transaction: {
        Args: {
          _actor?: string
          _consultation_id?: string
          _idempotency_key: string
          _metadata?: Json
          _partner_id: string
          _quantity: number
          _reference_id?: string
          _type: Database["public"]["Enums"]["credit_txn_type"]
        }
        Returns: {
          balance_after: number
          consultation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          metadata: Json
          partner_id: string
          quantity: number
          reference_id: string | null
          type: Database["public"]["Enums"]["credit_txn_type"]
        }
        SetofOptions: {
          from: "*"
          to: "credit_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      care_my_catalog: { Args: never; Returns: Json }
      care_note_doctor:
        | { Args: { _appointment: string; _uid: string }; Returns: string }
        | {
            Args: {
              _appt: Database["public"]["Tables"]["care_appointments"]["Row"]
              _uid: string
            }
            Returns: string
          }
      care_ops_scope: { Args: { _p: string; _u: string }; Returns: boolean }
      care_patient_book: {
        Args: {
          _ends: string
          _key: string
          _service_version: string
          _starts: string
        }
        Returns: Json
      }
      care_patient_portal: { Args: never; Returns: Json }
      care_patient_scope: { Args: { _p: string; _u: string }; Returns: boolean }
      care_personal_balance: { Args: { _patient: string }; Returns: Json }
      care_personal_command:
        | { Args: { _args: Json; _key: string; _op: string }; Returns: Json }
        | {
            Args: { _actor: string; _args: Json; _key: string; _op: string }
            Returns: Json
          }
      care_personal_eligible:
        | {
            Args: {
              _currency: string
              _doctor: string
              _partner: string
              _patient: string
              _service: string
            }
            Returns: string[]
          }
        | {
            Args: {
              _currency: string
              _doctor: string
              _need_minor: number
              _partner: string
              _patient: string
              _service: string
            }
            Returns: string[]
          }
      care_personal_lot_available: {
        Args: { _lot: string }
        Returns: Record<string, unknown>
      }
      care_platform: { Args: { _u: string }; Returns: boolean }
      care_post: {
        Args: {
          _actor: string
          _c: string
          _key: string
          _meta: Json
          _p: string
          _quantity: number
          _ref: string
          _type: Database["public"]["Enums"]["credit_txn_type"]
        }
        Returns: undefined
      }
      care_prepaid_purchase: { Args: { _plan_version: string }; Returns: Json }
      care_prepare_checkout: { Args: { _id: string }; Returns: Json }
      care_prepare_checkout_server: {
        Args: { _environment: string; _id: string; _user: string }
        Returns: Json
      }
      care_provider_payment_event: {
        Args: {
          _amount_minor: number
          _currency: string
          _event_id: string
          _hash: string
          _livemode: boolean
          _payment_id: string
          _reference: string
          _type: string
        }
        Returns: Json
      }
      care_provider_payment_event_v2: {
        Args: {
          _amount_minor: number
          _currency: string
          _environment: string
          _event_id: string
          _hash: string
          _livemode: boolean
          _partner_id: string
          _payment_id: string
          _reference: string
          _type: string
        }
        Returns: Json
      }
      care_read: {
        Args: {
          _filter?: string
          _org?: string
          _page?: number
          _query?: string
        }
        Returns: Json
      }
      care_reconciliation: {
        Args: { _export?: boolean; _org?: string }
        Returns: Json
      }
      care_record_period: {
        Args: {
          _end: string
          _membership: string
          _payment?: string
          _plan_version: string
          _start: string
        }
        Returns: string
      }
      care_refresh: { Args: { _p: string }; Returns: number }
      care_require_strong: { Args: never; Returns: undefined }
      care_revoke_relationship: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      care_reward_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_rewards_available: { Args: { _p: string }; Returns: number }
      care_service_version_command: {
        Args: { _args: Json; _op: string }
        Returns: Json
      }
      care_settle: {
        Args: {
          _actor: string
          _evidence: string
          _id: string
          _provider: string
          _ref: string
        }
        Returns: Json
      }
      care_settle_historical_order: {
        Args: { _evidence: string; _id: string; _reference: string }
        Returns: Json
      }
      care_super: { Args: { _u: string }; Returns: boolean }
      care_support_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      care_video_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      certificate_command: {
        Args: { _args: Json; _id: string; _key: string; _op: string }
        Returns: Json
      }
      certificate_file_read: {
        Args: { _path: string; _u: string }
        Returns: boolean
      }
      certificate_read: { Args: { _id: string; _u: string }; Returns: boolean }
      certificate_scope: {
        Args: { _mode: string; _request: string; _u: string }
        Returns: boolean
      }
      claim_patient_record: {
        Args: { _external_patient_id: string }
        Returns: {
          auth_user_id: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type"]
          date_of_birth: string | null
          email: string | null
          external_patient_id: string
          first_name: string
          gender: string | null
          hn: string | null
          id: string
          last_name: string
          line_user_id: string | null
          marketing_consent: boolean
          mcs_patient_id: string | null
          notes: string | null
          notify_email: boolean
          notify_line: boolean
          notify_whatsapp: boolean
          partner_id: string | null
          phone_number: string | null
          preferred_language: string
          service_reminder_consent: boolean
          updated_at: string
          whatsapp_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consultation_request_access: {
        Args: { _id: string; _u: string }
        Returns: boolean
      }
      consultation_request_command: {
        Args: { _args: Json; _id: string; _key: string; _op: string }
        Returns: Json
      }
      consultation_request_doctor: {
        Args: { _branch: string; _doctor: string; _org: string }
        Returns: boolean
      }
      consultation_request_event: {
        Args: {
          _from: string
          _id: string
          _key: string
          _reason: string
          _to: string
        }
        Returns: undefined
      }
      consultation_request_ready: {
        Args: { _doctor: string; _intake: string; _submitted?: boolean }
        Returns: undefined
      }
      content_approval_console: { Args: never; Returns: Json }
      content_approval_record: {
        Args: {
          _action: string
          _canonical: string
          _category: string
          _date: string
          _lineage: string
          _owner: string
          _ref: string
          _reviewer: string
          _status: string
          _surface: string
        }
        Returns: Json
      }
      content_approval_review: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      content_review_ack: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: Json
      }
      content_review_console: { Args: never; Returns: Json }
      content_review_record: {
        Args: {
          _date: string
          _lineage: string
          _next: string
          _owner: string
          _reason: string
          _ref: string
          _reviewer: string
          _route: string
          _scope: string
          _status: string
          _type: string
        }
        Returns: Json
      }
      content_unsafe: { Args: { _t: string }; Returns: boolean }
      decision_pack_console: { Args: never; Returns: Json }
      decision_pack_sign: { Args: { _outcome: string }; Returns: Json }
      doctor_assignment_visible: {
        Args: { _doctor: string; _u: string }
        Returns: boolean
      }
      doctor_command: {
        Args: { _args?: Json; _id?: string; _op: string }
        Returns: Json
      }
      doctor_is_self: {
        Args: { _doctor: string; _u: string }
        Returns: boolean
      }
      evidence_inspector: { Args: never; Returns: Json }
      evidence_inspector_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      evidence_inspector_record: {
        Args: {
          _action: string
          _blocker: string
          _date: string
          _expected: string
          _lineage: string
          _observed: string
          _owner: string
          _ref: string
          _register: string
          _reviewer: string
          _rule: string
        }
        Returns: Json
      }
      fin_adjustment_state: { Args: { _id: string }; Returns: string }
      fin_anomalies: { Args: { _l: string; _p: string }; Returns: Json }
      fin_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      fin_console: {
        Args: { _l?: string; _mode: string; _p?: string }
        Returns: Json
      }
      fin_ledger: {
        Args: { _p: string }
        Returns: {
          action: string
          at: string
          correlation_id: string
          delta: number
          id: string
          location_id: string
          quantity: number
          request_id: string
          source: string
          source_id: string
        }[]
      }
      fin_movements: {
        Args: { _p: string }
        Returns: {
          action: string
          at: string
          correlation_id: string
          delta: number
          id: string
          location_id: string
          quantity: number
          request_id: string
          source: string
          source_id: string
        }[]
      }
      fin_period_report: {
        Args: { _from: string; _l?: string; _p: string; _to: string }
        Returns: Json
      }
      fin_report: {
        Args: { _from: string; _l: string; _p: string; _to: string }
        Returns: Json
      }
      fin_scope: {
        Args: { _l: string; _p: string; _u: string }
        Returns: boolean
      }
      get_my_patient_portal: { Args: never; Returns: Json }
      golive_evidence_matrix_console: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      human_packet_console: { Args: never; Returns: Json }
      human_packet_decide: {
        Args: { _decision: string; _reason: string; _version: number }
        Returns: Json
      }
      human_packet_open: { Args: never; Returns: Json }
      human_packet_role: { Args: { _u: string }; Returns: string }
      human_packet_state: { Args: never; Returns: Json }
      human_review_console: { Args: never; Returns: Json }
      human_review_decide: {
        Args: { _decision: string; _reason: string }
        Returns: Json
      }
      human_review_open_round: { Args: never; Returns: Json }
      human_review_status: { Args: { _round: number }; Returns: string }
      incident_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      incident_console: { Args: never; Returns: Json }
      incident_record: {
        Args: {
          _action: string
          _blocker: string
          _class: string
          _date: string
          _environment: string
          _lineage: string
          _owner: string
          _ref: string
          _reviewer: string
          _scope: string
          _severity: string
          _status: string
          _stop: string
          _trigger: string
        }
        Returns: Json
      }
      integration_safety_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      integration_safety_console: { Args: never; Returns: Json }
      integration_safety_record: {
        Args: {
          _action: string
          _blocker: string
          _capability: string
          _category: string
          _date: string
          _environment: string
          _lineage: string
          _owner: string
          _ref: string
          _reviewer: string
          _status: string
        }
        Returns: Json
      }
      is_active_doctor: { Args: { _user_id: string }; Returns: boolean }
      is_own_booking: {
        Args: { _booking_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_staff: { Args: { _user_id: string }; Returns: boolean }
      is_self_therapist: {
        Args: { _therapist_id: string; _user_id: string }
        Returns: boolean
      }
      launch_control_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      launch_control_console: { Args: never; Returns: Json }
      launch_control_record: {
        Args: {
          _action: string
          _blocker: string
          _candidate: string
          _date: string
          _environment: string
          _group: string
          _lineage: string
          _owner: string
          _phase: string
          _ref: string
          _reviewer: string
          _status: string
          _trigger: string
          _window: string
        }
        Returns: Json
      }
      location_partner: { Args: { _location_id: string }; Returns: string }
      mcs_handoff_access: {
        Args: { _id: string; _u: string }
        Returns: boolean
      }
      mcs_handoff_command: {
        Args: { _args: Json; _id: string; _key: string; _op: string }
        Returns: Json
      }
      mcs_handoff_event: {
        Args: {
          _from: string
          _id: string
          _key: string
          _reason: string
          _to: string
        }
        Returns: undefined
      }
      mcs_handoff_packet: { Args: { _request: string }; Returns: Json }
      notification_admin: { Args: { _p: string; _u: string }; Returns: boolean }
      notification_center: {
        Args: { _manage?: boolean; _status?: string; _unread?: boolean }
        Returns: Json
      }
      notification_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      notification_enqueue: {
        Args: {
          _correlation: string
          _event: string
          _event_id: string
          _id: string
          _kind: string
          _l: string
          _p: string
          _previous: string
          _state: string
        }
        Returns: number
      }
      notification_sla_scan: { Args: never; Returns: Json }
      notification_source_access: {
        Args: { _id: string; _kind: string; _l: string; _p: string; _u: string }
        Returns: boolean
      }
      notification_template: { Args: { _event: string }; Returns: Json }
      notification_visible: {
        Args: {
          _n: Database["public"]["Tables"]["operational_notifications"]["Row"]
          _u: string
        }
        Returns: boolean
      }
      operations_audit_hash: {
        Args: { a: Database["public"]["Tables"]["audit_log"]["Row"] }
        Returns: string
      }
      operations_console: {
        Args: { _filters?: Json; _mode: string }
        Returns: Json
      }
      operations_safe_summary: { Args: { v: Json }; Returns: Json }
      owner_action_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      owner_action_console: { Args: never; Returns: Json }
      owner_action_record: {
        Args: { _due: string; _evidence: string; _key: string; _status: string }
        Returns: Json
      }
      owner_closure_catalog: {
        Args: never
        Returns: {
          artifacts: string[]
          checklists: string[]
          checks: string[]
          dependencies: string[]
          key: string
          label: string
          owner_actions: string[]
        }[]
      }
      owner_closure_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      owner_closure_console: { Args: never; Returns: Json }
      owner_closure_evidence: { Args: { _key: string }; Returns: Json }
      owner_closure_record_version: {
        Args: {
          _evidence: string
          _key: string
          _next: string
          _reason: string
          _status: string
          _version: number
        }
        Returns: Json
      }
      owner_closure_source_gate: { Args: { _key: string }; Returns: boolean }
      owner_closure_valid: { Args: { _key: string }; Returns: boolean }
      owner_signoff_readiness_console: { Args: never; Returns: Json }
      partner_application_access: {
        Args: { _id: string; _u: string }
        Returns: boolean
      }
      partner_application_command: {
        Args: { _args?: Json; _id?: string; _op: string }
        Returns: Json
      }
      partner_customer_enrolled: { Args: { _id: string }; Returns: boolean }
      partner_customer_read: {
        Args: { _patient: string; _u: string }
        Returns: boolean
      }
      partner_customer_write: {
        Args: { _l: string; _p: string; _u: string }
        Returns: boolean
      }
      partner_intake_command: {
        Args: { _args?: Json; _id?: string; _op: string }
        Returns: Json
      }
      partner_patient_case: {
        Args: { _p: string; _u: string }
        Returns: boolean
      }
      partner_review_scope: {
        Args: { _p: string; _u: string }
        Returns: boolean
      }
      partner_screening_editor: {
        Args: { _p: string; _u: string }
        Returns: boolean
      }
      partner_workspace_enabled: { Args: { _p: string }; Returns: boolean }
      plan_partner: { Args: { _plan_id: string }; Returns: string }
      privacy_blocked: {
        Args: { _patient: string; _purpose: string }
        Returns: boolean
      }
      privacy_center: { Args: { _mode?: string }; Returns: Json }
      privacy_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      privacy_customer_display: { Args: { _patient: string }; Returns: Json }
      privacy_identity_visible: {
        Args: { _patient: string; _u: string }
        Returns: boolean
      }
      privacy_inventory: {
        Args: { _u: string }
        Returns: {
          created_at: string
          kind: string
          location_id: string
          partner_id: string
          patient_id: string
          source_id: string
        }[]
      }
      privacy_notification_patient: {
        Args: { _id: string; _kind: string }
        Returns: string
      }
      privacy_policy_scope: {
        Args: { _l: string; _p: string; _u: string }
        Returns: boolean
      }
      privacy_retention: { Args: { _u: string }; Returns: Json }
      privacy_scope: {
        Args: { _l: string; _p: string; _u: string }
        Returns: boolean
      }
      protection_evidence_confirm: {
        Args: { _id: string; _note: string; _outcome: string }
        Returns: Json
      }
      protection_evidence_console: { Args: never; Returns: Json }
      protection_evidence_record: {
        Args: {
          _applied: string
          _env: string
          _history: string
          _lineage: string
          _mig: string
          _next: string
          _owner: string
          _ref: string
          _reviewer: string
          _rls: string
          _status: string
          _storage: string
          _tables: string
        }
        Returns: Json
      }
      protection_unsafe: { Args: { _t: string }; Returns: boolean }
      readiness_decision_console: { Args: never; Returns: Json }
      record_booking_payment: {
        Args: {
          _amount: number
          _booking_id: string
          _channel: Database["public"]["Enums"]["payment_channel"]
          _fee_amount?: number
          _provider_reference?: string
          _reference: string
        }
        Returns: {
          amount: number
          booking_id: string | null
          captured_at: string | null
          channel: Database["public"]["Enums"]["payment_channel"]
          created_at: string
          created_by: string | null
          currency: string
          fee_amount: number
          id: string
          location_id: string | null
          metadata: Json
          partner_id: string
          patient_id: string | null
          provider: string
          provider_reference: string | null
          reference: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_archive_integrity_console: { Args: never; Returns: Json }
      release_banner: { Args: never; Returns: Json }
      release_bundle_capture: {
        Args: { _register: string; _version: number }
        Returns: Json
      }
      release_bundle_catalog: {
        Args: never
        Returns: {
          evidence_label: string
          label: string
          owner_action: string
          register: string
          verification_check: string
        }[]
      }
      release_bundle_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      release_bundle_console: { Args: never; Returns: Json }
      release_bundle_source: { Args: { _register: string }; Returns: Json }
      release_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      release_console: { Args: never; Returns: Json }
      release_drill_console: { Args: never; Returns: Json }
      release_drill_record: {
        Args: {
          _evidence: string
          _expected: string
          _next: string
          _observed: string
          _scenario: string
          _status: string
          _synthetic: boolean
        }
        Returns: Json
      }
      release_effective: { Args: { _s: string }; Returns: string }
      release_evidence_command: {
        Args: { _args: Json; _key: string }
        Returns: Json
      }
      release_evidence_console: { Args: never; Returns: Json }
      release_review_ack: {
        Args: { _item: string; _note: string; _outcome: string }
        Returns: Json
      }
      release_review_console: { Args: never; Returns: Json }
      release_scope: { Args: { _u: string }; Returns: boolean }
      release_smoke: { Args: never; Returns: Json }
      release_unsafe_text: { Args: { _t: string }; Returns: boolean }
      review_handoff_command: {
        Args: {
          _packet: number
          _reason: string
          _recipient: string
          _root: string
          _source: number
          _type: string
        }
        Returns: Json
      }
      review_handoff_console: { Args: never; Returns: Json }
      review_handoff_state: { Args: never; Returns: Json }
      service_partner: { Args: { _service_id: string }; Returns: string }
      session_result_catalog: {
        Args: never
        Returns: {
          artifact: string
          blocker: string
          check_id: string
          expected: string
          ord: number
          suite_key: string
        }[]
      }
      session_result_confirm: {
        Args: { _id: string; _outcome: string; _slot: number }
        Returns: Json
      }
      session_result_console: { Args: never; Returns: Json }
      session_result_passed: { Args: { _record_id: string }; Returns: boolean }
      session_result_record_save: {
        Args: {
          _blocker_reason: string
          _next_action: string
          _result_label: string
          _session: string
          _status: string
          _suite: string
          _version: number
        }
        Returns: Json
      }
      session_start_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      session_start_console: { Args: never; Returns: Json }
      session_start_missing: { Args: never; Returns: string[] }
      session_start_record: {
        Args: {
          _blocker_reason: string
          _next_action: string
          _session: string
          _source_validation_version: number
          _status: string
          _suite_group: string
          _version: number
        }
        Returns: Json
      }
      site_setting_validate: {
        Args: { _key: string; _value: Json }
        Returns: Json
      }
      site_setting_validate_base: {
        Args: { _key: string; _value: Json }
        Returns: Json
      }
      site_settings_read: { Args: { _scope: string }; Returns: Json }
      site_settings_save: {
        Args: { _expected: number; _key: string; _value: Json }
        Returns: Json
      }
      site_settings_scope: { Args: { _scope: string }; Returns: boolean }
      sla_command: {
        Args: { _args: Json; _key: string; _op: string }
        Returns: Json
      }
      sla_console: { Args: { _mode?: string }; Returns: Json }
      sla_elapsed: {
        Args: {
          _close: string
          _days: number[]
          _end: string
          _excluded?: Json
          _mode: string
          _open: string
          _start: string
          _tz: string
        }
        Returns: number
      }
      sla_health: { Args: never; Returns: Json }
      sla_log: {
        Args: {
          _action: string
          _case: string
          _from: string
          _key: string
          _l: string
          _p: string
          _policy: string
          _reason: string
          _to: string
        }
        Returns: undefined
      }
      sla_scan: { Args: { _key: string }; Returns: Json }
      sla_scope: {
        Args: { _l: string; _p: string; _u: string }
        Returns: boolean
      }
      sla_sources: {
        Args: never
        Returns: {
          active: boolean
          id: string
          kind: string
          location_id: string
          partner_id: string
          started_at: string
        }[]
      }
      staff_access_check: { Args: { _scope: string }; Returns: string }
      staff_security_audit: {
        Args: { _action: string; _state: string }
        Returns: undefined
      }
      test_prereq_available: { Args: { _key: string }; Returns: boolean }
      test_prerequisite_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      test_prerequisite_console: { Args: never; Returns: Json }
      test_prerequisite_record: {
        Args: { _due: string; _evidence: string; _key: string; _status: string }
        Returns: Json
      }
      test_session_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      test_session_console: { Args: never; Returns: Json }
      test_session_prereqs: { Args: { _suite: string }; Returns: string[] }
      test_session_record: {
        Args: { _evidence: string; _status: string; _suite: string }
        Returns: Json
      }
      therapist_partner: { Args: { _therapist_id: string }; Returns: string }
      validation_snapshot_confirm: {
        Args: { _id: string; _outcome: string }
        Returns: Json
      }
      validation_snapshot_console: { Args: never; Returns: Json }
      validation_snapshot_record_save: {
        Args: {
          _blocker_reason: string
          _check_key: string
          _count: number
          _evidence_label: string
          _optional_skip: string
          _status: string
          _version: number
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "SUPER_ADMIN"
        | "OPERATIONS_ADMIN"
        | "FINANCE_ADMIN"
        | "COMPLIANCE_AUDITOR"
        | "PARTNER_OWNER"
        | "PARTNER_MANAGER"
        | "PARTNER_STAFF"
        | "DOCTOR"
        | "PATIENT"
        | "THERAPIST"
        | "LOCATION_MANAGER"
        | "HOTEL_PARTNER"
        | "CUSTOMER"
      booking_channel:
        | "WALK_IN"
        | "ONLINE"
        | "PHONE"
        | "HOTEL"
        | "CORPORATE"
        | "PARTNER"
      booking_status:
        | "DRAFT"
        | "CONFIRMED"
        | "CHECKED_IN"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
      commission_basis:
        | "PERCENT_OF_SERVICE"
        | "FIXED_PER_SERVICE"
        | "PERCENT_OF_NET"
      conflict_status: "OPEN" | "RESOLVED"
      consultation_source: "PARTNER" | "PATIENT" | "ADMIN" | "MCS"
      consultation_status:
        | "CREATED"
        | "WAITING"
        | "STARTED"
        | "COMPLETED"
        | "CANCELLED"
        | "FAILED"
        | "NO_SHOW"
      credit_order_status: "PENDING" | "AWAITING_PAYMENT" | "PAID" | "CANCELLED"
      credit_status: "NOT_REQUIRED" | "RESERVED" | "CONSUMED" | "RELEASED"
      credit_txn_type:
        | "PURCHASE"
        | "RESERVE"
        | "CONSUME"
        | "RELEASE"
        | "ADJUSTMENT"
        | "REFUND"
      customer_type: "PATIENT" | "WELLNESS" | "HOTEL_GUEST" | "CORPORATE"
      doctor_status: "PENDING" | "ACTIVE" | "SUSPENDED"
      earning_status: "PENDING" | "APPROVED" | "PAID" | "VOID"
      employment_type: "EMPLOYEE" | "FREELANCE" | "CONTRACT"
      ledger_account_kind:
        | "ASSET"
        | "LIABILITY"
        | "REVENUE"
        | "EXPENSE"
        | "EQUITY"
      location_status: "ACTIVE" | "INACTIVE"
      member_status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED"
      membership_status: "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED"
      notification_channel: "EMAIL" | "WHATSAPP" | "LINE"
      notification_status:
        | "QUEUED"
        | "SENT"
        | "DELIVERED"
        | "FAILED"
        | "SKIPPED"
      partner_status: "PENDING" | "ACTIVE" | "SUSPENDED" | "TERMINATED"
      partner_type: "CLINIC" | "SPA" | "HOTEL" | "CORPORATE"
      payment_channel:
        | "CASH"
        | "CARD"
        | "PROMPTPAY"
        | "BANK_TRANSFER"
        | "HOTEL_FOLIO"
        | "CORPORATE_INVOICE"
        | "ONLINE"
      payment_status:
        | "PENDING"
        | "AUTHORISED"
        | "PAID"
        | "FAILED"
        | "REFUNDED"
        | "PARTIALLY_REFUNDED"
        | "CANCELLED"
      resource_kind: "EQUIPMENT" | "DEVICE" | "BED" | "VEHICLE" | "OTHER"
      service_category:
        | "MASSAGE"
        | "SPA"
        | "AESTHETIC"
        | "MEDICAL"
        | "WELLNESS"
        | "HOME_SERVICE"
      therapist_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      webhook_processing_status:
        | "RECEIVED"
        | "PROCESSING"
        | "PROCESSED"
        | "FAILED"
        | "IGNORED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "SUPER_ADMIN",
        "OPERATIONS_ADMIN",
        "FINANCE_ADMIN",
        "COMPLIANCE_AUDITOR",
        "PARTNER_OWNER",
        "PARTNER_MANAGER",
        "PARTNER_STAFF",
        "DOCTOR",
        "PATIENT",
        "THERAPIST",
        "LOCATION_MANAGER",
        "HOTEL_PARTNER",
        "CUSTOMER",
      ],
      booking_channel: [
        "WALK_IN",
        "ONLINE",
        "PHONE",
        "HOTEL",
        "CORPORATE",
        "PARTNER",
      ],
      booking_status: [
        "DRAFT",
        "CONFIRMED",
        "CHECKED_IN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
      ],
      commission_basis: [
        "PERCENT_OF_SERVICE",
        "FIXED_PER_SERVICE",
        "PERCENT_OF_NET",
      ],
      conflict_status: ["OPEN", "RESOLVED"],
      consultation_source: ["PARTNER", "PATIENT", "ADMIN", "MCS"],
      consultation_status: [
        "CREATED",
        "WAITING",
        "STARTED",
        "COMPLETED",
        "CANCELLED",
        "FAILED",
        "NO_SHOW",
      ],
      credit_order_status: ["PENDING", "AWAITING_PAYMENT", "PAID", "CANCELLED"],
      credit_status: ["NOT_REQUIRED", "RESERVED", "CONSUMED", "RELEASED"],
      credit_txn_type: [
        "PURCHASE",
        "RESERVE",
        "CONSUME",
        "RELEASE",
        "ADJUSTMENT",
        "REFUND",
      ],
      customer_type: ["PATIENT", "WELLNESS", "HOTEL_GUEST", "CORPORATE"],
      doctor_status: ["PENDING", "ACTIVE", "SUSPENDED"],
      earning_status: ["PENDING", "APPROVED", "PAID", "VOID"],
      employment_type: ["EMPLOYEE", "FREELANCE", "CONTRACT"],
      ledger_account_kind: [
        "ASSET",
        "LIABILITY",
        "REVENUE",
        "EXPENSE",
        "EQUITY",
      ],
      location_status: ["ACTIVE", "INACTIVE"],
      member_status: ["INVITED", "ACTIVE", "SUSPENDED", "REMOVED"],
      membership_status: ["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"],
      notification_channel: ["EMAIL", "WHATSAPP", "LINE"],
      notification_status: ["QUEUED", "SENT", "DELIVERED", "FAILED", "SKIPPED"],
      partner_status: ["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"],
      partner_type: ["CLINIC", "SPA", "HOTEL", "CORPORATE"],
      payment_channel: [
        "CASH",
        "CARD",
        "PROMPTPAY",
        "BANK_TRANSFER",
        "HOTEL_FOLIO",
        "CORPORATE_INVOICE",
        "ONLINE",
      ],
      payment_status: [
        "PENDING",
        "AUTHORISED",
        "PAID",
        "FAILED",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
        "CANCELLED",
      ],
      resource_kind: ["EQUIPMENT", "DEVICE", "BED", "VEHICLE", "OTHER"],
      service_category: [
        "MASSAGE",
        "SPA",
        "AESTHETIC",
        "MEDICAL",
        "WELLNESS",
        "HOME_SERVICE",
      ],
      therapist_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      webhook_processing_status: [
        "RECEIVED",
        "PROCESSING",
        "PROCESSED",
        "FAILED",
        "IGNORED",
      ],
    },
  },
} as const
