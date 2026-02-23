import './globals.css'

export const metadata = {
  title: "Kalani's Favorite Restaurants",
  description: 'Save restaurants from TikTok & Instagram',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
