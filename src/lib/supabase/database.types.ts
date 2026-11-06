
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "private": {
          Tables: {
            "domain_events": {
                  Row: {
                    "aggregate_id": string,"aggregate_type": string,"created_at": string,"dedupe_key": string,"event_type": string,"id": string,"payload": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aggregate_id": string,"aggregate_type": string,"created_at"?: string,"dedupe_key": string,"event_type": string,"id"?: string,"payload"?: NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "aggregate_id"?: string,"aggregate_type"?: string,"created_at"?: string,"dedupe_key"?: string,"event_type"?: string,"id"?: string,"payload"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"external_lead_refs": {
                  Row: {
                    "account_id": string | null,"contact_id": string | null,"created_at": string,"deal_id": string | null,"id": string,"outcome": string,"result": NonNullable<Json>,"source": string,"source_record_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"outcome": string,"result"?: NonNullable<Json>,"source": string,"source_record_id": string,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"contact_id"?: string | null,"created_at"?: string,"deal_id"?: string | null,"id"?: string,"outcome"?: string,"result"?: NonNullable<Json>,"source"?: string,"source_record_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"import_review_items": {
                  Row: {
                    "created_at": string,"id": string,"inbound_event_id": string,"payload": NonNullable<Json>,"reason": string,"resolved_at": string | null,"status": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"inbound_event_id": string,"payload": NonNullable<Json>,"reason": string,"resolved_at"?: string | null,"status"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"inbound_event_id"?: string,"payload"?: NonNullable<Json>,"reason"?: string,"resolved_at"?: string | null,"status"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_review_items_inbound_event_id_fkey"
      columns: ["inbound_event_id"]
isOneToOne: false
      referencedRelation: "inbound_events"
      referencedColumns: ["id"]
    }
                  ]
                },"inbound_events": {
                  Row: {
                    "connection_id": string | null,"event_id": string,"id": string,"payload_hash": string,"provider": string,"received_at": string,"result": NonNullable<Json>,"status": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id"?: string | null,"event_id": string,"id"?: string,"payload_hash": string,"provider": string,"received_at"?: string,"result"?: NonNullable<Json>,"status": string,"workspace_id"?: string | null
                  }
                  Update: {
                    "connection_id"?: string | null,"event_id"?: string,"id"?: string,"payload_hash"?: string,"provider"?: string,"received_at"?: string,"result"?: NonNullable<Json>,"status"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inbound_events_connection_id_fkey"
      columns: ["connection_id"]
isOneToOne: false
      referencedRelation: "integration_connections"
      referencedColumns: ["id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "created_at": string,"cursor": NonNullable<Json>,"enabled": boolean,"external_account_email": string | null,"id": string,"label": string,"last_error": string | null,"last_success_at": string | null,"owner_user_id": string | null,"provider": string,"secret_ref": string,"status": string,"updated_at": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"cursor"?: NonNullable<Json>,"enabled"?: boolean,"external_account_email"?: string | null,"id"?: string,"label"?: string,"last_error"?: string | null,"last_success_at"?: string | null,"owner_user_id"?: string | null,"provider": string,"secret_ref": string,"status"?: string,"updated_at"?: string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"cursor"?: NonNullable<Json>,"enabled"?: boolean,"external_account_email"?: string | null,"id"?: string,"label"?: string,"last_error"?: string | null,"last_success_at"?: string | null,"owner_user_id"?: string | null,"provider"?: string,"secret_ref"?: string,"status"?: string,"updated_at"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"job_queue": {
                  Row: {
                    "attempts": number,"created_at": string,"dedupe_key": string | null,"id": string,"job_type": string,"last_error": string | null,"locked_until": string | null,"payload": NonNullable<Json>,"run_after": string,"status": string,"updated_at": string,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"job_type": string,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string,"workspace_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"dedupe_key"?: string | null,"id"?: string,"job_type"?: string,"last_error"?: string | null,"locked_until"?: string | null,"payload"?: NonNullable<Json>,"run_after"?: string,"status"?: string,"updated_at"?: string,"workspace_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"job_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"job_id": string | null,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job_id"?: string | null,"started_at"?: string,"status": string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job_id"?: string | null,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_runs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "job_queue"
      referencedColumns: ["id"]
    }
                  ]
                },"push_deliveries": {
                  Row: {
                    "attempts": number,"created_at": string,"error": string | null,"id": string,"notification_id": string | null,"provider_code": number | null,"status": string,"subscription_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"id"?: string,"notification_id"?: string | null,"provider_code"?: number | null,"status": string,"subscription_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error"?: string | null,"id"?: string,"notification_id"?: string | null,"provider_code"?: number | null,"status"?: string,"subscription_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"worker_ticks": {
                  Row: {
                    "claimed": number,"detail": string | null,"finished_at": string | null,"id": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed"?: number,"detail"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "claimed"?: number,"detail"?: string | null,"finished_at"?: string | null,"id"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abandon_document_upload":
{ Args: { "p_actor_user_id": string,"p_document_id": string }; Returns: string
                           },
"accept_fathom_delivery":
{ Args: { "p_connection_id": string,"p_event_id": string,"p_job_payload": Json,"p_payload_hash": string,"p_recording_id": string }; Returns: Json
                           },
"add_contact":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_confirm_duplicate"?: boolean,"p_email": string,"p_full_name": string,"p_is_primary": boolean,"p_job_title": string,"p_phone": string }; Returns: Json
                           },
"add_deal":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_owner_user_id": string,"p_primary_contact_id": string,"p_product_type": string,"p_title": string }; Returns: string
                           },
"add_meeting_note":
{ Args: { "p_actor_user_id": string,"p_body": string,"p_meeting_id": string }; Returns: string
                           },
"add_note":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_body": string,"p_deal_id": string }; Returns: string
                           },
"add_task":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_assignee_ids": (string)[],"p_deal_id": string,"p_due_on": string,"p_title": string }; Returns: string
                           },
"assert_server_role":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"assign_deal_owner":
{ Args: { "p_actor_user_id": string,"p_deal_id": string,"p_expected_version": number,"p_owner_user_id": string }; Returns: undefined
                           },
"attach_document_link":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_deal_id": string,"p_deployment_id"?: string,"p_document_id": string }; Returns: string
                           },
"attach_meeting_link":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_deal_id": string,"p_meeting_id": string }; Returns: string
                           },
"begin_document_delete":
{ Args: { "p_actor_user_id": string,"p_document_id": string }; Returns: string
                           },
"begin_document_upload":
{ Args: { "p_account_id"?: string,"p_actor_user_id": string,"p_category"?: string,"p_deal_id"?: string,"p_deployment_id"?: string,"p_mime_type": string,"p_original_name": string,"p_size_bytes": number }; Returns: Json
                           },
"blank_to_null":
{ Args: { "p_value": string }; Returns: string
                           },
"build_morning_digest":
{ Args: { "p_at": string,"p_job_id": string }; Returns: Json
                           },
"catch_up_account_worker":
{ Args: { "p_account_id": string }; Returns: number
                           },
"catch_up_due_revenue":
{ Args: { "p_account_id": string,"p_actor_user_id": string }; Returns: number
                           },
"change_deal_stage":
{ Args: { "p_actor_user_id": string,"p_deal_id": string,"p_expected_version": number,"p_lost_reason"?: string,"p_stage": string }; Returns: undefined
                           },
"claim_worker_jobs":
{ Args: { "p_lease_seconds": number,"p_limit": number }; Returns: {
              "attempts": number,
"created_at": string,
"dedupe_key": string | null,
"id": string,
"job_type": string,
"last_error": string | null,
"locked_until": string | null,
"payload": NonNullable<Json>,
"run_after": string,
"status": string,
"updated_at": string,
"workspace_id": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "job_queue"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_document_upload":
{ Args: { "p_actor_user_id": string,"p_document_id": string,"p_mime_type": string,"p_size_bytes": number }; Returns: string
                           },
"complete_task":
{ Args: { "p_actor_user_id": string,"p_expected_version": number,"p_task_id": string }; Returns: string
                           },
"correct_revenue_entry":
{ Args: { "p_actor_user_id": string,"p_entry_id": string,"p_reason": string }; Returns: string
                           },
"create_manual_lead":
{ Args: { "p_actor_user_id": string,"p_company_name": string,"p_confirm_duplicate"?: boolean,"p_email": string,"p_full_name": string,"p_owner_user_id": string,"p_phone": string,"p_product_type": string,"p_title": string }; Returns: Json
                           },
"create_push_test":
{ Args: { "p_actor_user_id": string }; Returns: string
                           },
"dashboard_snapshot":
{ Args: { "p_actor_user_id": string,"p_from": string,"p_owner_user_id": string,"p_source": string,"p_to": string }; Returns: Json
                           },
"deactivate_installation":
{ Args: { "p_actor_user_id": string,"p_installation_id": string }; Returns: number
                           },
"detach_document_link":
{ Args: { "p_actor_user_id": string,"p_document_id": string,"p_link_id": string }; Returns: string
                           },
"detach_meeting_link":
{ Args: { "p_actor_user_id": string,"p_link_id": string,"p_meeting_id": string }; Returns: undefined
                           },
"digest_is_due":
{ Args: { "p_at": string,"p_hour": number }; Returns: boolean
                           },
"digest_is_late":
{ Args: { "p_at": string,"p_hour": number }; Returns: boolean
                           },
"digest_title":
{ Args: { "p_count": number }; Returns: string
                           },
"document_mime_allowed":
{ Args: { "p_allowed": (string)[],"p_mime": string }; Returns: boolean
                           },
"email_is_valid":
{ Args: { "p_email": string }; Returns: boolean
                           },
"end_subscription":
{ Args: { "p_actor_user_id": string,"p_agreement_id": string,"p_ends_on_exclusive": string,"p_expected_version": number }; Returns: undefined
                           },
"enqueue_worker_jobs":
{ Args: { "p_at": string }; Returns: Json
                           },
"ensure_fathom_connection":
{ Args: { "p_actor_user_id": string,"p_label": string,"p_secret_ref": string }; Returns: string
                           },
"fail_document_upload":
{ Args: { "p_actor_user_id": string,"p_document_id": string }; Returns: string
                           },
"fathom_recording_url":
{ Args: { "p_url": string }; Returns: string
                           },
"finalize_deal":
{ Args: { "p_actor_user_id": string,"p_as_of"?: string,"p_deal_id": string,"p_expected_version": number,"p_monthly_amount_cents": number,"p_setup_amount_cents": number,"p_setup_on": string,"p_subscription_ends_on"?: string,"p_subscription_starts_on"?: string }; Returns: Json
                           },
"finish_document_delete":
{ Args: { "p_actor_user_id": string,"p_document_id": string }; Returns: string
                           },
"finish_fathom_delivery":
{ Args: { "p_error": string,"p_event_id": string,"p_job_id": string,"p_ok": boolean }; Returns: undefined
                           },
"finish_worker_job":
{ Args: { "p_error": string,"p_job_id": string,"p_ok": boolean }; Returns: undefined
                           },
"finish_worker_tick":
{ Args: { "p_claimed": number,"p_detail": string,"p_status": string,"p_tick_id": string }; Returns: undefined
                           },
"follow_up_due_on":
{ Args: { "p_at": string,"p_window_end": string,"p_window_start": string }; Returns: string
                           },
"generate_due_revenue":
{ Args: { "p_agreement_id": string,"p_as_of"?: string }; Returns: number
                           },
"import_lead":
{ Args: { "p_email": string,"p_event_id": string,"p_full_name": string,"p_is_test"?: boolean,"p_payload_hash": string,"p_phone": string,"p_source": string,"p_source_record_id": string,"p_workspace_id": string }; Returns: Json
                           },
"is_active_member":
{ Args: { "p_workspace_id": string }; Returns: boolean
                           },
"list_period_revenue":
{ Args: { "p_actor_user_id": string,"p_from": string,"p_kind": string,"p_limit": number,"p_offset": number,"p_owner_user_id": string,"p_to": string }; Returns: Json
                           },
"list_stale_document_uploads":
{ Args: { "p_actor_user_id": string,"p_older_than": string }; Returns: {
              "id": string,"storage_path": string
            }[]
                           },
"mark_notifications_read":
{ Args: { "p_actor_user_id": string,"p_notification_id": string }; Returns: number
                           },
"matching_contact_ids":
{ Args: { "p_email": string,"p_except_contact_id"?: string,"p_phone": string,"p_workspace_id": string }; Returns: (string)[]
                           },
"merge_accounts":
{ Args: { "p_actor_user_id": string,"p_keep_company_from": string,"p_keep_display_from": string,"p_keep_kind_from": string,"p_source_id": string,"p_source_version": number,"p_target_id": string,"p_target_version": number }; Returns: undefined
                           },
"normalize_email":
{ Args: { "p_email": string }; Returns: string
                           },
"normalize_phone":
{ Args: { "p_phone": string }; Returns: string
                           },
"note_integration_receipt":
{ Args: { "p_error": string,"p_ok": boolean,"p_provider": string,"p_secret_ref": string,"p_workspace_id": string }; Returns: undefined
                           },
"note_push_result":
{ Args: { "p_code": number,"p_error": string,"p_notification_id": string,"p_status": string,"p_subscription_id": string }; Returns: undefined
                           },
"period_revenue_filtered":
{ Args: { "p_from": string,"p_kind": string,"p_to": string,"p_workspace_id": string }; Returns: {
              "account_id": string,"amount_signed_cents": number,"component": string,"deal_id": string,"effective_on": string,"entry_type": string,"id": string,"reason": string
            }[]
                           },
"prepare_contact_channels":
{ Args: { "p_email": string,"p_phone": string }; Returns: Record<string, unknown>
                           },
"record_contact_outcome":
{ Args: { "p_action_key": string,"p_actor_user_id": string,"p_deal_id": string,"p_due_on": string,"p_outcome": string,"p_summary": string }; Returns: Json
                           },
"record_domain_event":
{ Args: { "p_aggregate_id": string,"p_aggregate_type": string,"p_dedupe_key": string,"p_event_type": string,"p_payload": Json,"p_workspace_id": string }; Returns: undefined
                           },
"record_follow_up":
{ Args: { "p_action_key": string,"p_actor_user_id": string,"p_deal_id": string,"p_due_on": string }; Returns: Json
                           },
"record_no_answer":
{ Args: { "p_action_key": string,"p_actor_user_id": string,"p_deal_id": string,"p_due_on": string }; Returns: Json
                           },
"release_expired_jobs":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"replace_revenue_entry":
{ Args: { "p_actor_user_id": string,"p_amount_cents": number,"p_entry_id": string,"p_reason": string }; Returns: string
                           },
"requeue_dead_jobs":
{ Args: { "p_actor_user_id": string }; Returns: number
                           },
"require_active_member":
{ Args: { "p_actor_user_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"reset_fathom_content_attempts":
{ Args: { "p_actor_user_id": string,"p_meeting_id": string }; Returns: undefined
                           },
"resolve_follow_up_due_on":
{ Args: { "p_at"?: string,"p_workspace_id": string }; Returns: string
                           },
"resolve_import_review":
{ Args: { "p_account_id"?: string,"p_action": string,"p_actor_user_id": string,"p_deal_id"?: string,"p_review_id": string }; Returns: undefined
                           },
"revenue_component":
{ Args: { "p_entry_type": string,"p_reversed_type": string }; Returns: string
                           },
"revert_deal_finalization":
{ Args: { "p_actor_user_id": string,"p_deal_id": string,"p_expected_version": number,"p_lost_reason"?: string,"p_target_stage": string }; Returns: undefined
                           },
"revise_subscription_amount":
{ Args: { "p_actor_user_id": string,"p_agreement_id": string,"p_expected_version": number,"p_from_cycle_index": number,"p_new_amount_cents": number }; Returns: string
                           },
"save_account_dossier":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_implementation_notes"?: string,"p_integration_docs_status"?: string,"p_integration_notes"?: string,"p_integration_systems"?: string,"p_section": string }; Returns: undefined
                           } |
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_implementation_due_on"?: string,"p_implementation_notes"?: string,"p_implementation_stage"?: string,"p_integration_docs_status"?: string,"p_integration_notes"?: string,"p_integration_systems"?: string,"p_section": string }; Returns: undefined
                           },
"save_fathom_cursor":
{ Args: { "p_actor_user_id": string,"p_connection_id": string,"p_cursor": Json,"p_error": string,"p_ok": boolean }; Returns: undefined
                           },
"save_push_subscription":
{ Args: { "p_actor_user_id": string,"p_auth_secret": string,"p_device_label": string,"p_endpoint": string,"p_installation_id": string,"p_p256dh": string }; Returns: string
                           },
"save_task":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_assignee_ids": (string)[],"p_deal_id": string,"p_deployment_id": string,"p_description": string,"p_due_on": string,"p_due_time": string,"p_expected_version": number,"p_priority": string,"p_status": string,"p_task_id": string,"p_title": string }; Returns: string
                           },
"set_archived":
{ Args: { "p_actor_user_id": string,"p_archived": boolean,"p_entity": string,"p_expected_version": number,"p_id": string }; Returns: undefined
                           },
"set_fathom_account_email":
{ Args: { "p_actor_user_id": string,"p_connection_id": string,"p_email": string }; Returns: undefined
                           },
"set_fathom_poll_minutes":
{ Args: { "p_actor_user_id": string,"p_minutes": number }; Returns: undefined
                           },
"set_morning_digest_enabled":
{ Args: { "p_actor_user_id": string,"p_enabled": boolean }; Returns: undefined
                           },
"start_worker_tick":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"subscription_cycle_date":
{ Args: { "p_anchor_day": number,"p_cycle_index": number,"p_starts_on": string }; Returns: string
                           },
"update_account":
{ Args: { "p_account_id": string,"p_actor_user_id": string,"p_address": string,"p_company_name": string,"p_display_name": string,"p_expected_version": number,"p_kind": string,"p_nip": string,"p_service_status": string,"p_website": string }; Returns: undefined
                           },
"update_contact":
{ Args: { "p_actor_user_id": string,"p_confirm_duplicate"?: boolean,"p_contact_id": string,"p_email": string,"p_expected_version": number,"p_full_name": string,"p_is_primary": boolean,"p_job_title": string,"p_phone": string }; Returns: Json
                           },
"update_deal":
{ Args: { "p_actor_user_id": string,"p_deal_id": string,"p_description": string,"p_expected_version": number,"p_primary_contact_id": string,"p_product_type": string,"p_title": string }; Returns: undefined
                           },
"upsert_fathom_meeting":
{ Args: { "p_action_items": Json,"p_connection_id": string,"p_content_error": string,"p_duration_seconds": number,"p_ended_at": string,"p_has_action_items": boolean,"p_has_participants": boolean,"p_has_summary": boolean,"p_has_transcript": boolean,"p_participants": Json,"p_recorded_by_email": string,"p_recording_id": string,"p_recording_url": string,"p_share_url": string,"p_started_at": string,"p_summary_markdown": string,"p_title": string,"p_transcript": Json }; Returns: Json
                           },
"warsaw_local":
{ Args: { "p_at": string }; Returns: string
                           },
"warsaw_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"worker_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounts": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"company_name": string | null,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"implementation_due_on": string | null,"implementation_notes": string | null,"implementation_stage": string,"integration_docs_status": string,"integration_notes": string | null,"integration_systems": string | null,"kind": string,"latest_note": string | null,"nip": string | null,"relationship": string,"service_status": string,"updated_at": string,"updated_by": string | null,"version": number,"website": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"company_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"implementation_due_on"?: string | null,"implementation_notes"?: string | null,"implementation_stage"?: string,"integration_docs_status"?: string,"integration_notes"?: string | null,"integration_systems"?: string | null,"kind": string,"latest_note"?: string | null,"nip"?: string | null,"relationship": string,"service_status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"website"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"company_name"?: string | null,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"implementation_due_on"?: string | null,"implementation_notes"?: string | null,"implementation_stage"?: string,"integration_docs_status"?: string,"integration_notes"?: string | null,"integration_systems"?: string | null,"kind"?: string,"latest_note"?: string | null,"nip"?: string | null,"relationship"?: string,"service_status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"website"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"activities": {
                  Row: {
                    "account_id": string | null,"action_key": string | null,"activity_type": string,"actor_type": string,"actor_user_id": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"id": string,"meeting_record_id": string | null,"occurred_at": string,"payload": NonNullable<Json>,"task_id": string | null,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"action_key"?: string | null,"activity_type": string,"actor_type": string,"actor_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"id"?: string,"meeting_record_id"?: string | null,"occurred_at"?: string,"payload"?: NonNullable<Json>,"task_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"action_key"?: string | null,"activity_type"?: string,"actor_type"?: string,"actor_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"id"?: string,"meeting_record_id"?: string | null,"occurred_at"?: string,"payload"?: NonNullable<Json>,"task_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_meeting_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "activities_task_fk"
      columns: ["workspace_id","task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"automation_settings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"digest_hour": number,"document_max_bytes": number,"document_mime_types": (string)[],"fathom_poll_interval_minutes": number,"id": string,"no_answer_window_end": string | null,"no_answer_window_start": string | null,"timezone": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"digest_hour"?: number,"document_max_bytes"?: number,"document_mime_types"?: (string)[],"fathom_poll_interval_minutes"?: number,"id"?: string,"no_answer_window_end"?: string | null,"no_answer_window_start"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"digest_hour"?: number,"document_max_bytes"?: number,"document_mime_types"?: (string)[],"fathom_poll_interval_minutes"?: number,"id"?: string,"no_answer_window_end"?: string | null,"no_answer_window_start"?: string | null,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "automation_settings_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"billing_agreements": {
                  Row: {
                    "account_id": string,"agreement_version": number,"amount_gross_cents": number,"anchor_day": number | null,"created_at": string,"created_by": string | null,"currency": string,"deal_id": string,"ends_on_exclusive": string | null,"id": string,"kind": string,"starts_on": string,"status": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"agreement_version"?: number,"amount_gross_cents": number,"anchor_day"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deal_id": string,"ends_on_exclusive"?: string | null,"id"?: string,"kind": string,"starts_on": string,"status": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"agreement_version"?: number,"amount_gross_cents"?: number,"anchor_day"?: number | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deal_id"?: string,"ends_on_exclusive"?: string | null,"id"?: string,"kind"?: string,"starts_on"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "billing_agreements_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "billing_agreements_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "billing_agreements_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "billing_agreements_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"calendar_events": {
                  Row: {
                    "account_id": string | null,"all_day": boolean,"created_at": string,"deal_id": string | null,"description": string | null,"ends_at": string,"external_uid": string | null,"id": string,"location": string | null,"meeting_url": string | null,"source_id": string | null,"starts_at": string,"title": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"all_day"?: boolean,"created_at"?: string,"deal_id"?: string | null,"description"?: string | null,"ends_at": string,"external_uid"?: string | null,"id"?: string,"location"?: string | null,"meeting_url"?: string | null,"source_id"?: string | null,"starts_at": string,"title": string,"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"all_day"?: boolean,"created_at"?: string,"deal_id"?: string | null,"description"?: string | null,"ends_at"?: string,"external_uid"?: string | null,"id"?: string,"location"?: string | null,"meeting_url"?: string | null,"source_id"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_events_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "calendar_events_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "calendar_events_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "calendar_events_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "calendar_events_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "calendar_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"calendar_sources": {
                  Row: {
                    "color": string,"created_at": string,"enabled": boolean,"ical_url": string,"id": string,"label": string,"last_error": string | null,"last_synced_at": string | null,"sync_interval_minutes": number,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"enabled"?: boolean,"ical_url": string,"id"?: string,"label": string,"last_error"?: string | null,"last_synced_at"?: string | null,"sync_interval_minutes"?: number,"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"enabled"?: boolean,"ical_url"?: string,"id"?: string,"label"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"sync_interval_minutes"?: number,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_sources_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"contacts": {
                  Row: {
                    "account_id": string,"archived_at": string | null,"created_at": string,"created_by": string | null,"email": string | null,"email_normalized": string | null,"full_name": string,"id": string,"is_primary": boolean,"job_title": string | null,"phone_e164": string | null,"phone_raw": string | null,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"email_normalized"?: string | null,"full_name": string,"id"?: string,"is_primary"?: boolean,"job_title"?: string | null,"phone_e164"?: string | null,"phone_raw"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"email_normalized"?: string | null,"full_name"?: string,"id"?: string,"is_primary"?: boolean,"job_title"?: string | null,"phone_e164"?: string | null,"phone_raw"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "contacts_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"deal_stage_history": {
                  Row: {
                    "actor_user_id": string | null,"changed_at": string,"created_at": string,"created_by": string | null,"deal_id": string,"from_stage": string | null,"id": string,"to_stage": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"changed_at"?: string,"created_at"?: string,"created_by"?: string | null,"deal_id": string,"from_stage"?: string | null,"id"?: string,"to_stage": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"changed_at"?: string,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string,"from_stage"?: string | null,"id"?: string,"to_stage"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deal_stage_history_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deal_stage_history_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "account_id": string,"archived_at": string | null,"created_at": string,"created_by": string | null,"currency": string,"description": string | null,"expected_close_on": string | null,"id": string,"lost_at": string | null,"lost_reason": string | null,"monthly_amount_gross_cents": number | null,"owner_user_id": string | null,"primary_contact_id": string | null,"product_type": string | null,"setup_amount_gross_cents": number | null,"source": string,"stage": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"won_at": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"expected_close_on"?: string | null,"id"?: string,"lost_at"?: string | null,"lost_reason"?: string | null,"monthly_amount_gross_cents"?: number | null,"owner_user_id"?: string | null,"primary_contact_id"?: string | null,"product_type"?: string | null,"setup_amount_gross_cents"?: number | null,"source": string,"stage": string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"won_at"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string | null,"expected_close_on"?: string | null,"id"?: string,"lost_at"?: string | null,"lost_reason"?: string | null,"monthly_amount_gross_cents"?: number | null,"owner_user_id"?: string | null,"primary_contact_id"?: string | null,"product_type"?: string | null,"setup_amount_gross_cents"?: number | null,"source"?: string,"stage"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"won_at"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deals_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deals_contact_fk"
      columns: ["workspace_id","primary_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"document_links": {
                  Row: {
                    "account_id": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"document_id": string,"id": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"document_id": string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"document_id"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "document_links_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "document_links_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "document_links_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "document_links_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "document_links_document_fk"
      columns: ["workspace_id","document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"mime_type": string,"original_name": string,"size_bytes": number,"status": string,"storage_path": string,"updated_at": string,"updated_by": string | null,"uploaded_by": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"mime_type": string,"original_name": string,"size_bytes": number,"status"?: string,"storage_path": string,"updated_at"?: string,"updated_by"?: string | null,"uploaded_by": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"mime_type"?: string,"original_name"?: string,"size_bytes"?: number,"status"?: string,"storage_path"?: string,"updated_at"?: string,"updated_by"?: string | null,"uploaded_by"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invoices": {
                  Row: {
                    "account_id": string | null,"bank_account": string | null,"buyer_name": string,"buyer_nip": string | null,"created_at": string,"created_by": string | null,"currency": string,"document_id": string | null,"due_date": string | null,"gross_cents": number,"id": string,"invoice_number": string,"issue_date": string,"kind": string,"ksef_reference_number": string | null,"ksef_xml": string | null,"line_items": NonNullable<Json>,"net_cents": number,"notes": string | null,"ocr_confidence": number | null,"ocr_raw_text": string | null,"paid_at": string | null,"payment_method": string,"sale_date": string | null,"seller_name": string,"seller_nip": string | null,"source": string,"status": string,"updated_at": string,"updated_by": string | null,"vat_cents": number,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"bank_account"?: string | null,"buyer_name": string,"buyer_nip"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"document_id"?: string | null,"due_date"?: string | null,"gross_cents"?: number,"id"?: string,"invoice_number": string,"issue_date"?: string,"kind"?: string,"ksef_reference_number"?: string | null,"ksef_xml"?: string | null,"line_items"?: NonNullable<Json>,"net_cents"?: number,"notes"?: string | null,"ocr_confidence"?: number | null,"ocr_raw_text"?: string | null,"paid_at"?: string | null,"payment_method"?: string,"sale_date"?: string | null,"seller_name"?: string,"seller_nip"?: string | null,"source"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_cents"?: number,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"bank_account"?: string | null,"buyer_name"?: string,"buyer_nip"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"document_id"?: string | null,"due_date"?: string | null,"gross_cents"?: number,"id"?: string,"invoice_number"?: string,"issue_date"?: string,"kind"?: string,"ksef_reference_number"?: string | null,"ksef_xml"?: string | null,"line_items"?: NonNullable<Json>,"net_cents"?: number,"notes"?: string | null,"ocr_confidence"?: number | null,"ocr_raw_text"?: string | null,"paid_at"?: string | null,"payment_method"?: string,"sale_date"?: string | null,"seller_name"?: string,"seller_nip"?: string | null,"source"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"vat_cents"?: number,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"ksef_connections": {
                  Row: {
                    "auth_token": string | null,"auto_sync": boolean,"company_name": string,"created_at": string,"created_by": string | null,"enabled": boolean,"environment": string,"id": string,"last_error": string | null,"last_synced_at": string | null,"nip": string,"sync_interval_minutes": number,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_token"?: string | null,"auto_sync"?: boolean,"company_name"?: string,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"environment"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"nip": string,"sync_interval_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "auth_token"?: string | null,"auto_sync"?: boolean,"company_name"?: string,"created_at"?: string,"created_by"?: string | null,"enabled"?: boolean,"environment"?: string,"id"?: string,"last_error"?: string | null,"last_synced_at"?: string | null,"nip"?: string,"sync_interval_minutes"?: number,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ksef_connections_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: true
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"meeting_links": {
                  Row: {
                    "account_id": string,"created_at": string,"created_by": string | null,"deal_id": string | null,"id": string,"meeting_record_id": string,"origin": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"id"?: string,"meeting_record_id": string,"origin"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"id"?: string,"meeting_record_id"?: string,"origin"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_links_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "meeting_links_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "meeting_links_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "meeting_links_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "meeting_links_record_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"meeting_participants": {
                  Row: {
                    "contact_id": string | null,"created_at": string,"created_by": string | null,"display_name": string | null,"email": string | null,"id": string,"matched_user_id": string | null,"meeting_record_id": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"display_name"?: string | null,"email"?: string | null,"id"?: string,"matched_user_id"?: string | null,"meeting_record_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "contact_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"display_name"?: string | null,"email"?: string | null,"id"?: string,"matched_user_id"?: string | null,"meeting_record_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_participants_contact_fk"
      columns: ["workspace_id","contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "meeting_participants_record_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"meeting_records": {
                  Row: {
                    "assignment_mode": string,"content_attempts": number,"content_error": string | null,"content_updated_at": string | null,"created_at": string,"created_by": string | null,"duration_seconds": number | null,"ended_at": string | null,"id": string,"last_synced_at": string | null,"matching_state": string,"provider": string,"provider_action_items": NonNullable<Json>,"recorded_by_email": string | null,"recording_id": string,"recording_url": string | null,"share_url": string | null,"started_at": string,"summary_markdown": string | null,"sync_status": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_mode"?: string,"content_attempts"?: number,"content_error"?: string | null,"content_updated_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_seconds"?: number | null,"ended_at"?: string | null,"id"?: string,"last_synced_at"?: string | null,"matching_state"?: string,"provider"?: string,"provider_action_items"?: NonNullable<Json>,"recorded_by_email"?: string | null,"recording_id": string,"recording_url"?: string | null,"share_url"?: string | null,"started_at": string,"summary_markdown"?: string | null,"sync_status"?: string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "assignment_mode"?: string,"content_attempts"?: number,"content_error"?: string | null,"content_updated_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"duration_seconds"?: number | null,"ended_at"?: string | null,"id"?: string,"last_synced_at"?: string | null,"matching_state"?: string,"provider"?: string,"provider_action_items"?: NonNullable<Json>,"recorded_by_email"?: string | null,"recording_id"?: string,"recording_url"?: string | null,"share_url"?: string | null,"started_at"?: string,"summary_markdown"?: string | null,"sync_status"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meeting_sources": {
                  Row: {
                    "connection_id": string,"created_at": string,"created_by": string | null,"id": string,"meeting_record_id": string,"provider_recording_id": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "connection_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"meeting_record_id": string,"provider_recording_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "connection_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"meeting_record_id"?: string,"provider_recording_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_sources_record_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"meeting_transcript_segments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"meeting_record_id": string,"offset_ms": number | null,"ordinal": number,"segment_text": string,"speaker_email": string | null,"speaker_name": string | null,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"meeting_record_id": string,"offset_ms"?: number | null,"ordinal": number,"segment_text": string,"speaker_email"?: string | null,"speaker_name"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"meeting_record_id"?: string,"offset_ms"?: number | null,"ordinal"?: number,"segment_text"?: string,"speaker_email"?: string | null,"speaker_name"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_segments_record_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"notes": {
                  Row: {
                    "account_id": string | null,"body": string,"created_at": string,"created_by": string,"deal_id": string | null,"id": string,"meeting_record_id": string | null,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"body": string,"created_at"?: string,"created_by": string,"deal_id"?: string | null,"id"?: string,"meeting_record_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"body"?: string,"created_at"?: string,"created_by"?: string,"deal_id"?: string | null,"id"?: string,"meeting_record_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "notes_meeting_fk"
      columns: ["workspace_id","meeting_record_id"]
isOneToOne: false
      referencedRelation: "meeting_records"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "assignment_enabled": boolean | null,"created_at": string,"created_by": string | null,"id": string,"include_overdue": boolean | null,"morning_digest_enabled": boolean,"reminder_enabled": boolean | null,"status_change_enabled": boolean | null,"updated_at": string,"updated_by": string | null,"user_id": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_enabled"?: boolean | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"include_overdue"?: boolean | null,"morning_digest_enabled"?: boolean,"reminder_enabled"?: boolean | null,"status_change_enabled"?: boolean | null,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "assignment_enabled"?: boolean | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"include_overdue"?: boolean | null,"morning_digest_enabled"?: boolean,"reminder_enabled"?: boolean | null,"status_change_enabled"?: boolean | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_preferences_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"event_key": string,"id": string,"kind": string,"read_at": string | null,"recipient_user_id": string,"target_path": string | null,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_key": string,"id"?: string,"kind": string,"read_at"?: string | null,"recipient_user_id": string,"target_path"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"event_key"?: string,"id"?: string,"kind"?: string,"read_at"?: string | null,"recipient_user_id"?: string,"target_path"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_workspace_fk"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"created_by": string | null,"full_name": string,"id": string,"updated_at": string,"updated_by": string | null,"user_id": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name": string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_member_fk"
      columns: ["workspace_id","user_id"]
isOneToOne: true
      referencedRelation: "workspace_members"
      referencedColumns: ["workspace_id","user_id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "active": boolean,"auth_secret": string,"created_at": string,"created_by": string | null,"device_label": string | null,"endpoint": string,"id": string,"installation_id": string | null,"p256dh": string,"updated_at": string,"updated_by": string | null,"user_agent": string | null,"user_id": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"auth_secret": string,"created_at"?: string,"created_by"?: string | null,"device_label"?: string | null,"endpoint": string,"id"?: string,"installation_id"?: string | null,"p256dh": string,"updated_at"?: string,"updated_by"?: string | null,"user_agent"?: string | null,"user_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"auth_secret"?: string,"created_at"?: string,"created_by"?: string | null,"device_label"?: string | null,"endpoint"?: string,"id"?: string,"installation_id"?: string | null,"p256dh"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_agent"?: string | null,"user_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"revenue_entries": {
                  Row: {
                    "account_id": string,"agreement_id": string,"amount_signed_cents": number,"created_at": string,"created_by": string | null,"currency": string,"cycle_index": number | null,"deal_id": string,"dedupe_key": string,"effective_on": string,"entry_type": string,"id": string,"reason": string | null,"reverses_entry_id": string | null,"superseded_at": string | null,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"agreement_id": string,"amount_signed_cents": number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"cycle_index"?: number | null,"deal_id": string,"dedupe_key": string,"effective_on": string,"entry_type": string,"id"?: string,"reason"?: string | null,"reverses_entry_id"?: string | null,"superseded_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string,"agreement_id"?: string,"amount_signed_cents"?: number,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"cycle_index"?: number | null,"deal_id"?: string,"dedupe_key"?: string,"effective_on"?: string,"entry_type"?: string,"id"?: string,"reason"?: string | null,"reverses_entry_id"?: string | null,"superseded_at"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "revenue_entries_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "revenue_entries_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "revenue_entries_agreement_fk"
      columns: ["workspace_id","agreement_id"]
isOneToOne: false
      referencedRelation: "billing_agreements"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "revenue_entries_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "revenue_entries_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "revenue_entries_reverses_fk"
      columns: ["reverses_entry_id"]
isOneToOne: true
      referencedRelation: "revenue_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"task_assignees": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"task_id": string,"updated_at": string,"updated_by": string | null,"user_id": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"task_id": string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"task_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_assignees_task_fk"
      columns: ["workspace_id","task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "account_id": string | null,"archived_at": string | null,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"description": string | null,"due_at": string | null,"due_on": string | null,"id": string,"kind": string,"origin_activity_id": string | null,"priority": string,"status": string,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"archived_at"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"description"?: string | null,"due_at"?: string | null,"due_on"?: string | null,"id"?: string,"kind": string,"origin_activity_id"?: string | null,"priority": string,"status": string,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"archived_at"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"description"?: string | null,"due_at"?: string | null,"due_on"?: string | null,"id"?: string,"kind"?: string,"origin_activity_id"?: string | null,"priority"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_deal_fk"
      columns: ["workspace_id","deal_id"]
isOneToOne: false
      referencedRelation: "lead_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "tasks_origin_activity_fk"
      columns: ["workspace_id","origin_activity_id"]
isOneToOne: false
      referencedRelation: "activities"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"updated_at": string,"updated_by": string | null,"user_id": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"name": string,"timezone": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "client_directory": {
                  Row: {
                    "active_products": string | null,"active_subscription_count": number | null,"archived_at": string | null,"company_name": string | null,"display_name": string,"id": string,"kind": string,"last_activity_at": string | null,"open_deployment_count": number | null,"owner_name": string | null,"primary_contact_name": string | null,"relationship": string,"service_status": string,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                           "active_products"?: never,"active_subscription_count"?: never,"archived_at"?: string | null,"company_name"?: string | null,"display_name"?: string | null,"id"?: string | null,"kind"?: string | null,"last_activity_at"?: never,"open_deployment_count"?: never,"owner_name"?: never,"primary_contact_name"?: never,"relationship"?: string | null,"service_status"?: string | null,"version"?: number | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "active_products"?: never,"active_subscription_count"?: never,"archived_at"?: string | null,"company_name"?: string | null,"display_name"?: string | null,"id"?: string | null,"kind"?: string | null,"last_activity_at"?: never,"open_deployment_count"?: never,"owner_name"?: never,"primary_contact_name"?: never,"relationship"?: string | null,"service_status"?: string | null,"version"?: number | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "accounts_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_directory": {
                  Row: {
                    "account_archived_at": string | null,"account_id": string,"account_kind": string,"account_name": string,"account_relationship": string,"archived_at": string | null,"company_name": string | null,"contact_email": string | null,"contact_name": string | null,"contact_phone": string | null,"created_at": string,"id": string,"last_contact_at": string | null,"lost_at": string | null,"monthly_amount_gross_cents": number | null,"next_follow_up_on": string | null,"owner_name": string | null,"owner_user_id": string | null,"primary_contact_id": string | null,"product_type": string | null,"setup_amount_gross_cents": number | null,"source": string,"stage": string,"title": string,"version": number,"won_at": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "deals_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deals_account_fk"
      columns: ["workspace_id","account_id"]
isOneToOne: false
      referencedRelation: "client_directory"
      referencedColumns: ["workspace_id","id"]
    },{
      foreignKeyName: "deals_contact_fk"
      columns: ["workspace_id","primary_contact_id"]
isOneToOne: false
      referencedRelation: "contacts"
      referencedColumns: ["workspace_id","id"]
    }
                  ]
                }
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "private": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
