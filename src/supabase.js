import { createClient } from '@supabase/supabase-js'

// Ovdje aplikacija čita tvoje tajne ključeve iz .env datoteke
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Stvaramo vezu s bazom
export const supabase = createClient(supabaseUrl, supabaseAnonKey)