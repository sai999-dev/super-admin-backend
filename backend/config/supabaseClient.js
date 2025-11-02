const { createClient } = require('@supabase/supabase-js');

// Prefer environment configuration, with sensible fallbacks for development
const supabaseUrl =
	process.env.SUPABASE_URL_LIVE ||
	process.env.SUPABASE_URL ||
	'https://ioqjonxjptvshdwhbuzv.supabase.co';

const supabaseServiceKey =
	process.env.SUPABASE_SERVICE_ROLE_KEY_LIVE ||
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvcWpvbnhqcHR2c2hkd2hidXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ4MzQyNSwiZXhwIjoyMDc3MDU5NDI1fQ.ncz4UBVevblo9BGNhSezwYGpFopuyyhfYahtd__2eIs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;
