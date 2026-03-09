-- Admin notifications system
-- Run this in Supabase SQL Editor

-- Table for notifications sent by admin
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE, -- NULL = broadcast to all
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'maintenance')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Table to track read status per user
CREATE TABLE IF NOT EXISTS notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES admin_notifications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  read_at timestamptz DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

-- RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- Users can read notifications targeted to their company or broadcast (company_id IS NULL)
CREATE POLICY "Users can view their notifications"
  ON admin_notifications FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

-- Only service_role can insert notifications (via edge function)
-- No insert policy for regular users

-- Users can read their own read status
CREATE POLICY "Users can view own reads"
  ON notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can mark as read
CREATE POLICY "Users can mark as read"
  ON notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_company ON admin_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification ON notification_reads(notification_id);
