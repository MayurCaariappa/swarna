export type Role = "owner" | "partner";

export interface Profile {
  id: string;
  role: Role | null;
  display_name: string;
  timezone: string;
}

export interface PartnerLink {
  owner_id: string;
  partner_id: string;
  created_at: string;
}

export interface InviteCode {
  code: string;
  owner_id: string;
  expires_at: string;
  used_at: string | null;
}

export interface SharingSettings {
  owner_id: string;
  share_periods: boolean;
  share_pill_status: boolean;
  share_mood: boolean;
  share_energy: boolean;
  share_symptoms: boolean;
  share_sex: boolean;
  share_notes: boolean;
  partner_pill_alert: boolean;
  partner_pill_alert_time: string | null;
  updated_at: string;
}
