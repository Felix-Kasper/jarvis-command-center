// Supabase connection.
//
// Production: the publishable key is meant for the browser; the data is protected by
// login + Row Level Security, and the anon role has no table privileges at all
// (see supabase/schema.sql and supabase/security.sql). Never put the secret/service_role key here.
//
// Demo: without Supabase credentials (or with VITE_DEMO=true) the app runs against an
// in-memory demo backend with fictional data, so the public showcase needs no server.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient } from '../demo/client'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

export const isDemo = import.meta.env.VITE_DEMO === 'true' || !(url && key)

export const supabase: SupabaseClient | null = isDemo
  ? (createDemoClient() as unknown as SupabaseClient)
  : createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jarvis-auth', detectSessionInUrl: true },
    })

export const syncConfigured = supabase !== null
