# Principles

## Founding statement

> As a sub project directly under Glyph Atlas, I am going to add a 珍字集覽 site, as a wiki site that mainly focus on collecting and documenting Unicode unecoded or unifiable variants. This is similar to GlyphWiki, but instead of drawing Glyphs, I would focus on gathering evidence, so that it will make people easier to do IRG submissions.
>
> — ♪ まくぽり ☆彡

The rules that decide what goes into the compendium and how a record is written. The wider Glyph
Atlas principles (collect first, machines first, open, built for reuse) apply as well.

## A central evidence database

A record joins three things: the glyph, written as an IDS; the evidence, an image and the source it
came from; and links out to every other resource that describes the character. The compendium
gathers where a form was seen. Definitions and judgements live in claims and in the linked resources.

## Record every attested form

Whether Unicode encodes a character, whether it looks interesting, or whether another set already
holds it never decides inclusion. An encoded character is recorded like any other and carries an
encoding claim.

## Read the glyph from the evidence

The IDS describes the form in the image. A code point or description given by whoever reported it is
a claim to check against the image.

## Judgements are claims

Readings, meanings, variant relations and status are claims, each with its evidence and its author.
Claims may disagree; none of them removes a record.

## Trace to the original

Prefer the earliest attestation in its original source, with author, title, publisher, date and
page. Each work that writes the character anew is a sighting of its own, and names the older works
its text quotes. A sighting cites the original work and, separately, where the contributor found it,
so a post that relayed the evidence keeps its credit without standing in for the source.

A sighting takes an original date only when its picture reproduces the older work directly: a
photo, scan, facsimile, rubbing, tracing or line drawing of it in the cited publication. A typeset
transcription (隸定) or a later dictionary citing an older text has no original date; its report
date dates it, and the older text can be named in a quote's locator or the note.

## Credit every source

Posts on social media, blogs, chat messages and personal communications are cited like books: the
author as they sign, the date and a link. A message in a group chat is one source: its own author
and date, the words quoted, the group it was sent in and the service the group is on. A screenshot
of it is kept with it, cropped to the message. A private message, a letter or a conversation is cited
the same way without a group, and marked a personal communication. A partner's material is added once
the partner agrees, and shown with the name they ask for.

## Permanent record codes

Each record receives a sequential number, written `R+0001` (and in 千字文 digits) and mapped to a
fixed private-use code point starting at `U+E000`. Once assigned, a record code is permanent: records
are never deleted, their numbers never change, and hidden or merged numbers are never reused.

Duplicate records merge the later number into the earlier one. The later number retires and redirects
to the earlier record; both the server and the database refuse a merge in the opposite direction.

## Open

Anyone can add or correct a record without an account, every change stays in the history, and the
records are published under CC BY-SA 4.0.
