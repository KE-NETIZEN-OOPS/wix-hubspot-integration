export const metadata = { title: 'Wix–HubSpot Integration' }
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: '#111827', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
