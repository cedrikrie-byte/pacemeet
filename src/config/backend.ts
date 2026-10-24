/**
 * Live- oder Demo-Modus.
 * Sind in der Datei .env beide Werte gesetzt, verbindet sich die App mit Supabase.
 * Sonst läuft sie im Demo-Modus mit Beispieldaten im Browser.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const LIVE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
