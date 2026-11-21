/*
# Create saved speaker profiles

1. New Tables
- `speaker_profiles` stores named speaker voice signatures for this no-login workspace.
- `name` stores the label shown in the speaker selector.
- `voice_signature` stores a small numeric acoustic signature, never raw audio.
- `created_at` stores when a voice profile was saved.
2. Security
- Row level security is enabled.
- Anonymous and authenticated CRUD is allowed because this prototype has no sign-in and intentionally uses a shared workspace.
3. Privacy
- Only derived numeric voice features are stored; microphone recordings are not uploaded.
*/

CREATE TABLE IF NOT EXISTS public.speaker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  voice_signature jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.speaker_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read speaker profiles" ON public.speaker_profiles;
CREATE POLICY "Public can read speaker profiles"
  ON public.speaker_profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can add speaker profiles" ON public.speaker_profiles;
CREATE POLICY "Public can add speaker profiles"
  ON public.speaker_profiles FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update speaker profiles" ON public.speaker_profiles;
CREATE POLICY "Public can update speaker profiles"
  ON public.speaker_profiles FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete speaker profiles" ON public.speaker_profiles;
CREATE POLICY "Public can delete speaker profiles"
  ON public.speaker_profiles FOR DELETE
  TO anon, authenticated USING (true);
