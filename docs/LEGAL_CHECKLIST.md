# Legal checklist (internal, not public)

Applies to `/privacy`, `/terms` and `/credits`, last updated 1 October 2026. Moved here from the old yellow "draft" box on the public pages. Nothing on this list appears on the site.

## A. Facts still unknown
- [ ] ICO registration (data protection fee) number. Not on the public page. Register at ico.org.uk and add it to `src/lib/company.ts` and the privacy notice if wanted.
- [ ] Email provider for password resets and the mailing list. None chosen. The notice says "UK or EU provider, notice updated first". Sign a data processing agreement, then update the sharing section.
- [ ] Photographer credits (Pexels). `PHOTO_CREDITS` in `src/app/(app)/credits/page.tsx` is empty. Fill it in.
- [ ] Payment provider, if books are ever sold through the site. The notice says it will be updated first.

## B. Promises in the notice that the software does not yet keep
Make the code match, or change the wording. Each is a published promise.
- [ ] **Delete 12 months after access ends with no login.** No job does this today. Needs a scheduled task.
- [ ] **Order-number hash deleted when access ends.** `redeemCode` clears expired hashes only when somebody redeems a code. Needs a daily task.
- [ ] **Security records (`redeem_attempts`) up to 30 days.** Only pruned inside `cleanup`, which runs at deploy. Needs a daily cron.
- [ ] **Expired login sessions (`auth_sessions`) up to 30 days.** Expired rows are never purged.
- [ ] **Web server logs up to 30 days.** nginx writes `/var/log/nginx/learnworks.access.log` with IP addresses. Check logrotate (Ubuntu default is 14 daily rotations).
- [ ] **Mailing consent records kept 6 years after the last change.** `deleteAccountAction` and `removeDemo` delete `mailing_consent` rows with the account. Either keep a minimal proof record after deletion, or change the notice to say it is deleted with the account.
- [ ] **Staff activity log up to 12 months.** `admin_audit` is never pruned and `before_json` / `after_json` may hold personal data. Add pruning or change the period.
- [ ] **Backups: newest 14 nightly copies.** Matches `scripts/server-tasks.ts`. Confirm the cron runs and that backups are not copied elsewhere (the notice says data stays on the one server).
- [ ] "Learner pages show only that family's learners" and "access to the server and back office is limited to staff who need it": confirm.

## C. A lawyer must confirm
1. **Controller details and Companies House spelling** (Blandfords International Ltd, 12256702).
2. **Lawful bases.** Contract for the account and progress; legitimate interests for security, rate limiting and the order-number check; consent for the mailing list; legal obligation. Write up the legitimate-interests balancing test properly (the notice contains a one-line version).
3. **Children's accounts.** Adult 18+ tick-box declaration as "reasonable efforts" under UK GDPR Art 8; 13+ students self-registering for KS3 and KS4 books only; contract law on 13 to 17 year old account holders.
4. **Children's Code.** Standard 11 (parental controls): children are told their grown-up can see scores. Check wording suits each age band (6 to 9, 10 to 12, 13 to 17). The "For children" card is the child-facing version.
5. **DPIA.** An online service likely to be used by children needs a Data Protection Impact Assessment before launch. Not yet written.
6. **Retention periods** in section B above: 12 months after access ends, 30 days for logs, 14 days for backups, 6 years for consent proof, 12 months for the staff log. Confirm each.
7. **Processors and transfers.** Hetzner Online GmbH data processing agreement; UK adequacy for EU transfers.
8. **Adobe Fonts.** Headings are loaded from `use.typekit.net`, so Adobe receives visitors' IP addresses. The privacy notice says so. Decide whether to self-host Gloock instead (then delete that paragraph and the "Adobe Fonts" line on the credits page) and confirm "no cookie banner needed".
9. **Cookies.** `edu_session`, `edu_child`, `edu_lock`, `edu_view` treated as strictly necessary. Keep it that way (no analytics or advertising).
10. **Amazon.** The order number is the buyer's own data. Format-check only, keyed hash, deleted when access ends, never matched with Seller Central. Confirm this fits Amazon's rule that customer information is used only to fulfil orders, and that the site never diverts Amazon buyers elsewhere.
11. **Complaints.** Since 19 June 2026 complaints must be acknowledged within 30 days and be possible electronically. The notice says so. Confirm the process behind support@mylearn.works.
12. **Data Protection Officer.** The notice says none is appointed. Confirm that none is needed.
13. **Terms.** Liability cap (price paid for the book), consumer rights wording, suspension, "removal of a feature" wording, second-hand and shared codes, governing law (England and Wales).
14. **Accessibility statement.** Equality Act 2010 duty applies to free services. Add a statement with a contact route (not yet written).
15. **Copyright.** Reading texts: confirm each is public domain in the UK. An Inspector Calls is in copyright and only short verified quotations are used.
16. **Breach handling.** The notice promises ICO notice within 72 hours. Have a written procedure.

## D. Keep in step
- `src/lib/company.ts` holds the company details and `LEGAL_UPDATED`. Change the date whenever any of the three pages changes in a way that matters.
- The sources list on `/credits` is read from the `sources` table. New sources appear in the "Other sources" group.
- If cookies, processors or data collected change (new feature, email provider, analytics), update the privacy notice first.
