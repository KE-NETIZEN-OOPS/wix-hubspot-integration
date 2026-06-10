export const metadata = { title: 'Wix–HubSpot Integration' }
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>
        {children}
      </body>
    </html>
  )
}
