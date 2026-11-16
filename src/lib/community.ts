// The Glyph Atlas community chat: one Matrix space bridged to a Discord server, a Telegram group and IRC
// on Libera.Chat, so a message sent in one place appears in all; QQ is bridged to the Chinese room. The
// links are the ones the Glyph Atlas contact page gives.
export const CHATS = [
  { name: 'Matrix', href: 'https://chat.glyphatlas.org/#/room/#glyphatlas:glyphatlas.org' },
  { name: 'Discord', href: 'https://discord.gg/DR25YeAYSg' },
  { name: 'Telegram', href: 'https://t.me/+Q4wiIzMijRwzOWE1' },
  { name: 'QQ', href: 'https://qm.qq.com/q/bKrGelyYIE' },
  { name: 'IRC', href: 'https://web.libera.chat/#glyphatlas-compendium' },
] as const

/** The Glyph Atlas contact page in the reader's language; it offers the same locales as this site. */
export const contactPage = (locale: string) => `https://glyphatlas.org/${locale}/contact`
