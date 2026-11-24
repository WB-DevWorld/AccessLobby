import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccessToken, identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { isExternalConnectionPreviewEnabled } from '@/lib/features';
import { connectionAction } from '@/lib/external-connections';

export async function POST(request: NextRequest) {
  if (!isExternalConnectionPreviewEnabled()) return new NextResponse('Not found', { status: 404 });
  if (request.headers.get('origin') !== origin()) return new NextResponse('Origin rejected', { status: 403 });
  if (!await getCurrentAccessToken()) return NextResponse.redirect(new URL('/auth/login', origin()), 303);
  const action = connectionAction(await request.formData());
  if (!action) return new NextResponse('Invalid connection action', { status: 400 });
  let notice = action.notice;
  try {
    const response = await identityApi(action.path, { method: action.method, ...('body' in action ? { body: action.body } : {}) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      notice = error.error === 'external_review_required' ? 'external_review_required' : 'unavailable';
    }
  } catch { notice = 'unavailable'; }
  return NextResponse.redirect(new URL(`/connections?notice=${encodeURIComponent(notice)}`, origin()), 303);
}
