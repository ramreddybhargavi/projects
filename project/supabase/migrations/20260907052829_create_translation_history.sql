/*
# Create translation history (single-tenant)

1. New Tables
- `translation_history` stores translated phrases and the metadata shown in the history panel.
- `source_language` and `target_language` store the selected languages.
- `source_text` and `translated_text` store the original and translated phrases.
- `emotion`, `speaker`, and `style` store the detected voice context and chosen style.
- `created_at` stores when the translation was created.
2. Security
- Row level security is enabled.
- This no-login prototype intentionally permits anonymous and authenticated access because it is a shared workspace.
3. Notes
- The table is additive and safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.translation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_language text NOT NULL,
  target_language text NOT NULL,
  source_text text NOT NULL,
  translated_text text NOT NULL,
  emotion text NOT NULL DEFAULT 'Neutral',
  speaker text NOT NULL DEFAULT 'Speaker 1',
  style text NOT NULL DEFAULT 'Natural',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.translation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read translation history" ON public.translation_history;
CREATE POLICY "Public can read translation history"
  ON public.translation_history FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can add translation history" ON public.translation_history;
CREATE POLICY "Public can add translation history"
  ON public.translation_history FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update translation history" ON public.translation_history;
CREATE POLICY "Public can update translation history"
  ON public.translation_history FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can delete translation history" ON public.translation_history;
CREATE POLICY "Public can delete translation history"
  ON public.translation_history FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS translation_history_created_at_idx
  ON public.translation_history (created_at DESC);
