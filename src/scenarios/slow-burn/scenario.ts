// Situation S-021: Slow Burn. It looks like load after a marketing email. It is an attack on
// customer accounts. See the brief in docs/03-design/scenarios.md. All names are fictional.
import type { Scenario } from "../../engine/schema.js";
import {
  allClear,
  allClearDuty,
  ASKS,
  bossAsksAgain,
  bossMissed,
  brokePromise,
  mika,
  person,
} from "../kit.js";

const LIE_TO_PRESS = {
  type: "claim",
  topic: "customers-affected",
  stance: "denies",
  truth: "false",
  to: "journalist",
  // A statement the player has taken back themselves is not held against them in print.
  corrected: false,
} as const;
const LIE_TO_COMMS = { ...LIE_TO_PRESS, to: "comms" } as const;

export const slowBurn: Scenario = {
  id: "slow-burn",
  title: "Slow Burn",
  version: 1,
  briefing: {
    role: "Incident commander at Corvane Pay, a payments company",
    situation:
      "It is 11:05 on a Tuesday. You are today's incident commander at Corvane Pay. Sign-in has been slow for twenty minutes and is now timing out. Marketing sent an email to every customer this morning, and most people in the building think that is the reason. Mika Tan is the engineer on shift and will carry out what you ask.",
    canDo:
      "Type what you do, or what you tell someone, in your own words. You can look things up, give orders, and answer the people who are about to start writing to you.",
  },
  startClock: "11:05",
  lengthMinutes: 90,

  stakeholders: [
    mika("Site reliability engineer on shift"),
    person("boss", {
      name: "Anneke Visser",
      role: "Chief operating officer",
      aliases: ["coo", "chief operating officer"],
    }),
    person("support", { name: "Dele Akintola", role: "Head of customer support" }),
    person("comms", { name: "Marguerite Hale", role: "Communications lead" }),
    person("journalist", {
      name: "Tobias Renn",
      role: "Reporter, Fintech Wire",
      aliases: ["fintech wire"],
    }),
    person("outsider", {
      id: "security",
      name: "Ines Carvalho",
      role: "Security lead",
      wants: "To be called early, with what you have seen",
      voice: "Calm and short. Asks what you have seen, not what you think.",
      channel: "chat",
      audience: "internal",
      patienceMinutes: 10,
      aliases: ["security", "security lead", "security team", "infosec"],
    }),
    person("regulator", {
      name: "Duty officer",
      role: "Payments Supervisory Board",
      aliases: ["supervisory board", "payments supervisory board", "the board's duty officer"],
    }),
  ],

  systems: [
    {
      id: "signin",
      label: "Sign-in service",
      start: "degraded",
      labels: { degraded: "Slow, timing out" },
    },
    {
      id: "protection",
      label: "Sign-in protection",
      start: "degraded",
      labels: { degraded: "Default limits", ok: "Tightened" },
    },
    {
      id: "payouts",
      label: "Payouts",
      start: "ok",
      labels: { ok: "Next run 12:00", degraded: "Held for entered accounts" },
    },
    {
      id: "status-page",
      label: "Public status page",
      start: "ok",
      labels: { ok: "Shows all systems normal", degraded: "Incident posted" },
    },
  ],

  metrics: [
    {
      id: "takenOver",
      label: "Accounts in the wrong hands",
      visibleWhen: { type: "clue", id: "accounts-entered" },
    },
  ],
  driverMetric: "takenOver",
  startMode: "attack",
  modes: {
    attack: [
      {
        kind: "curve",
        points: [
          [0, 2300],
          [90, 11300],
        ],
      },
    ],
    // More servers let more of the attacker's attempts through.
    faster: [{ kind: "follow", mode: "attack", multiplier: 1.5 }],
    held: [{ kind: "hold" }],
    recovered: [{ kind: "ramp", over: 4, to: 0 }],
  },
  severeAbove: 4500,

  clues: [
    {
      id: "six-times-load",
      kind: "symptom",
      fact: "Requests to sign-in are 6 times normal. Payments are going through as usual.",
      leakTerms: ["6 times normal"],
    },
    {
      id: "not-the-email",
      kind: "redHerring",
      fact: "The marketing email went out at 09:30 and its visitors had come and gone by 10:15. The slowness started at 10:45.",
      leakTerms: ["come and gone", "started at 10:45"],
    },
    {
      id: "capacity-fine",
      kind: "redHerring",
      fact: "The sign-in servers are not short of capacity for real customers. They are busy turning away wrong passwords.",
      leakTerms: ["not short of capacity", "turning away wrong passwords"],
    },
    {
      id: "failed-logins",
      kind: "true",
      fact: "9 in 10 sign-in attempts are failing with a wrong password, spread across thousands of different accounts.",
      leakTerms: ["wrong password", "9 in 10"],
    },
    {
      id: "leaked-passwords",
      kind: "true",
      fact: "The attempts are email and password pairs leaked from other sites, tried one account at a time from many addresses.",
      leakTerms: ["leaked from other sites", "pairs leaked"],
    },
    {
      id: "accounts-entered",
      kind: "true",
      fact: "About 2,300 accounts had been signed into by someone else when this started, and the number is rising.",
      leakTerms: ["signed into by someone else", "2,300 accounts"],
    },
    {
      id: "payouts-changed",
      kind: "true",
      fact: "41 of the entered accounts have had their payout destination changed. Nothing has been paid out yet: the next run is at 12:00.",
      leakTerms: ["payout destination changed", "41 of the entered"],
    },
    {
      id: "not-our-breach",
      kind: "true",
      fact: "Nothing was taken from Corvane's own systems. The passwords came from elsewhere.",
      leakTerms: ["nothing was taken from", "came from elsewhere"],
    },
    {
      id: "stopped",
      kind: "true",
      fact: "Wrong-password attempts are being turned away at the door and no new account has been entered since.",
      leakTerms: ["turned away at the door", "no new account"],
    },
  ],

  investigations: [
    {
      id: "overview",
      label: "Look at the overall picture",
      durationMinutes: 2,
      examples: [
        "What does the dashboard show?",
        "How slow is sign-in, and is anything else affected?",
        "Are payments still working?",
        ...ASKS.overview,
      ],
      reveals: ["six-times-load"],
      resultPurpose: "Report the load on sign-in and that payments are fine",
      resultText:
        "Mika: Requests to sign-in are 6 times normal. Payments are going through as usual. From here it looks like load.",
    },
    {
      id: "marketing-email",
      label: "Check whether the marketing email is driving the traffic",
      durationMinutes: 3,
      examples: [
        "Is this the marketing email?",
        "When did the campaign go out, and does the traffic match?",
        "Are these visitors from this morning's email?",
        "Check the campaign traffic",
        "Did marketing cause this?",
      ],
      reveals: ["not-the-email"],
      resultPurpose: "Show the email's traffic had passed before the slowness began",
      resultText:
        "Mika: The marketing email went out at 09:30 and its visitors had come and gone by 10:15. The slowness started at 10:45. It is not the email.",
    },
    {
      id: "capacity",
      label: "Check whether the sign-in servers are out of capacity",
      durationMinutes: 3,
      examples: [
        "Do we have enough sign-in servers?",
        "Is this a capacity problem?",
        "Are the sign-in servers overloaded?",
        "Look at processor and memory on the sign-in servers",
        "Would more servers help?",
      ],
      reveals: ["capacity-fine"],
      resultPurpose: "Show the servers are busy rejecting, not short of room",
      resultText:
        "Mika: The sign-in servers are not short of capacity for real customers. They are busy turning away wrong passwords.",
    },
    {
      id: "signin-logs",
      label: "Look at what the sign-in attempts are",
      durationMinutes: 3,
      examples: [
        "What are all these sign-in requests?",
        "Pull the sign-in logs",
        "How many sign-ins are succeeding and how many are failing?",
        "Look at the failed logins",
        "What is the traffic to sign-in made of?",
      ],
      reveals: ["failed-logins"],
      resultPurpose: "Report that most attempts are wrong passwords across many accounts",
      resultText:
        "Mika: 9 in 10 sign-in attempts are failing with a wrong password, spread across thousands of different accounts. Real customers do not behave like that.",
    },
    {
      id: "attempt-pattern",
      label: "Find out where the failed attempts come from and what they are trying",
      durationMinutes: 4,
      examples: [
        "Where are the failed sign-ins coming from?",
        "Is there a pattern to the wrong passwords?",
        "Who is sending these attempts?",
        "Trace the source of the failed logins",
        "Are these attempts automated?",
      ],
      reveals: ["leaked-passwords"],
      resultPurpose: "Report that the attempts are leaked credentials tried in bulk",
      resultText:
        "Mika: The attempts are email and password pairs leaked from other sites, tried one account at a time from many addresses. This is an attack on customer accounts.",
    },
    {
      id: "compare-leaks",
      label: "Compare the attempted passwords with lists leaked from other sites",
      durationMinutes: 4,
      examples: [
        "Are these passwords from a known leak?",
        "Check the attempts against leaked password lists",
        "Is this credential stuffing?",
        "Have these email addresses appeared in other companies' leaks?",
        "Match the attempts to public password dumps",
      ],
      reveals: ["leaked-passwords", "not-our-breach"],
      resultPurpose: "Confirm the credentials came from other sites' leaks",
      resultText:
        "Mika: They match. The attempts are email and password pairs leaked from other sites, tried one account at a time from many addresses. Nothing was taken from Corvane's own systems. The passwords came from elsewhere.",
    },
    {
      id: "entered-accounts",
      label: "Find out how many accounts have been entered and what was done in them",
      durationMinutes: 4,
      examples: [
        "Did any of the attempts get in?",
        "How many accounts has the attacker signed into?",
        "What did they do inside the accounts?",
        "Has any money moved?",
        "List the accounts with a sign-in from a new device",
        ...ASKS.whoIsAffected,
      ],
      reveals: ["accounts-entered", "payouts-changed"],
      resultPurpose: "Report the entered accounts and the changed payout details",
      resultText:
        "Mika: About 2,300 accounts had been signed into by someone else when this started, and the number is rising. 41 of the entered accounts have had their payout destination changed. Nothing has been paid out yet: the next run is at 12:00.",
    },
    {
      id: "verify-stopped",
      label: "Confirm the attempts are being turned away and no new account is entered",
      durationMinutes: 2,
      requires: { type: "mitigation", id: "tighten-signin" },
      examples: [
        "Has the attack stopped?",
        "Confirm no new accounts are being entered",
        "Is the tightened sign-in holding?",
        ...ASKS.isItOver,
      ],
      reveals: ["stopped"],
      resultPurpose: "Confirm the attack is no longer getting in",
      resultText:
        "Mika: Wrong-password attempts are being turned away at the door and no new account has been entered since.",
    },
  ],

  mitigations: [
    {
      id: "tighten-signin",
      label: "Tighten sign-in: challenge repeated failures and block the attacking pattern",
      durationMinutes: 4,
      kind: "partial",
      examples: [
        "Rate-limit failed sign-ins and block the attacking pattern",
        "Turn on the extra check for sign-ins that fail twice",
        "Tighten the sign-in protections",
        "Block the automated sign-in attempts",
        "Put a challenge in front of sign-in",
      ],
      onComplete: { mode: "held", systems: { protection: "ok", signin: "ok" } },
      resultPurpose: "Report that the attempts are being challenged and sign-in is usable",
      resultText:
        "Mika: Sign-in protection is tightened. Repeated failures get a challenge and the attacking pattern is blocked. Real customers can sign in again.",
    },
    {
      id: "lock-entered",
      label: "Lock the entered accounts, reset their passwords and undo the changed payout details",
      durationMinutes: 6,
      kind: "fix",
      requires: {
        type: "all",
        of: [
          { type: "mitigation", id: "tighten-signin" },
          { type: "clue", id: "accounts-entered" },
        ],
      },
      examples: [
        "Lock every account the attacker got into",
        "Force a password reset on the entered accounts",
        "Reverse the payout changes and lock those accounts",
        "Sign the attacker out of the accounts and reset them",
        "Secure the compromised accounts",
      ],
      onComplete: { mode: "recovered" },
      resultPurpose: "Report that the entered accounts are locked and restored",
      resultText:
        "Mika: Every entered account is locked and its password reset. The changed payout destinations are back to what the owners had set.",
    },
    {
      id: "hold-payouts",
      label: "Hold the 12:00 payout run for the entered accounts",
      durationMinutes: 2,
      kind: "partial",
      requires: { type: "clue", id: "payouts-changed" },
      examples: [
        "Hold payouts for the affected accounts",
        "Stop the 12:00 payout run for anyone the attacker got into",
        "Freeze payouts on the entered accounts",
        "Do not let the noon payouts go to the changed destinations",
        "Pause payouts where the destination was changed",
      ],
      onComplete: { systems: { payouts: "degraded" } },
      resultPurpose: "Report that no payout will go to a changed destination",
      resultText:
        "Mika: Payouts are held for every entered account. Nothing will go to a changed destination at 12:00.",
      facts: ["The payout run is at 12:00."],
    },
    {
      id: "add-capacity",
      label: "Add sign-in servers",
      durationMinutes: 3,
      kind: "harmful",
      examples: [
        "Scale up the sign-in service",
        "Add more servers to sign-in",
        "Double the sign-in capacity",
        "Throw more capacity at sign-in",
        "Spin up extra sign-in instances",
      ],
      onComplete: { mode: "faster", systems: { signin: "ok" } },
      resultPurpose: "Report that sign-in is fast again, for everyone",
      resultText:
        "Mika: Capacity is doubled and sign-in is fast again. Whatever is sending these requests is getting through faster too.",
    },
    {
      id: "restart-signin",
      label: "Restart the sign-in service",
      durationMinutes: 3,
      kind: "noEffect",
      examples: [
        "Restart sign-in",
        "Bounce the sign-in servers",
        "Reboot the login service",
        "Turn sign-in off and on again",
        "Restart the login servers",
      ],
      onComplete: { systems: {} },
      resultPurpose: "Report that nothing improved",
      resultText:
        "Mika: Sign-in is restarted. It was quick for a minute and is timing out again. Nothing has changed.",
    },
  ],

  directives: [
    {
      id: "update-status-page",
      label: "Update the public status page",
      toAny: ["comms"],
      examples: [
        "Tell comms to update the status page",
        "Post an incident on the status page",
        "Marguerite, put up a notice that we are investigating sign-in",
        "Get the status page changed",
        "Publish a status notice",
      ],
      effects: { systems: { "status-page": "degraded" } },
    },
    {
      id: "bring-in-security",
      label: "Bring security in",
      toAny: ["security"],
      examples: [
        "Get security on this now",
        "Ines, I need you on this incident",
        "Call the security lead",
        "Escalate this to the security team",
        "Page security",
      ],
    },
    {
      id: "notify-regulator",
      label: "Notify the Payments Supervisory Board",
      toAny: ["comms", "regulator"],
      examples: [
        "Tell comms to notify the Payments Supervisory Board",
        "Report the account takeovers to the regulator",
        "Marguerite, the regulator needs to hear this from us today",
        "File the regulator notification",
        "Call the supervisory board's duty officer",
      ],
    },
    allClear(),
  ],

  claimTopics: [
    {
      id: "customers-affected",
      statement: "Customer accounts are affected",
      statementTrue: true,
      supportsAsserts: ["accounts-entered"],
      supportsDenies: [],
      phrases: [
        "customers affected",
        "customer affected",
        "customer accounts",
        "accounts affected",
        "customer impact",
        "customers impacted",
        "accounts entered",
        "accounts safe",
        "customers safe",
      ],
      surfacesWhen: { type: "minuteAtLeast", value: 35 },
    },
    {
      id: "performance-only",
      statement: "This is a performance problem",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["failed-logins"],
      phrases: [
        "performance issue",
        "performance problem",
        "capacity problem",
        "capacity issue",
        "load problem",
        "because of the email",
        "marketing email",
      ],
      surfacesWhen: { type: "clue", id: "leaked-passwords" },
    },
    {
      id: "under-attack",
      statement: "This is an attack on customer accounts",
      statementTrue: true,
      supportsAsserts: ["leaked-passwords"],
      supportsDenies: [],
      phrases: ["attack", "credential stuffing", "leaked passwords", "stolen passwords"],
    },
    {
      id: "our-breach",
      statement: "Corvane's own systems were breached",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["not-our-breach"],
      phrases: ["breach", "breached", "our systems compromised", "taken from us"],
      surfacesWhen: { type: "clue", id: "not-our-breach" },
    },
  ],

  obligations: [
    {
      id: "security-in",
      label: "Security brought in",
      trigger: { type: "clue", id: "failed-logins" },
      withinMinutes: 10,
      satisfiedBy: { directive: "bring-in-security", toAny: ["security"] },
    },
    {
      id: "notify-regulator",
      label: "Regulator notified",
      trigger: {
        type: "any",
        of: [
          { type: "clue", id: "accounts-entered" },
          { type: "minuteAtLeast", value: 35 },
        ],
      },
      withinMinutes: 30,
      satisfiedBy: { directive: "notify-regulator", toAny: ["comms", "regulator"] },
    },
    allClearDuty("stopped", ["cto", "support", "comms"]),
  ],

  beats: [
    {
      id: "alert",
      from: "system",
      channel: "log",
      when: { atMinute: 0 },
      purpose: "Open the incident with the alert",
      facts: ["Sign-in is slow and timing out.", "Request volume is far above normal."],
      fallbackText:
        "ALERT {clock}: sign-in is slow and timing out. Request volume is far above normal.",
    },
    {
      id: "coo-eta",
      from: "cto",
      channel: "chat",
      when: { atMinute: 3 },
      purpose: "Ask when it is fixed, within 10 minutes",
      facts: ["The chief operating officer wants an answer within 10 minutes."],
      fallbackText:
        "Anneke: Sign-in is crawling the morning marketing's email went out. When is it fixed? I want an answer in 10 minutes.",
    },
    {
      id: "support-complaints",
      from: "support",
      channel: "chat",
      when: { atMinute: 5, jitter: 2 },
      purpose: "Report that customers cannot sign in and ask what to say",
      facts: ["Customers cannot sign in."],
      fallbackText:
        "Dele: Customers cannot sign in and the queue is growing. Marketing says the email did well. What do I tell people?",
    },
    {
      id: "comms-line",
      from: "comms",
      channel: "chat",
      when: { atMinute: 8, jitter: 2 },
      purpose: "Offer the natural, wrong statement for approval",
      facts: ["Comms wants to post that it is a performance issue and customers are not affected."],
      fallbackText:
        "Marguerite: I would like to post: 'a performance issue after high demand, customers are not affected'. Can I?",
    },
    bossAsksAgain("Anneke", 13, "When is it fixed?"),
    {
      id: "journalist-first",
      from: "journalist",
      channel: "press",
      when: { atMinute: 15, jitter: 2 },
      purpose: "Ask whether it is an outage, before posting an item",
      facts: ["The item will be posted at 11:35."],
      fallbackText:
        "Tobias Renn, Fintech Wire: Corvane sign-in looks to be down. Is it an outage? I am posting an item at 11:35.",
    },
    {
      id: "customers-notice",
      from: "support",
      channel: "chat",
      when: { atMinute: 22 },
      unless: { type: "mitigation", id: "tighten-signin" },
      purpose: "Customers are reporting sign-ins they did not make",
      facts: ["Customers report sign-in alerts from devices they do not recognise."],
      fallbackText:
        "Dele: Several customers say they have had 'new device signed in' emails they do not recognise. Is that us?",
    },
    {
      id: "press-fair",
      from: "journalist",
      channel: "press",
      when: { atMinute: 30 },
      unless: { type: "any", of: [LIE_TO_PRESS, LIE_TO_COMMS] },
      purpose: "Post a fair item about the sign-in problem",
      facts: ["Sign-in at Corvane Pay has been failing since late morning."],
      fallbackText:
        "Fintech Wire: Sign-in at Corvane Pay has been failing since late morning. The company has not said why.",
    },
    {
      id: "press-harsh",
      from: "journalist",
      channel: "press",
      when: {
        condition: {
          type: "all",
          of: [
            { type: "minuteAtLeast", value: 35 },
            { type: "any", of: [LIE_TO_PRESS, LIE_TO_COMMS] },
          ],
        },
      },
      purpose: "Set the company's first statement against what customers are reporting",
      facts: ["Customers have posted alerts of sign-ins from devices they do not own."],
      quotesClaim: "customers-affected",
      fallbackText:
        'Fintech Wire: Corvane Pay said this morning: "{quote}". Customers have since posted alerts of sign-ins to their accounts from devices they do not own.',
    },
    {
      id: "coo-capacity",
      from: "cto",
      channel: "chat",
      when: { condition: { type: "mitigation", id: "add-capacity" }, delayMinutes: 3 },
      purpose: "Ask what was done, after entered accounts jumped",
      facts: ["Entered accounts rose to {takenOver}."],
      fallbackText:
        "Anneke: Sign-in is fast again, and I am now told entered accounts have jumped to {takenOver}. What did we do?",
    },
    {
      id: "coo-first-version",
      from: "cto",
      channel: "chat",
      when: {
        condition: {
          type: "all",
          of: [
            { type: "claim", topic: "performance-only", stance: "asserts" },
            { type: "clue", id: "leaked-passwords" },
          ],
        },
      },
      purpose: "Confront the player with the first explanation they gave",
      facts: ["The player first said it was a performance problem."],
      quotesClaim: "performance-only",
      fallbackText:
        'Anneke: You told me: "{quote}". Now it is an attack. I have already given the board the first version.',
    },
    {
      id: "security-not-called",
      from: "security",
      channel: "chat",
      when: { condition: { type: "obligation", id: "security-in", state: "missed" } },
      purpose: "Security asks why it was not called",
      facts: ["Security heard about the failed sign-ins from someone else."],
      fallbackText:
        "Ines: I am hearing from support, not from you, that sign-ins are failing across thousands of accounts. Why was security not called?",
    },
    {
      id: "payout-run",
      from: "system",
      channel: "log",
      when: { atMinute: 55 },
      unless: {
        type: "any",
        of: [
          { type: "mitigation", id: "hold-payouts" },
          { type: "mitigation", id: "lock-entered" },
        ],
      },
      purpose: "The payout run has paid the changed destinations",
      facts: ["The payout run has completed, including the accounts with changed destinations."],
      fallbackText:
        "NOTICE {clock}: the payout run has completed. Payouts were sent to the changed destinations.",
    },
    {
      id: "regulator-calls",
      from: "regulator",
      channel: "chat",
      when: { condition: { type: "obligation", id: "notify-regulator", state: "missed" } },
      purpose: "The regulator calls because no notification arrived",
      facts: [
        "The regulator has read that customer accounts were entered and has no notification.",
      ],
      fallbackText:
        "Duty officer, Payments Supervisory Board: We are reading that customer accounts at Corvane Pay were entered by a third party, and we have nothing from you. Call this line now.",
    },
    bossMissed("Anneke", "The chief operating officer"),
    {
      id: "comms-after",
      from: "comms",
      channel: "chat",
      when: { condition: { type: "clue", id: "stopped" } },
      purpose: "Ask what to post now it has stopped",
      facts: ["The attack is confirmed stopped."],
      fallbackText:
        "Marguerite: If it has stopped, what do I post, and what do we say about the accounts?",
    },
  ],

  endings: {
    ctoTrustFloor: 15,
    resolvedWhen: {
      type: "all",
      of: [
        { type: "mitigation", id: "lock-entered" },
        { type: "clue", id: "stopped" },
        {
          type: "any",
          of: [
            { type: "obligation", id: "all-clear", state: "met" },
            { type: "obligation", id: "all-clear", state: "late" },
          ],
        },
      ],
    },
  },
  scoring: { rootCauseClue: "leaked-passwords", causeTargetMinute: 15 },

  idealPath: [
    { atMinute: 0, intent: { kind: "investigate", id: "overview" } },
    {
      atMinute: 3,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "I do not know yet. Looking at what the traffic is. I will update you in ten minutes.",
        promises: [{ to: "cto", what: "an update", dueInMinutes: 10 }],
      },
    },
    {
      atMinute: 4,
      intent: { kind: "investigate", id: "signin-logs" },
      why: "Before adding room for the traffic, look at what the traffic is.",
    },
    {
      atMinute: 8,
      why: "Thousands of accounts failing on wrong passwords is security's business. Call early.",
      intent: {
        kind: "communicate",
        to: ["security"],
        text: "Most sign-in attempts are failing on wrong passwords, across thousands of accounts. I need you on this now.",
        directives: ["bring-in-security"],
      },
    },
    {
      atMinute: 9,
      intent: { kind: "investigate", id: "attempt-pattern" },
    },
    {
      atMinute: 10,
      intent: {
        kind: "communicate",
        to: ["support"],
        text: "We are looking into slow sign-in. Please do not tell anyone it is fixed, or what caused it, yet.",
      },
    },
    {
      atMinute: 11,
      why: "Nobody knows yet that customers are unaffected. Post what is known: you are investigating.",
      intent: {
        kind: "communicate",
        to: ["comms"],
        text: "Please do not post that. Post that we are investigating a problem with sign-in and will say more within the hour.",
        directives: ["update-status-page"],
      },
    },
    {
      atMinute: 13,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "It is not the email. Nine in ten sign-in attempts are wrong passwords across thousands of accounts. Security is on it and we are tightening sign-in.",
      },
    },
    {
      atMinute: 14,
      intent: { kind: "mitigate", id: "tighten-signin" },
      why: "Challenge the failures and block the pattern. Real customers get through; the flood does not.",
    },
    {
      atMinute: 15,
      intent: { kind: "investigate", id: "entered-accounts" },
      why: "Some attempts will have worked. Find out how many, and what was done inside.",
    },
    {
      atMinute: 18,
      intent: {
        kind: "communicate",
        to: ["journalist"],
        text: "Sign-in has been failing for some customers this morning. We are working on the cause and will say more within the hour.",
      },
    },
    {
      atMinute: 24,
      intent: { kind: "mitigate", id: "hold-payouts" },
      why: "Payout details were changed. Hold the noon run before any money leaves.",
    },
    {
      atMinute: 25,
      intent: { kind: "mitigate", id: "lock-entered" },
      why: "Lock the entered accounts, reset them, and put the payout details back.",
    },
    {
      atMinute: 26,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "This is an attack using passwords leaked from other sites. About 2,300 customer accounts were entered and 41 had payout details changed. Sign-in is tightened, payouts are held and the accounts are being locked.",
        claims: [
          { topic: "under-attack", stance: "asserts", text: "This is an attack" },
          {
            topic: "customers-affected",
            stance: "asserts",
            text: "About 2,300 customer accounts were entered",
          },
        ],
      },
    },
    {
      atMinute: 27,
      why: "Customer accounts were entered. The regulator hears that from you, today.",
      intent: {
        kind: "communicate",
        to: ["comms"],
        text: "Customer accounts were entered by an outside party. Please notify the Payments Supervisory Board now, and update the status page to say so.",
        directives: ["notify-regulator"],
        claims: [
          {
            topic: "customers-affected",
            stance: "asserts",
            text: "Customer accounts were entered by an outside party",
          },
        ],
      },
    },
    {
      atMinute: 28,
      intent: {
        kind: "communicate",
        to: ["support"],
        text: "Customer accounts were entered using passwords leaked from other sites. Those accounts are being locked and reset. Anyone who had a sign-in alert will get an email from us.",
        claims: [
          {
            topic: "customers-affected",
            stance: "asserts",
            text: "Customer accounts were entered",
          },
        ],
      },
    },
    {
      atMinute: 29,
      intent: {
        kind: "communicate",
        to: ["journalist"],
        text: "This was an attack on customer accounts using passwords leaked from other sites. About 2,300 accounts were entered. They are being locked and their owners told.",
        claims: [
          { topic: "under-attack", stance: "asserts", text: "This was an attack" },
          {
            topic: "customers-affected",
            stance: "asserts",
            text: "About 2,300 accounts were entered",
          },
        ],
      },
    },
    { atMinute: 33, intent: { kind: "investigate", id: "verify-stopped" } },
    {
      atMinute: 36,
      intent: {
        kind: "communicate",
        to: ["cto", "support", "comms"],
        text: "The attack is stopped and every entered account is locked and restored. All clear.",
        directives: ["all-clear"],
      },
    },
  ],

  synonyms: {
    "sign-in": ["signin", "sign in", "login", "log in", "log-in", "logins", "sign-ins", "signins"],
    regulator: ["payments supervisory board", "supervisory board", "the authority"],
    capacity: ["headroom", "resources"],
    "rate-limit": ["rate limit", "rate limiting", "ratelimit", "throttle"],
    payout: ["payouts", "pay-out", "pay-outs", "withdrawal", "withdrawals"],
  },

  lessons: [
    {
      id: "looked-before-scaling",
      kind: "avoided",
      when: {
        type: "all",
        of: [
          { type: "clue", id: "failed-logins" },
          { type: "not", of: { type: "mitigation", id: "add-capacity" } },
        ],
      },
      text: "You looked at what the traffic was before making room for it. More capacity would have served the attacker.",
      evidence: { type: "clue_revealed", id: "failed-logins" },
    },
    {
      id: "added-capacity",
      kind: "fell",
      when: { type: "mitigation", id: "add-capacity" },
      text: "Adding servers made sign-in fast again for everyone, including whoever was trying stolen passwords. Find out what a flood is made of before you make room for it.",
      evidence: { type: "mitigation_applied", id: "add-capacity" },
    },
    {
      id: "said-not-affected",
      kind: "fell",
      when: { type: "claim", topic: "customers-affected", stance: "denies", truth: "false" },
      text: "You said customers were not affected before anyone had looked. It was the natural thing to say and it was wrong. 'We are investigating' was true and would have cost nothing.",
      evidence: { type: "claim", id: "customers-affected" },
    },
    {
      id: "took-it-back",
      kind: "avoided",
      when: {
        type: "all",
        of: [
          { type: "claim", topic: "customers-affected", stance: "denies", truth: "false" },
          { type: "claim", topic: "customers-affected", stance: "asserts" },
        ],
      },
      text: "You took your first statement back yourself, once you knew better. That is the hardest thing in this situation, and you did it.",
      evidence: { type: "claim_corrected" },
    },
    {
      id: "called-it-load",
      kind: "fell",
      when: { type: "claim", topic: "performance-only", stance: "asserts" },
      text: "You called it a performance problem while it still only looked like one. The first explanation is the one people repeat.",
      evidence: { type: "claim", id: "performance-only" },
    },
    {
      id: "security-early",
      kind: "avoided",
      when: { type: "obligation", id: "security-in", state: "met" },
      text: "You called security as soon as the sign-in logs looked wrong, before you were sure.",
      evidence: { type: "directive", id: "bring-in-security" },
    },
    {
      id: "security-late",
      kind: "fell",
      when: { type: "obligation", id: "security-in", state: "missed" },
      text: "Security heard about thousands of failing sign-ins from support, not from you.",
      evidence: { type: "obligation", id: "security-in" },
    },
    {
      id: "payouts-held",
      kind: "avoided",
      when: { type: "mitigation", id: "hold-payouts" },
      text: "You held the noon payouts once you knew payout details had been changed. No money left.",
      evidence: { type: "mitigation_applied", id: "hold-payouts" },
    },
    {
      id: "payouts-left",
      kind: "fell",
      when: { type: "beatFired", id: "payout-run" },
      text: "The noon payout run went ahead with changed destinations in it. Stopping the attack is not the same as undoing what it had already done.",
      evidence: { type: "alert" },
    },
    {
      id: "regulator-on-time",
      kind: "avoided",
      when: { type: "obligation", id: "notify-regulator", state: "met" },
      text: "The regulator heard from you that accounts had been entered, the same morning.",
      evidence: { type: "directive", id: "notify-regulator" },
    },
    {
      id: "regulator-missed",
      kind: "fell",
      when: { type: "obligation", id: "notify-regulator", state: "missed" },
      text: "The regulator read about the entered accounts and had to call you.",
      evidence: { type: "obligation", id: "notify-regulator" },
    },
    brokePromise,
  ],
};
