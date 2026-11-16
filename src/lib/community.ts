// The Glyph Atlas community chat: one Matrix space bridged to a Discord server, a Telegram group and IRC
// on Libera.Chat, so a message sent in one place appears in all; QQ is bridged to the Chinese room. The
// links are the ones the Glyph Atlas contact page gives.
export const CHATS = [
  { name: 'Matrix', mark: 'matrix', href: 'https://chat.glyphatlas.org/#/room/#glyphatlas:glyphatlas.org' },
  { name: 'Discord', mark: 'discord', href: 'https://discord.gg/DR25YeAYSg' },
  { name: 'Telegram', mark: 'telegram', href: 'https://t.me/+Q4wiIzMijRwzOWE1' },
  { name: 'QQ', mark: 'qq', href: 'https://qm.qq.com/q/bKrGelyYIE' },
  { name: 'IRC', mark: 'irc', href: 'https://web.libera.chat/#glyphatlas-compendium' },
] as const

/** The Glyph Atlas contact page in the reader's language; it offers the same locales as this site. */
export const contactPage = (locale: string) => `https://glyphatlas.org/${locale}/contact`
