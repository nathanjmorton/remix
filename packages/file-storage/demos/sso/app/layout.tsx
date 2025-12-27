import type { Remix } from '@remix-run/dom'

import { routes } from './routes.ts'

export function Document({
  title = 'SSO S3 Demo',
  children,
}: {
  title?: string
  children?: Remix.RemixNode
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <style
          innerHTML={`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
          header { background: #232f3e; color: white; padding: 1rem 0; }
          header .container { display: flex; justify-content: space-between; align-items: center; padding-top: 0; padding-bottom: 0; }
          header h1 { font-size: 1.25rem; }
          header a { color: white; text-decoration: none; }
          nav { display: flex; gap: 1rem; align-items: center; }
          nav a { padding: 0.5rem; border-radius: 4px; }
          nav a:hover { background: rgba(255,255,255,0.1); }
          .card { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .btn { display: inline-block; padding: 0.75rem 1.5rem; background: #ff9900; color: #232f3e; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; font-size: 1rem; font-weight: 600; }
          .btn:hover { background: #ec7211; }
          .btn-secondary { background: #232f3e; color: white; }
          .btn-secondary:hover { background: #37475a; }
          .btn-danger { background: #d13212; color: white; }
          .btn-danger:hover { background: #b02a0c; }
          .alert { padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
          .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
          .alert-error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
          .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
          .user-info { display: flex; align-items: center; gap: 0.75rem; }
          .user-info img { width: 32px; height: 32px; border-radius: 50%; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f8f9fa; font-weight: 600; }
          .upload-box { border: 2px dashed #ccc; padding: 2rem; text-align: center; border-radius: 4px; margin: 1rem 0; }
          .upload-box.dragover { border-color: #ff9900; background: #fff8e6; }
          code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
          pre { background: #232f3e; color: #f8f8f2; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1rem 0; }
          pre code { background: none; padding: 0; }
        `}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

interface LayoutProps {
  children?: Remix.RemixNode
  user?: { email?: string; name?: string; picture?: string } | null
}

export function Layout({ children, user }: LayoutProps) {
  return (
    <Document>
      <header>
        <div class="container">
          <h1>
            <a href={routes.home.href()}>☁️ SSO S3 Demo</a>
          </h1>
          <nav>
            {user ? (
              <>
                <a href={routes.files.index.href()}>Files</a>
                <div class="user-info">
                  {user.picture ? <img src={user.picture} alt="" /> : null}
                  <span>{user.name || user.email}</span>
                </div>
                <form method="POST" action={routes.auth.logout.href()}>
                  <button type="submit" class="btn btn-secondary">
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <a href={routes.auth.login.href()} class="btn">
                Login with Auth0
              </a>
            )}
          </nav>
        </div>
      </header>
      <main>
        <div class="container">{children}</div>
      </main>
    </Document>
  )
}
