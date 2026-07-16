import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { serviceClient } from '@/lib/integrations/google';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!));
}

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!apiKey || !from) return NextResponse.json({ skipped: true, reason: 'email_not_configured' });

  const supabase = serviceClient();
  const pending = await supabase.from('notifications').select('*').eq('email_status', 'pending').order('created_at').limit(100);
  if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 500 });
  let delivered = 0; let failed = 0; let skipped = 0;

  for (const notification of pending.data ?? []) {
    if (!notification.user_id) {
      await supabase.from('notifications').update({ email_status: 'skipped' }).eq('id', notification.id);
      skipped += 1; continue;
    }
    const user = await supabase.auth.admin.getUserById(notification.user_id);
    const email = user.data.user?.email;
    if (!email) {
      await supabase.from('notifications').update({ email_status: 'skipped' }).eq('id', notification.id);
      skipped += 1; continue;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        subject: notification.title,
        html: `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:auto"><h1>${escapeHtml(notification.title)}</h1><p>${escapeHtml(notification.body ?? '')}</p><p><a href="${escapeHtml(process.env.NEXT_PUBLIC_APP_URL ?? 'https://luna.gambix.io')}/notifications">Open Luna notifications</a></p><hr><p style="color:#666">Luna by Gambix</p></div>`,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      await supabase.from('notifications').update({ email_status: 'delivered', emailed_at: new Date().toISOString() }).eq('id', notification.id);
      delivered += 1;
    } else {
      await supabase.from('notifications').update({ email_status: 'failed' }).eq('id', notification.id);
      failed += 1;
    }
  }
  return NextResponse.json({ processed: pending.data?.length ?? 0, delivered, failed, skipped });
}
