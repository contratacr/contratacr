-- Migration 018: allow users to delete (dismiss) their own notifications.
-- Required for the per-notification dismiss button in the bell dropdown.
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'Users can delete their notifications'
  ) THEN
    CREATE POLICY "Users can delete their notifications" ON public.notifications
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
