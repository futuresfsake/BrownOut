# Situation catalogue

One hundred situations BrownOut can put a player in. Each row is a brief: enough to author the full scenario from, using the format in [scenario-format.md](scenario-format.md).

Every situation is built on the same idea as Dial Tone. What it **looks like** at the start is not what it **really is**, and there is at least one **trap**: a natural reaction that makes things worse or a tempting statement that turns out to be false.

All companies, people and events are fictional. Situations in the security group are about responding to an incident. None describes how to cause one.

Status: S-001 is built. S-011 and S-021 have longer briefs in [scenarios.md](scenarios.md). The rest are briefs only. How one hundred are made affordable is at the end of this document.

## A. Outages and capacity

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-001 | Dial Tone | On-call lead at a mobile carrier, 02:14 | Last night's billing deploy broke sign-in | Half the sign-in servers loaded an incomplete certificate bundle | Restarting every server at once |
| S-002 | Cold Start | Platform lead at a streaming service on premiere night | Not enough servers for the audience | A cache was emptied by a routine restart, so every request hits the database | Adding servers, which adds database load |
| S-003 | Midnight Rollover | Operations lead at a payroll firm on the last day of the month | The database is slow | Its disk is full because a cleanup job was switched off last week | Failing over to a copy that is hours behind |
| S-004 | Queue Mountain | Lead at a parcel delivery firm | The drivers' app is broken | One malformed message is retried forever and blocks everything behind it | Emptying the whole queue, which deletes real deliveries |
| S-005 | Split Brain | Infrastructure lead at a hospital booking service | A network blip that has already recovered | Two databases each think they are in charge and hold different bookings | Declaring the all-clear because the dashboard is green |
| S-006 | Single Thread | Cards lead at a bank | The card network is down | The bank's own certificate for the card network link expired at midnight | Publicly blaming the card network |
| S-007 | The Long Tail | Search lead at an online shop on sale day | Things are a little slow | One of five data centres fails every request it gets | Trusting the average on the dashboard |
| S-008 | Clock Drift | Lead at an online brokerage | Random login failures | Server clocks drifted after the time service failed, so sign-in tokens are rejected | Resetting every customer's password |
| S-009 | Exam Day | Lead at a school learning platform on exam morning | The site is down everywhere | A routine change broke the domain's address record, and the fix takes time to spread | Promising "back in five minutes" |
| S-010 | Storm Map | Digital lead at a power utility during a storm | The customer portal is overloaded | The portal is up but showing stale restoration times | Leaving wrong estimates online because the site "works" |

## B. Data and privacy

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-011 | Open Bucket | Head of engineering at a clinic-booking company, Friday 16:40 | A researcher found one readable file | Three weeks of nightly patient exports were public, and strangers downloaded them | Deleting the storage, which destroys the access logs |
| S-012 | Wrong Recipients | Operations head at an insurer | An email campaign glitch | 4,200 customers received someone else's policy statement | A "please disregard" email to everyone, which spreads it further |
| S-013 | The Export | Data lead at a loyalty scheme | An analyst's laptop was stolen | It held a full, unencrypted customer export from a "temporary" job | Saying it was "password protected" as if that were encryption |
| S-014 | Test Data | Engineering lead at a fintech | A bug in the test system | The test system runs on real customer data and was shown in a public demo | Wiping the test system before finding out who saw it |
| S-015 | Retention | Privacy lead at a telehealth company | A routine deletion request | "Deleted" records still sit in backups and reports, and a customer has proof | Replying "all your data has been deleted" |
| S-016 | The Screenshot | Support lead at a bank | A viral post mocking a support screen | A training video with real customer details was posted publicly | Chasing the takedown before telling the customers in it |
| S-017 | Shared Link | IT lead at a law firm | A client cannot open a document | A folder of case files has been open to "anyone with the link" for months | Changing the link without checking who used it |
| S-018 | Mislabelled | Systems lead at a diagnostics lab | A printing fault | An import shifted a column and 300 results belong to the wrong patients | Fixing the rows quietly without telling the doctors who acted on them |
| S-019 | The Survey | HR systems lead | A spam complaint about a staff survey | The survey vendor exposed named responses, including health disclosures | Assuring staff the survey "was anonymous" |
| S-020 | Old Backup | IT lead at a city council | A drive handed in at a recycling centre | It is an old backup of resident records, and nobody knows what is on it | Treating "no evidence of misuse" as "no breach" |

## C. Security incidents

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-021 | Slow Burn | Incident commander at a payments company, 11:05 | A slow login page after a marketing email | Automated sign-in attempts using passwords leaked elsewhere, and 2,300 accounts entered | Adding capacity, and saying "customers are not affected" |
| S-022 | Encrypted Morning | IT lead at a regional manufacturer | A problem with the file server | Ransomware is spreading through the office network | Connecting the only backup drive to the infected network |
| S-023 | The Invoice | Finance operations lead | A supplier changed its bank details | A colleague's mailbox was taken over and a large payment left yesterday | Waiting until Monday to call the bank |
| S-024 | Insider | Security lead at a software company | Odd admin activity late at night | A departing employee is downloading customer lists | Confronting them before the evidence is preserved |
| S-025 | Dependency | Engineering lead at an app company | The build is failing | A third-party library update carried harmful code that shipped yesterday | Updating to "latest" without learning what the bad version did |
| S-026 | The Phone Call | Support lead at a mobile carrier | Customers complaining about lost numbers | Callers are talking agents into moving numbers to new SIM cards | Blaming customers and not pausing transfers |
| S-027 | Leaked Key | Platform lead at a startup | A surprisingly large cloud bill | An access key was published by mistake and strangers are using the account | Deleting their machines but not cancelling the key |
| S-028 | Defaced | Web lead at a charity mid-campaign | The homepage shows the wrong picture | An admin account was taken over and the donation page now pays someone else | Restoring the homepage and missing the donation page |
| S-029 | Doorway | IT lead at a school district | One teacher is locked out | A phishing wave captured 60 staff logins, one with access to student records | Resetting only the accounts that were reported |
| S-030 | Quiet Alarm | Security monitoring lead at a logistics firm | One more low-priority alert | An intruder has been inside for three weeks | Closing it as noise, or wiping machines before knowing the extent |

## D. Releases and changes

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-031 | Friday Deploy | Engineering lead at a food delivery app, Friday 18:00 | A few crash reports | The new version crashes on older phones, a third of all users | Waiting days for an app store update when a server switch would stop it now |
| S-032 | Double Charge | Payments lead at a subscription service | A handful of duplicate-charge complaints | A retry bug charged 9,000 customers twice and is still running | Fixing the code while charges continue |
| S-033 | The Migration | Data lead at a bank | A data migration is running long | It is corrupting a column, and the window to undo it closes in 40 minutes | Letting it finish because it is "80 percent done" |
| S-034 | Feature Flag | Product lead at a ride-hailing company | Prices look odd in one city | A test setting turned on tenfold pricing for real riders | Switching it off and saying nothing about refunds |
| S-035 | Silent Failure | Engineering lead at a pharmacy chain | Nothing. There are no alerts | Prescription reminders have not been sent for three days; monitoring watched the wrong thing | Fixing it without telling pharmacists who was missed |
| S-036 | Config Push | Network lead at an internet provider | A regional outage | A settings change went everywhere at once instead of in stages | Pushing an untested second change everywhere |
| S-037 | Rounding | Lead at a payroll provider | One employee's question about their payslip | A tax rounding change underpaid 12,000 people by a small amount | Calling it "immaterial" |
| S-038 | Time Zone | Lead for airline check-in systems | Check-in closed early on some flights | The clock change was handled wrongly, and tomorrow morning's flights are affected too | Fixing only today's flights |
| S-039 | No Way Back | Engineering lead at a marketplace | A bad release that a rollback will fix | New-format orders are already saved, so the old version cannot read them | Forcing the rollback and corrupting orders |
| S-040 | Unknown Owner | Lead at a media company | A service nobody recognises is failing | Everything depends on it, its owner left last year, and there are no notes | Restarting it blindly |

## E. Vendors and third parties

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-041 | Upstream | Engineering lead at an online shop | Our checkout is broken | The payment provider is down | Saying nothing because "it is not our fault" |
| S-042 | Region Down | Platform lead at a software company | Intermittent errors | The cloud provider's region is failing, and the switch to another has never been tested | Switching over, untested, at the busiest hour |
| S-043 | Lapsed | IT lead at a clinic group | The records software "stopped working" | The subscription lapsed; the invoice went to someone who left | Blaming the vendor in front of staff and patients |
| S-044 | The Map | Lead at a delivery app | Drivers are being sent to the wrong places | The map provider changed its data without notice | Turning off the address check |
| S-045 | Outsourced | Operations lead at a bank | Long waits on the phone line | The outsourced call centre lost its connection, and the contract allows them four hours | Promising callbacks nobody is there to make |
| S-046 | No Code | Lead at a bank | Customers are not receiving login codes | The text provider is throttling you after a spike | Turning off the second login step |
| S-047 | Ingredient | Quality lead at a food manufacturer | One customer complaint | A supplier's ingredient contains an undeclared allergen | Waiting for the lab before putting anything on hold |
| S-048 | Lights Out | Technology head at a small firm | The vendor's status page is down | The vendor has shut down, and your data is on their servers for 48 more hours | Waiting for their support team to reply |
| S-049 | Sunset | Lead at a software company | Calls to a partner service are failing | The partner was bought and switched it off; the notice went to an unread mailbox | Starting an emergency rewrite without telling customers |
| S-050 | Third Hand | Privacy lead at a retailer | A line in a vendor newsletter | Your vendor's own supplier was breached, and your customers are included | Passing on the vendor's reassurance without checking it |

## F. People and process

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-051 | Handover | The incoming incident lead at shift change | A tidy handover note | The note is wrong about what has already been tried | Repeating a step that made things worse |
| S-052 | Too Many Cooks | Incident lead with 40 people on the call | Plenty of help | Three engineers are each making changes the others do not know about | Not stopping all changes first |
| S-053 | The Expert | On-call engineer at 03:00 | A system only one person understands | You must decide whether to wake them | Waiting until morning to be polite |
| S-054 | Hero | Engineering manager | A senior engineer who says "I've got it" | He has been awake 20 hours and is on the wrong track | Not relieving him |
| S-055 | Wrong Runbook | On-call engineer | A written procedure to follow | The procedure is out of date and step 4 deletes data | Following it without reading ahead |
| S-056 | Blame | Team lead during a live incident | The chief executive wants a name | The process let one typo reach every customer | Naming the junior engineer |
| S-057 | Short Staffed | Operations lead at a transit agency | A system overload | Half the staff are out, and the manual fallback needs people you do not have | Announcing normal service |
| S-058 | Extra Zeros | Operations lead at a trading firm | A sharp market move | One of your own orders was entered with extra zeros | Cancelling quietly without telling the regulator or the other side |
| S-059 | New Starter | Engineering lead | A new hire's odd question | They were given too much access and ran a cleanup on live data | Hiding it, or making an example of them |
| S-060 | Hour Fourteen | Incident lead, 14 hours in | "We are nearly there" | The team is now making mistakes from tiredness | Pushing through without rotating people |

## G. Public, press and social

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-061 | Going Viral | Communications lead at an airline | One angry post | A video with two million views, and the facts are not yet known | Issuing a statement before knowing what happened |
| S-062 | The Rumour | Communications lead at a bank | A rumour that the bank is failing | It began with an unrelated app outage | Either silence or a panicked denial |
| S-063 | Wrong Post | Social media lead | The brand account posted something offensive | A draft was scheduled by mistake | Claiming "we were hacked" when you were not |
| S-064 | Leaked Memo | Head of internal communications | A press enquiry | The redundancy plan leaked, and staff are reading it in the news | Denying it |
| S-065 | Fake Recall | Brand lead at a food company | A hoax recall notice | The notice is forged, but one real complaint is mixed in | Dismissing every complaint as part of the hoax |
| S-066 | The Quote | Communications lead | The chief executive wants to say "no customer impact" | Nobody yet knows the impact | Letting it go out |
| S-067 | One Star | Lead for a mobile app | A sudden flood of one-star reviews | A real bug in the latest release | Treating it as an attack by competitors |
| S-068 | Scooped | Engineering lead | A journalist who knows more than you do | A customer sent them evidence you have not seen | "No comment", then being contradicted |
| S-069 | Livestream | Duty manager at a hotel chain | A guest broadcasting a complaint | The alarm they are filming is a real safety alarm | Managing the publicity before the safety |
| S-070 | The Apology | Communications lead after an incident | A draft apology | Lawyers want no admission and customers want the truth | An apology that admits nothing |

## H. Safety and regulated services

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-071 | Alarm Flood | Control room lead at a water utility | A faulty sensor raising alarms | One real dosing fault hidden among false alarms | Silencing all of them |
| S-072 | Paper Fallback | IT lead at a hospital | The records system is down | Clinicians need allergy information now, and the paper procedure was never practised | Waiting for the system to come back |
| S-073 | Field Reports | Quality lead at a medical device maker | A few reports of odd readings | A software fault gives wrong readings in a rare case | Waiting for more reports |
| S-074 | Wrong Strength | Lead at a medicines distributor | A barcode mismatch | A batch labelled with the wrong strength reached 60 pharmacies | Collecting it quietly |
| S-075 | Degraded Mode | Operations lead at a railway | A warning on the signalling system | It is running in a reduced mode and trains must slow down | Keeping the timetable |
| S-076 | Cold Chain | Logistics lead for vaccines | A fridge alarm overnight | Six hours out of range, and the doses are already at clinics | Assuming they are fine |
| S-077 | Nuisance Code | Maintenance control lead at an airline | A minor fault code that keeps coming back | The same code across the fleet since a software update | Signing it off as a nuisance |
| S-078 | Quiet Night | IT lead at an emergency dispatch centre | A quiet night | Calls from one phone carrier are not arriving | Enjoying the quiet |
| S-079 | Between Floors | Lead at a building management firm | One lift stuck with people inside | A remote update faulted lifts in several buildings | A remote reset with people inside |
| S-080 | Units | Systems lead at a hospital pharmacy | An update to infusion pump settings | The update mixed up two units of measure | Finishing the rollout |

## I. Money and business

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-081 | Glitch Price | Lead at an online shop | A product selling very well | It is priced at one percent of cost, with 8,000 orders | Cancelling them all without a word |
| S-082 | Payday | Payroll lead, Thursday night | The bank rejected a file | Salaries for 3,000 staff will not arrive on Friday | Not telling staff tonight |
| S-083 | Paid Twice | Finance lead at a marketplace | Unusually happy sellers | Every seller was paid twice, 2.1 million in total | Taking it back without notice |
| S-084 | Frozen | Lead at a money app | A spike in withdrawals | The partner bank has frozen transfers | Saying "funds are safe" before the bank confirms it |
| S-085 | Month End | Finance systems lead | A slow month-end close | The books do not balance because of a duplicate import, and auditors arrive tomorrow | Forcing them to balance with a manual entry |
| S-086 | The Code | Lead at a retailer | A very popular promotion | A single-use code works unlimited times and is on a deals forum | Cancelling orders already confirmed |
| S-087 | Phantom Stock | Lead at a grocery delivery service | Orders coming in normally | The stock feed froze, so you are selling what you do not have | Substituting items without asking |
| S-088 | Deadline Day | Lead at a tax-filing service | A slow website | Submissions are failing silently while users are told "filed" | Leaving "filed" on screen |
| S-089 | Refund Loop | Lead for airline refunds | A backlog of refunds | The automation sent refunds to closed cards and marked them done | Counting them as paid |
| S-090 | Stale Rate | Lead at a travel money app | Very generous exchange rates | The rate feed is stuck on yesterday during a currency crash | Continuing to trade |

## J. Physical world

| # | Title | You are | It looks like | It really is | The trap |
|---|---|---|---|---|---|
| S-091 | Water | Data centre lead | A water alarm | A cooling pipe is leaking under the floor | Keeping systems running to avoid downtime |
| S-092 | Heat | IT lead in a heatwave | The air conditioning failed | The server room will overheat in 30 minutes, and the shutdown order matters | Waiting for the repair |
| S-093 | Generator | Facilities and IT lead at a hospital | Mains power lost, generator running | There is fuel for 6 hours, not the 24 on paper | Assuming the paper is right |
| S-094 | Evacuate | IT lead in an office tower | A fire alarm | Systems must be handed to another site with nobody at a desk | Staying behind to do it |
| S-095 | Cable Cut | Network lead at an internet provider | Builders cut a cable | The backup cable runs in the same trench | Promising a quick repair |
| S-096 | Landfall | Logistics lead at a retailer | A storm forecast | Everything runs from one warehouse in its path | Waiting for certainty |
| S-097 | Turnstiles | Ticketing lead on match night | Slow gates | Scanners are offline and 40,000 people are pressing at the entrances | Fixing the scanners instead of opening the gates by hand |
| S-098 | Tremor | Regional operations lead | Staff not answering | An earthquake: people first, then systems | Starting with the systems |
| S-099 | Everyone Home | IT lead | Everyone must work from home tomorrow | Remote access has room for one in ten | Opening access with no controls |
| S-100 | Lost Truck | Logistics lead for medicines | A tracker that stopped reporting | A truck carrying controlled medicines is missing | Waiting for it to turn up |

## How one hundred stays affordable

One hundred hand-built scenarios the size of Dial Tone would be far too much work. These choices keep it realistic.

1. **One engine, already built.** Trust, promises, claims, duties, scoring and endings are the same for every situation. A situation only supplies data.
2. **A shared kit.** About a dozen stakeholder types (the executive, support, counsel, communications, the journalist, the regulator, the customer, the engineer on shift, the vendor contact) with their voices and patience, reused and renamed. Common investigations ("what changed recently?", "who is affected?") and common duties ("update the status page", "tell the regulator") are written once.
3. **A small authoring target per situation.** One root cause, 6 to 8 clues, 6 to 8 investigations, 4 mitigations including a trap, 3 claim topics, 2 duties, 12 to 15 messages, and an ideal path. Dial Tone is the upper bound, not the template.
4. **The validator is the safety net.** No situation ships unless it passes the same checks as Dial Tone: solvable, fair, and every message reachable.
5. **Waves.** Wave 1 is ten situations, one from each group, chosen to be as different from each other as possible. Later waves add ten at a time. The game is complete and worth playing after wave 1.
6. **Seeds make replays differ.** The same situation plays differently on another seed: message timing shifts, and later, a situation can carry two possible root causes so that knowing the answer from last time does not help.

Wave 1: S-001, S-011, S-021, S-032, S-041, S-055, S-066, S-072, S-082, S-097.
