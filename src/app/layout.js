import './globals.css'
import { Lato, Cormorant_Garamond } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'

// the app's only two fonts: Lato for interface/body text, Cormorant for
// headings and the user's own words (quotes, entry titles)
const lato = Lato({
  subsets: ['latin'],
  variable: '--font-lato',
  weight: ['300', '400', '700'],
  style: ['normal', 'italic'],
})

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
})

export const metadata = {
  title: 'Moiré Journal',
  description: 'Personal journaling app',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90" font-family="serif" fill="%23475569">M</text></svg>',
  }
}

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#7F5B70',
          colorBackground: '#FFFFFF',
          colorText: '#262322',
          colorTextSecondary: '#5F5A57',
          colorInputBackground: '#FFFFFF',
          colorInputText: '#262322',
          fontFamily: 'var(--font-lato)',
          borderRadius: '0.75rem',
        },
      }}
    >
      {/* font variables live on <html> so the theme's --font-sans / --font-display (defined at the root) can see them */}
      <html lang="en" className={`${lato.variable} ${cormorantGaramond.variable}`}>
        <body className="font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  )
}
