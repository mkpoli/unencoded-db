# Unification

When two records are the same character, when they stay apart, and how to merge them.

## What a record is

A record is one written form, as its evidence shows it. The IDS describes that form; it is the record's
best description, and it can be wrong. Identity is decided on the evidence images, and the IDS is where
to look first.

## Same record

Two records are one record when their evidence shows the same form. This is the usual case when:

- their IDS are identical;
- their IDS differ only in how they spell the same picture: a radical code point for its ideograph
  (⺅ and 亻), an encoded part written out or not (⿱好看 and ⿱⿰女子看), or a typo in one of them;
- one record was added again because its first description was mistyped and so not found.

Merge them from the Duplicate link on either record's page. Anyone who can edit a record can merge it.
The later record joins the earlier one:

- its sightings move to the record that stays;
- a claim both records state is kept once and rests on the sightings of both;
- its other claims are added after the record's own, as far as a record's limits allow;
- its description, radical and stroke count fill the ones the record that stays leaves empty;
- its address opens the record that stays, and both histories are kept.

## Separate records

Keep two records apart, and link them with a relation claim, when:

- the forms differ in a part, or in how the parts are placed, even if they share a reading or a
  meaning (relation: Variant, Erroneous variant, Similar);
- the parts differ only in ways IRG treats as unifiable, such as 王 and 壬 in IWDS group 1. Unifiable
  variants are recorded in their own right (relation: Unify with, or status Unifiable with an encoded
  character);
- the IDS are identical but the evidence shows a difference the IDS cannot express, such as a stroke
  added or left out. Write that difference in the relation claim (relation: Glyph);
- the form is that of an encoded character. Such a record stays, with an encoding claim; it is merged
  only with another record of the same form.

## Before merging

- Open both records and compare their evidence images, not only their IDS.
- When unsure, do not merge. Link the records with the relation Uncertain and say why.
- Give the reason in the summary, for example "same form; IDS mistyped as ⿰木本".

## Undoing a merge

The history of the record that stayed has an Undo button on the merge. The duplicate comes back with
its sightings and its own claims as they were. The record that stayed loses what the merge gave it:

- the claims and the scopes it added, unless one rests on a sighting that stays or another duplicate
  that is still merged states it;
- the fields it filled, unless one has been rewritten since.

A merge into a hidden record cannot be undone until the record is shown again.

## Sources

The unifiable component groups are those of IWDS (https://github.com/yi-bai/iwds). The IRG rules are in
IRG Principles & Procedures, Version 18 (IRG N2850R, 17 April 2026).
