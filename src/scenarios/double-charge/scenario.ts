// Situation S-032: Double Charge. A handful of complaints about a second charge. Really the
// monthly billing run is charging people twice, and it is still going. All names are fictional.
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

const PLAYED_IT_DOWN = {
  type: "claim",
  topic: "handful-only",
  stance: "asserts",
  to: "journalist",
  corrected: false,
} as const;

export const doubleCharge: Scenario = {
  id: "double-charge",
  title: "Double Charge",
  version: 1,
  briefing: {
    role: "Payments lead at Kettlewick, a coffee subscription service",
    situation:
      "It is 09:20 on the first of the month, which is billing day. You are the payments lead at Kettlewick. Support has flagged a few complaints from customers who say they were charged twice this morning. It may be nothing: a handful of tickets out of seventy thousand subscribers. Mika Tan is the engineer on shift and will carry out what you ask.",
    canDo:
      "Type what you do, or what you tell someone, in your own words. You can look things up, give orders, and answer the people who are about to start writing to you.",
  },
  startClock: "09:20",
  lengthMinutes: 90,

  stakeholders: [
    mika("Payments engineer on shift"),
    person("boss", {
      name: "Farah Lindqvist",
      role: "Chief financial officer",
      aliases: ["cfo", "chief financial officer", "finance director"],
    }),
    person("support", { name: "Owen Mbeki", role: "Head of customer support" }),
    person("comms", { name: "Priscilla Yau", role: "Communications lead" }),
    person("journalist", {
      name: "Henrik Dahl",
      role: "Reporter, Consumer Desk",
      aliases: ["consumer desk"],
    }),
    person("outsider", {
      id: "processor",
      name: "Gustavo Reyes",
      role: "Account manager, Paylane card processing",
      wants: "To know why disputes are climbing, before his own risk team asks",
      aliases: ["paylane", "account manager", "our card processor"],
    }),
  ],

  systems: [
    {
      id: "billing-run",
      label: "Monthly billing run",
      start: "degraded",
      labels: { degraded: "Running since 06:00", ok: "Paused" },
    },
    {
      id: "refunds",
      label: "Refunds",
      start: "ok",
      labels: { ok: "None issued", degraded: "On their way" },
    },
    {
      id: "notice",
      label: "Notice to customers",
      start: "ok",
      labels: { ok: "Nothing posted", degraded: "Notice posted" },
    },
  ],

  metrics: [
    {
      id: "doubleCharged",
      label: "Customers charged twice",
      visibleWhen: { type: "clue", id: "scope" },
    },
  ],
  driverMetric: "doubleCharged",
  startMode: "running",
  modes: {
    running: [
      {
        kind: "curve",
        points: [
          [0, 9000],
          [90, 22500],
        ],
      },
    ],
    // A deploy restarts the billing worker, which sends its whole batch in flight again.
    redeployed: [{ kind: "follow", mode: "running", multiplier: 1.25 }],
    paused: [{ kind: "hold" }],
    refunded: [{ kind: "ramp", over: 5, to: 0 }],
  },
  severeAbove: 14000,

  clues: [
    {
      id: "handful",
      kind: "symptom",
      fact: "Support has 14 tickets about a second charge. Card payments are going through and nothing is down.",
      leakTerms: ["14 tickets"],
    },
    {
      id: "not-ordered-twice",
      kind: "redHerring",
      fact: "None of these customers ordered twice. Each has one subscription and two charges for it, minutes apart.",
      leakTerms: ["minutes apart", "ordered twice"],
    },
    {
      id: "not-pending",
      kind: "redHerring",
      fact: "These are not pending holds that will drop off. Both charges have settled and the money has left the customers' accounts.",
      leakTerms: ["both charges have settled", "pending holds"],
    },
    {
      id: "still-running",
      kind: "true",
      fact: "The monthly billing run started at 06:00 and is still going. Every charge that times out is being sent a second time.",
      leakTerms: ["still going", "sent a second time"],
    },
    {
      id: "retry-bug",
      kind: "true",
      fact: "Yesterday's release changed the retry rule: a charge that times out is sent again even when the first attempt went through.",
      leakTerms: ["retry rule", "even when the first attempt"],
    },
    {
      id: "scope",
      kind: "true",
      fact: "The card processor's records show 9,000 customers charged twice by 09:20, and they name every one.",
      leakTerms: ["9,000 customers", "name every one"],
    },
    {
      id: "overdrafts",
      kind: "true",
      fact: "The second charge has pushed some customers into overdraft, and their banks are charging them fees for it.",
      leakTerms: ["into overdraft", "charging them fees"],
    },
    {
      id: "stopped",
      kind: "true",
      fact: "The billing run is paused, no charge has gone out since, and every duplicate has a refund on its way.",
      leakTerms: ["refund on its way"],
    },
  ],

  investigations: [
    {
      id: "overview",
      label: "Look at the overall picture",
      durationMinutes: 2,
      examples: [
        "How many complaints are there?",
        "What does support have so far?",
        "Is anything down in payments?",
        ...ASKS.overview,
      ],
      reveals: ["handful"],
      resultPurpose: "Report the handful of tickets and that nothing is down",
      resultText:
        "Mika: Support has 14 tickets about a second charge. Card payments are going through and nothing is down. On the face of it, a handful.",
    },
    {
      id: "ticket-sample",
      label: "Look at a few of the complaints in detail",
      durationMinutes: 3,
      examples: [
        "Open three of the tickets and check the charges",
        "Did these customers order twice?",
        "Are the second charges just pending holds?",
        "Look at one customer's card history",
        "Check a sample of the complaints",
      ],
      reveals: ["not-ordered-twice", "not-pending"],
      resultPurpose: "Rule out customer error and pending holds",
      resultText:
        "Mika: None of these customers ordered twice. Each has one subscription and two charges for it, minutes apart. These are not pending holds that will drop off. Both charges have settled and the money has left the customers' accounts.",
    },
    {
      id: "billing-run",
      label: "Check what the billing run is doing right now",
      durationMinutes: 2,
      examples: [
        "Is the billing run still going?",
        "Is this still happening?",
        "What is the monthly billing job doing?",
        "Are duplicate charges still being made?",
        "Look at the billing job's progress",
      ],
      reveals: ["still-running"],
      resultPurpose: "Report that the run is live and still producing duplicates",
      resultText:
        "Mika: The monthly billing run started at 06:00 and is still going. Every charge that times out is being sent a second time. It is still happening.",
    },
    {
      id: "processor-records",
      label: "Pull today's charges from the processor and count the duplicates",
      durationMinutes: 4,
      examples: [
        "How many customers were charged twice?",
        "Count the duplicate charges",
        "Get today's transactions from Paylane and find the doubles",
        "List each customer who was billed twice",
        ...ASKS.whoIsAffected,
      ],
      reveals: ["scope"],
      resultPurpose: "Report the number charged twice and that every one is named",
      resultText:
        "Mika: The card processor's records show 9,000 customers charged twice by 09:20, and they name every one. Not a handful.",
    },
    {
      id: "recent-changes",
      label: "Find out what changed in billing recently",
      durationMinutes: 3,
      examples: [
        "What was in yesterday's billing release?",
        "Did we change anything in payments this week?",
        "Look at the last deploy to billing",
        ...ASKS.whatChanged,
      ],
      reveals: ["retry-bug"],
      resultPurpose: "Find the changed retry rule",
      resultText:
        "Mika: Yesterday's release changed the retry rule: a charge that times out is sent again even when the first attempt went through. That is the cause.",
    },
    {
      id: "billing-logs",
      label: "Read the billing logs for the duplicated charges",
      durationMinutes: 4,
      examples: [
        "What do the billing logs say about the second charges?",
        "Trace one duplicate through the logs",
        "Why is a charge being sent twice?",
        "Look at the timeouts in the billing logs",
        "Follow a double charge from start to finish",
      ],
      reveals: ["retry-bug", "still-running"],
      resultPurpose: "Show the retry after a timeout, from the logs",
      resultText:
        "Mika: The logs show it. Yesterday's release changed the retry rule: a charge that times out is sent again even when the first attempt went through. The monthly billing run started at 06:00 and is still going. Every charge that times out is being sent a second time.",
    },
    {
      id: "bank-fees",
      label: "Find out whether customers are being hit with bank fees",
      durationMinutes: 3,
      requires: { type: "clue", id: "scope" },
      examples: [
        "Has the second charge pushed anyone into overdraft?",
        "Are customers being charged fees by their banks?",
        "What has this cost the customers beyond the charge itself?",
        "Check for overdraft complaints",
        "Is anyone out of pocket beyond the duplicate?",
      ],
      reveals: ["overdrafts"],
      resultPurpose: "Report the overdrafts and bank fees",
      resultText:
        "Mika: The second charge has pushed some customers into overdraft, and their banks are charging them fees for it.",
    },
    {
      id: "verify-stopped",
      label: "Confirm no charge has gone out since the pause and every duplicate has a refund",
      durationMinutes: 2,
      requires: { type: "mitigation", id: "refund-duplicates" },
      examples: [
        "Confirm the refunds have all been issued",
        "Has any charge gone out since we paused?",
        "Check every duplicate has a refund",
        ...ASKS.isItOver,
      ],
      reveals: ["stopped"],
      resultPurpose: "Confirm it has stopped and the refunds are out",
      resultText:
        "Mika: The billing run is paused, no charge has gone out since, and every duplicate has a refund on its way.",
    },
  ],

  mitigations: [
    {
      id: "pause-billing",
      label: "Pause the billing run",
      durationMinutes: 2,
      kind: "partial",
      examples: [
        "Stop the billing job now",
        "Pause the monthly billing run",
        "Halt all charges until we understand this",
        "Stop charging customers",
        "Put the billing run on hold",
      ],
      onComplete: { mode: "paused", systems: { "billing-run": "ok" } },
      resultPurpose: "Report that no more charges are going out",
      resultText:
        "Mika: The billing run is paused. No charge is going out. Customers not yet billed this month will have to be billed later.",
    },
    {
      id: "refund-duplicates",
      label: "Refund every duplicate charge through the processor",
      durationMinutes: 6,
      kind: "fix",
      requires: {
        type: "all",
        of: [
          { type: "mitigation", id: "pause-billing" },
          { type: "clue", id: "scope" },
        ],
      },
      examples: [
        "Refund all the second charges",
        "Refund the duplicates from the processor's list",
        "Give the double-charged customers their money back",
        "Issue refunds for the duplicate charges",
        "Reverse every double charge",
      ],
      onComplete: { mode: "refunded", systems: { refunds: "degraded" } },
      resultPurpose: "Report that refunds are with the processor",
      resultText:
        "Mika: The processor has the full list and the refunds are going out. Customers will see the money back in 3 to 5 working days.",
      facts: ["Refunds take 3 to 5 working days to arrive."],
    },
    {
      id: "fix-retry",
      label: "Fix the retry rule, now that the run is paused",
      durationMinutes: 8,
      kind: "partial",
      requires: {
        type: "all",
        of: [
          { type: "mitigation", id: "pause-billing" },
          { type: "clue", id: "retry-bug" },
        ],
      },
      examples: [
        "Now it is paused, fix the retry rule",
        "Correct the retry rule before billing resumes",
        "Patch the retry logic while billing is stopped",
        "Repair the retry rule so the run can restart safely",
        "With billing halted, put the retry rule right",
      ],
      onComplete: { systems: {} },
      resultPurpose: "Report that the rule is fixed and tested, with the run still paused",
      resultText:
        "Mika: The retry rule is fixed and tested. The run is still paused, so nothing was charged while I worked on it.",
    },
    {
      id: "hotfix-live",
      label: "Fix the retry bug and deploy it while the billing run continues",
      durationMinutes: 8,
      kind: "harmful",
      examples: [
        "Fix the bug and deploy it now",
        "Hotfix the retry code and ship it",
        "Roll back yesterday's release while billing keeps running",
        "Deploy a fix to the live billing run",
        "Patch billing in place without stopping it",
      ],
      onComplete: { mode: "redeployed" },
      resultPurpose: "Report that the deploy restarted the run and made more duplicates",
      resultText:
        "Mika: The fix is deployed. Charges kept going out for the 8 minutes it took, and the deploy restarted the billing worker, which sent its whole batch in flight again.",
      facts: ["The deploy took 8 minutes."],
    },
    {
      id: "refund-everything",
      label: "Refund every charge made today",
      durationMinutes: 4,
      kind: "noEffect",
      examples: [
        "Refund all of today's charges",
        "Refund the lot, every charge from today",
        "Reverse the whole billing run",
        "Give every customer their money back for this month",
        "Undo all of this morning's payments",
      ],
      onComplete: { systems: {} },
      resultPurpose: "Report that the processor will not run a blanket refund",
      resultText:
        "Mika: Paylane will not run that. It would refund every correct charge as well as the duplicates, and it needs the list of which is which. Nothing has been refunded.",
    },
  ],

  directives: [
    {
      id: "post-notice",
      label: "Post a notice to customers",
      toAny: ["comms"],
      examples: [
        "Tell comms to post a notice to customers",
        "Priscilla, put out a statement about the double charges",
        "Email customers and say what happened",
        "Get a public notice up",
        "Publish an apology and what we are doing",
      ],
      effects: { systems: { notice: "degraded" } },
    },
    {
      id: "tell-processor",
      label: "Tell the card processor what happened",
      toAny: ["processor"],
      examples: [
        "Tell Paylane what is going on",
        "Gustavo, we have a billing fault and disputes will rise",
        "Warn the processor that refunds and disputes are coming",
        "Call our account manager at Paylane",
        "Let the card processor know before their risk team asks",
      ],
    },
    {
      id: "cover-fees",
      label: "Tell support to cover customers' bank fees",
      toAny: ["support"],
      examples: [
        "Tell support to cover any bank fees",
        "Owen, we will pay back overdraft fees caused by this",
        "Offer to reimburse bank charges",
        "Tell Owen we will reimburse overdraft fees",
        "Make sure nobody is out of pocket for bank fees",
      ],
    },
    allClear(),
  ],

  claimTopics: [
    {
      id: "handful-only",
      statement: "Only a handful of customers were charged twice",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["scope"],
      phrases: ["handful", "small number", "few customers", "isolated", "very few"],
      surfacesWhen: { type: "minuteAtLeast", value: 40 },
    },
    {
      id: "pending-hold",
      statement: "The second charge is a pending hold that will drop off",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["not-pending"],
      phrases: ["pending", "drop off", "temporary hold", "will disappear", "authorisation hold"],
      surfacesWhen: { type: "clue", id: "not-pending" },
    },
    {
      id: "scope-known",
      statement: "9,000 customers were charged twice",
      statementTrue: true,
      supportsAsserts: ["scope"],
      supportsDenies: [],
      phrases: ["9,000", "9000", "nine thousand"],
    },
    {
      id: "cause-known",
      statement: "The cause is a fault in yesterday's billing release",
      statementTrue: true,
      supportsAsserts: ["retry-bug"],
      supportsDenies: [],
      phrases: [
        "retry rule",
        "retry bug",
        "yesterday's release",
        "found the cause",
        "know the cause",
      ],
    },
  ],

  obligations: [
    {
      id: "customers-told",
      label: "Customers told",
      trigger: { type: "clue", id: "scope" },
      withinMinutes: 15,
      satisfiedBy: { directive: "post-notice", toAny: ["comms"] },
    },
    {
      id: "processor-told",
      label: "Card processor told",
      trigger: { type: "clue", id: "scope" },
      withinMinutes: 15,
      satisfiedBy: { directive: "tell-processor", toAny: ["processor"] },
    },
    allClearDuty("stopped", ["cto", "support", "comms"]),
  ],

  beats: [
    {
      id: "alert",
      from: "system",
      channel: "log",
      when: { atMinute: 0 },
      purpose: "Open the incident with support's flag",
      facts: ["Support has flagged complaints about a second charge this morning."],
      fallbackText:
        "NOTICE {clock}: support has flagged a cluster of complaints about a second charge this morning.",
    },
    {
      id: "cfo-how-many",
      from: "cto",
      channel: "chat",
      when: { atMinute: 3 },
      purpose: "Ask how many and whether it is still happening, within 10 minutes",
      facts: ["The chief financial officer wants to know within 10 minutes."],
      fallbackText:
        "Farah: Support says some customers were billed twice. How many, and is it still happening? I want to know in 10 minutes.",
    },
    {
      id: "support-pending",
      from: "support",
      channel: "chat",
      when: { atMinute: 5, jitter: 2 },
      purpose: "Offer the natural, wrong line for approval",
      facts: ["Support wants to say the second charge is a pending hold."],
      fallbackText:
        "Owen: My agents are asking what to say. Can I tell people the second charge is a pending hold that will drop off by itself?",
    },
    {
      id: "processor-disputes",
      from: "processor",
      channel: "email",
      when: { atMinute: 11, jitter: 2 },
      purpose: "The processor asks why disputes are climbing",
      facts: ["Disputes on the account are climbing."],
      fallbackText:
        "Gustavo Reyes, Paylane: Disputes on your account are climbing fast this morning. What is going on? If the rate keeps rising, the account goes to review.",
    },
    bossAsksAgain("Farah", 13, "How many, and is it still happening?"),
    {
      id: "journalist-readers",
      from: "journalist",
      channel: "press",
      when: { atMinute: 18, jitter: 2 },
      purpose: "Ask how many and when refunds come, before publishing",
      facts: ["The piece will be published at 10:00."],
      fallbackText:
        "Henrik Dahl, Consumer Desk: Readers say Kettlewick has charged them twice today. How many customers, and when do they get their money back? I publish at 10:00.",
    },
    {
      id: "comms-screenshots",
      from: "comms",
      channel: "chat",
      when: { atMinute: 21 },
      unless: { type: "directiveSent", id: "post-notice" },
      purpose: "Point out that customers are posting and nothing has been said",
      facts: ["Customers are posting screenshots of two charges."],
      fallbackText:
        "Priscilla: People are posting screenshots of two charges and we have said nothing. What do I post?",
    },
    {
      id: "support-overdraft",
      from: "support",
      channel: "chat",
      when: { atMinute: 26 },
      unless: { type: "directiveSent", id: "cover-fees" },
      purpose: "A customer is in overdraft because of the second charge",
      facts: ["A customer has been charged a bank fee because of the second charge."],
      fallbackText:
        "Owen: A customer says the second charge put her into overdraft and her bank has charged her a fee. Do we cover that?",
    },
    {
      id: "press-fair",
      from: "journalist",
      channel: "press",
      when: { atMinute: 40 },
      unless: PLAYED_IT_DOWN,
      purpose: "Publish a fair piece about the double charges",
      facts: ["Kettlewick customers were charged twice on billing day."],
      fallbackText:
        "Consumer Desk: Kettlewick customers charged twice on billing day. Readers have sent in statements showing two payments minutes apart.",
    },
    {
      id: "press-harsh",
      from: "journalist",
      channel: "press",
      when: {
        condition: { type: "all", of: [{ type: "minuteAtLeast", value: 40 }, PLAYED_IT_DOWN] },
      },
      purpose: "Set the company's small number against the processor's records",
      facts: ["Thousands of customers were charged twice."],
      quotesClaim: "handful-only",
      fallbackText:
        'Consumer Desk: Kettlewick told us: "{quote}". Statements sent in by readers, and a source at its card processor, put the number in the thousands.',
    },
    {
      id: "cfo-redeploy",
      from: "cto",
      channel: "chat",
      when: { condition: { type: "mitigation", id: "hotfix-live" }, delayMinutes: 2 },
      purpose: "Ask what was done, after the count jumped",
      facts: ["Customers charged twice rose to {doubleCharged}."],
      fallbackText:
        "Farah: I am told the number charged twice has just jumped to {doubleCharged}. What did we do?",
    },
    {
      id: "support-pending-wrong",
      from: "support",
      channel: "chat",
      when: {
        condition: {
          type: "all",
          of: [
            { type: "claim", topic: "pending-hold", stance: "asserts" },
            { type: "clue", id: "not-pending" },
          ],
        },
      },
      purpose: "Confront the player with the line support was given",
      facts: ["Both charges have settled."],
      quotesClaim: "pending-hold",
      fallbackText:
        'Owen: You told me: "{quote}". Both charges have settled. My agents have spent the morning telling people it would sort itself out.',
    },
    {
      id: "processor-review",
      from: "processor",
      channel: "email",
      when: { condition: { type: "obligation", id: "processor-told", state: "missed" } },
      purpose: "The processor puts the account under review, having heard nothing",
      facts: ["The dispute rate has passed the processor's limit."],
      fallbackText:
        "Gustavo Reyes, Paylane: Your dispute rate has passed our limit and nobody at Kettlewick has told us why. The account is under review from now.",
    },
    bossMissed("Farah", "The chief financial officer"),
    {
      id: "comms-after",
      from: "comms",
      channel: "chat",
      when: { condition: { type: "clue", id: "stopped" } },
      purpose: "Ask what to tell customers now refunds are out",
      facts: ["The charges have stopped and refunds are out."],
      fallbackText:
        "Priscilla: If it has stopped and refunds are going out, what do I tell customers about when they will see the money?",
    },
  ],

  endings: {
    ctoTrustFloor: 15,
    resolvedWhen: {
      type: "all",
      of: [
        { type: "mitigation", id: "refund-duplicates" },
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
  scoring: { rootCauseClue: "retry-bug", causeTargetMinute: 20 },

  idealPath: [
    { atMinute: 0, intent: { kind: "investigate", id: "overview" } },
    {
      atMinute: 3,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "I do not know yet. Finding out now. I will update you in ten minutes.",
        promises: [{ to: "cto", what: "an update", dueInMinutes: 10 }],
      },
    },
    {
      atMinute: 4,
      intent: { kind: "investigate", id: "billing-run" },
      why: "The first question is not why. It is whether it is still happening.",
    },
    {
      atMinute: 7,
      intent: { kind: "mitigate", id: "pause-billing" },
      why: "Stop the charges first. The cause can wait ten minutes; the customers cannot.",
    },
    {
      atMinute: 8,
      intent: { kind: "investigate", id: "processor-records" },
      why: "Fourteen tickets is what reached support. The processor's records are what happened.",
    },
    {
      atMinute: 9,
      why: "Nobody has checked that. Give support a line that is true whatever turns up.",
      intent: {
        kind: "communicate",
        to: ["support"],
        text: "Please do not say that. Tell them we are looking into it now and that nobody will be left out of pocket.",
      },
    },
    {
      atMinute: 13,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "It was still happening: the billing run was sending some charges twice. It is paused now and I am counting the duplicates.",
      },
    },
    {
      atMinute: 14,
      why: "The processor sees the disputes before you do. Tell them before their risk team asks.",
      intent: {
        kind: "communicate",
        to: ["processor"],
        text: "We had a billing fault this morning that charged 9,000 customers twice. The run is paused and we will send you the list for refund.",
        directives: ["tell-processor"],
        claims: [
          { topic: "scope-known", stance: "asserts", text: "charged 9,000 customers twice" },
        ],
      },
    },
    {
      atMinute: 15,
      intent: { kind: "mitigate", id: "refund-duplicates" },
      why: "The processor names every duplicate. Refund them all without waiting to be asked.",
    },
    {
      atMinute: 16,
      why: "Customers are posting their statements. They should read what happened from you.",
      intent: {
        kind: "communicate",
        to: ["comms"],
        text: "Please post: a fault in this morning's billing run charged about 9,000 customers twice. Billing is paused and every duplicate is being refunded automatically.",
        directives: ["post-notice"],
        claims: [
          { topic: "scope-known", stance: "asserts", text: "charged about 9,000 customers twice" },
        ],
      },
    },
    { atMinute: 17, intent: { kind: "investigate", id: "recent-changes" } },
    {
      atMinute: 21,
      intent: {
        kind: "communicate",
        to: ["journalist"],
        text: "About 9,000 customers were charged twice this morning by a fault in our billing run. It is stopped and every duplicate is being refunded today, without anyone having to ask.",
        claims: [
          {
            topic: "scope-known",
            stance: "asserts",
            text: "About 9,000 customers were charged twice",
          },
        ],
      },
    },
    { atMinute: 22, intent: { kind: "investigate", id: "bank-fees" } },
    {
      atMinute: 24,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "9,000 customers were charged twice. The cause is the retry rule changed in yesterday's release. Billing is paused, refunds are with the processor and customers have been told.",
        claims: [
          { topic: "scope-known", stance: "asserts", text: "9,000 customers were charged twice" },
          { topic: "cause-known", stance: "asserts", text: "The cause is the retry rule" },
        ],
      },
    },
    {
      atMinute: 28,
      why: "A refund does not undo a bank fee. Make the customer whole, not just the charge.",
      intent: {
        kind: "communicate",
        to: ["support"],
        text: "Some customers have been pushed into overdraft by the second charge. Please cover any bank fee it caused, on request, no questions.",
        directives: ["cover-fees"],
      },
    },
    { atMinute: 29, intent: { kind: "investigate", id: "verify-stopped" } },
    {
      atMinute: 32,
      intent: {
        kind: "communicate",
        to: ["cto", "support", "comms"],
        text: "Billing is paused, every duplicate has a refund on its way and customers have been told. All clear.",
        directives: ["all-clear"],
      },
    },
  ],

  synonyms: {
    billing: ["billing run", "billing job", "monthly billing", "the run"],
    processor: ["paylane", "card processor", "payment processor", "acquirer"],
    duplicate: ["duplicates", "double charge", "double charges", "second charge", "second charges"],
    refund: ["refunds", "reimburse", "money back", "pay back"],
  },

  lessons: [
    {
      id: "stopped-it-first",
      kind: "avoided",
      when: {
        type: "all",
        of: [
          { type: "mitigation", id: "pause-billing" },
          { type: "not", of: { type: "mitigation", id: "hotfix-live" } },
        ],
      },
      text: "You stopped the charges before you went looking for the cause. Every minute spent debugging a live run was more customers charged twice.",
      evidence: { type: "mitigation_applied", id: "pause-billing" },
    },
    {
      id: "fixed-it-live",
      kind: "fell",
      when: { type: "mitigation", id: "hotfix-live" },
      text: "You fixed the code while the run kept charging. It charged for every minute of that work, and the deploy restarted the batch. Stop the harm, then fix the cause.",
      evidence: { type: "mitigation_applied", id: "hotfix-live" },
    },
    {
      id: "blanket-refund",
      kind: "fell",
      when: { type: "mitigation", id: "refund-everything" },
      text: "Refunding everything is not a plan the processor can run. They need to know which charges are the duplicates, and their records already say.",
      evidence: { type: "mitigation_applied", id: "refund-everything" },
    },
    {
      id: "called-it-a-handful",
      kind: "fell",
      when: { type: "claim", topic: "handful-only", stance: "asserts" },
      text: "You called it a handful. Fourteen tickets was what had reached support, not what had happened. Count before you put a size on it.",
      evidence: { type: "claim", id: "handful-only" },
    },
    {
      id: "said-pending",
      kind: "fell",
      when: { type: "claim", topic: "pending-hold", stance: "asserts" },
      text: "You let support say the second charge would drop off. It had already settled. Agents repeated that line all morning.",
      evidence: { type: "claim", id: "pending-hold" },
    },
    {
      id: "told-the-processor",
      kind: "avoided",
      when: { type: "obligation", id: "processor-told", state: "met" },
      text: "The processor heard about the fault from you, with the number, before its own risk team went looking.",
      evidence: { type: "directive", id: "tell-processor" },
    },
    {
      id: "processor-in-the-dark",
      kind: "fell",
      when: { type: "obligation", id: "processor-told", state: "missed" },
      text: "The processor watched disputes climb with no word from you and put the account under review.",
      evidence: { type: "obligation", id: "processor-told" },
    },
    {
      id: "covered-the-fees",
      kind: "avoided",
      when: { type: "directiveSent", id: "cover-fees" },
      text: "You covered the bank fees the second charge caused. A refund puts back the charge; it does not put back what the charge cost.",
      evidence: { type: "directive", id: "cover-fees" },
    },
    {
      id: "customers-told-late",
      kind: "fell",
      when: {
        type: "any",
        of: [
          { type: "obligation", id: "customers-told", state: "missed" },
          { type: "obligation", id: "customers-told", state: "late" },
        ],
      },
      text: "Customers were comparing bank statements in public while the company said nothing.",
      evidence: { type: "obligation", id: "customers-told" },
    },
    brokePromise,
  ],
};
