/**
 * Vercel Edge Middleware — protect /admin at the edge before any HTML is served.
 *
 * Flow:
 *  • /admin?code=…  → forward to /admin-login so the Supabase PKCE code is
 *                     exchanged there and the cookie is set before entering admin.
 *  • /admin (no cookie, or expired JWT)  → redirect to /admin-login
 *  • /admin (valid phd_auth cookie)      → let through; Vercel rewrite serves admin.html
 */

export const config = { matcher: '/admin' }

function getCookie(request, name) {
  const header = request.headers.get('cookie') || ''
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

function jwtValid(token) {
  if (!token) return false
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return payload.exp > Date.now() / 1000        // not yet expired
  } catch (_) {
    return false
  }
}

export default function middleware(request) {
  const url = new URL(request.url)

  // PKCE magic-link callback lands here as /admin?code=…
  // Forward to admin-login so it can exchange the code and set the cookie.
  if (url.searchParams.has('code')) {
    const dest = new URL('/admin-login', request.url)
    dest.search = url.search          // preserve ?code=…
    return Response.redirect(dest, 302)
  }

  const token = getCookie(request, 'phd_auth')
  if (!jwtValid(token)) {
    return Response.redirect(new URL('/admin-login', request.url), 302)
  }

  // Valid — let Vercel's normal routing serve admin.html
}
