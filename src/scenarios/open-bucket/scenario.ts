// Situation S-011: Open Bucket. A data exposure with nothing down. See the brief in
// docs/03-design/scenarios.md. All names are fictional.
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

export const openBucket: Scenario = {
  id: "open-bucket",
  title: "Open Bucket",
  version: 1,
  briefing: {
    role: "Head of engineering at Tendwell, which makes booking software for clinics",
    situation:
      "It is 16:40 on a Friday. You are head of engineering at Tendwell. A security researcher has just emailed: a file of patient appointments from your system is readable by anyone who has the link, and a journalist has the same tip. Nothing is down and no alarm has gone off. Mika Tan is the engineer on shift and will carry out what you ask.",
    canDo:
      "Type what you do, or what you tell someone, in your own words. You can look things up, give orders, and answer the people who are about to start writing to you.",
  },
  startClock: "16:40",
  lengthMinutes: 90,

  stakeholders: [
    mika("Platform engineer on shift"),
    person("boss", {
      name: "Helen Brandt",
      role: "Chief executive",
      aliases: ["ceo", "chief executive", "chief exec"],
    }),
    person("counsel", {
      name: "Samir Qureshi",
      role: "General counsel and data protection officer",
      wants: "The scope in writing: what data, how many patients, and who has had it",
      aliases: ["dpo", "data protection officer"],
    }),
    person("comms", { name: "Odile Ferreira", role: "Communications lead" }),
    person("journalist", {
      name: "Nate Okafor",
      role: "Reporter, The Ledger Post",
      aliases: ["ledger post", "the ledger"],
    }),
    person("outsider", {
      id: "researcher",
      name: "Rosa Vasquez",
      role: "Independent security researcher",
      wants: "To know the report was received and the files are closed",
      aliases: ["researcher", "the researcher", "security researcher"],
    }),
    person("customer", {
      name: "Ingrid Solberg",
      role: "Practice manager, Northgate Clinics",
      wants: "To know what to tell her patients",
      aliases: ["northgate", "northgate clinics", "practice manager", "the clinic manager"],
    }),
    person("regulator", {
      name: "Duty desk",
      role: "Data Protection Office",
      aliases: ["data protection office", "duty desk", "the office"],
    }),
  ],

  systems: [
    {
      id: "export-store",
      label: "Export storage location",
      start: "degraded",
      labels: {
        degraded: "Readable by anyone with the link",
        ok: "Private",
        down: "Deleted",
      },
    },
    { id: "booking-app", label: "Booking application", start: "ok" },
    {
      id: "notice",
      label: "Public notice",
      start: "ok",
      labels: { ok: "Nothing posted", degraded: "Notice posted" },
    },
  ],

  metrics: [
    {
      id: "unaccounted",
      label: "Patients unaccounted for",
      visibleWhen: {
        type: "any",
        of: [
          { type: "clue", id: "export-contents" },
          { type: "mitigation", id: "delete-store" },
        ],
      },
    },
  ],
  driverMetric: "unaccounted",
  startMode: "open",
  modes: {
    // Tonight's export runs at 17:30 and adds the week's new patients to what is public.
    open: [
      {
        kind: "curve",
        points: [
          [0, 38000],
          [49, 38000],
          [50, 39400],
          [90, 39400],
        ],
      },
    ],
    closed: [{ kind: "hold" }],
    // With the logs gone nobody can say whose records were taken, so it is everyone on the system.
    lost: [{ kind: "ramp", over: 1, to: 52000 }, { kind: "hold" }],
    accounted: [{ kind: "ramp", over: 3, to: 0 }],
  },
  severeAbove: 45000,

  clues: [
    {
      id: "whole-location-public",
      kind: "true",
      fact: "The link opens a whole storage location, not one file. It holds 21 nightly exports and anyone with the link can read them all.",
      leakTerms: ["whole storage location", "nightly exports"],
    },
    {
      id: "export-contents",
      kind: "true",
      fact: "Each export lists patients by name with a phone number and the reason for the appointment: 38,000 patients across 41 clinics.",
      leakTerms: ["reason for the appointment", "38,000 patients"],
    },
    {
      id: "backup-job",
      kind: "true",
      fact: "A backup job set up 21 days ago writes a full export there every night at 17:30. The location was created public and nobody changed it.",
      leakTerms: ["backup job", "created public"],
    },
    {
      id: "who-downloaded",
      kind: "true",
      fact: "The access logs show downloads by the researcher and by 2 addresses nobody recognises.",
      leakTerms: ["addresses nobody recognises", "2 addresses"],
    },
    {
      id: "no-app-breakin",
      kind: "redHerring",
      fact: "Nobody broke into the booking application. No sign-in alarm fired and nothing in the database was read out of turn.",
      leakTerms: ["nobody broke into", "no sign-in alarm"],
    },
    {
      id: "researcher-genuine",
      kind: "redHerring",
      fact: "The researcher is who she says she is. She has reported flaws to other companies and asks for nothing.",
      leakTerms: ["asks for nothing", "who she says she is"],
    },
    {
      id: "contained",
      kind: "true",
      fact: "The location is private, the link no longer opens anything, and nothing has been downloaded since.",
      leakTerms: ["no longer opens anything"],
    },
  ],

  investigations: [
    {
      id: "open-the-link",
      label: "Open the link the researcher sent and see what is there",
      durationMinutes: 2,
      examples: [
        "Open the link from the researcher",
        "Is the report true?",
        "Is the researcher right about this?",
        "Look at what the researcher found",
        "Check whether that file is really public",
        ...ASKS.overview,
      ],
      reveals: ["whole-location-public"],
      resultPurpose: "Confirm the report and show it is the whole location, not one file",
      resultText:
        "Mika: It is true, and it is more than she said. The link opens a whole storage location, not one file. It holds 21 nightly exports and anyone with the link can read them all.",
    },
    {
      id: "export-contents",
      label: "Open an export and see what data is in it",
      durationMinutes: 3,
      examples: [
        "What is in the exports?",
        "Open one of the files and tell me what data it holds",
        "What data is exposed?",
        "How many patients are in those files?",
        "Is there anything sensitive in the exports?",
        ...ASKS.whoIsAffected,
      ],
      reveals: ["export-contents"],
      resultPurpose: "Report what the exports hold and for how many patients",
      resultText:
        "Mika: Each export lists patients by name with a phone number and the reason for the appointment: 38,000 patients across 41 clinics.",
    },
    {
      id: "storage-setup",
      label: "Find out what writes to the storage location and how it was set up",
      durationMinutes: 3,
      examples: [
        "What writes to that storage location?",
        "How did the exports get there?",
        "Who set up that bucket, and why is it public?",
        "Where do these files come from?",
        "What job produces the exports, and where is it coming from?",
        "Look at how the storage is configured",
      ],
      reveals: ["backup-job"],
      resultPurpose: "Report the backup job and that the location was created public",
      resultText:
        "Mika: A backup job set up 21 days ago writes a full export there every night at 17:30. The location was created public and nobody changed it.",
    },
    {
      id: "recent-changes",
      label: "Find out what changed in the last few weeks",
      durationMinutes: 3,
      examples: [
        "What changed three weeks ago?",
        "Any new jobs or infrastructure added this month?",
        "Go through recent changes to the platform",
        ...ASKS.whatChanged,
      ],
      reveals: ["backup-job"],
      resultPurpose: "Find the backup job by way of the change history",
      resultText:
        "Mika: One change stands out. A backup job set up 21 days ago writes a full export there every night at 17:30. The location was created public and nobody changed it.",
    },
    {
      id: "access-logs",
      label: "Read the storage access logs to see who downloaded what",
      durationMinutes: 6,
      requires: { type: "not", of: { type: "mitigation", id: "delete-store" } },
      examples: [
        "Who has downloaded the exports?",
        "Read the access logs for the storage location",
        "Has anyone other than the researcher opened these files?",
        "Pull the download history",
        "Find out who accessed the bucket",
        "Who else opened the files?",
      ],
      reveals: ["who-downloaded"],
      resultPurpose: "Report who downloaded the exports",
      resultText:
        "Mika: The access logs show downloads by the researcher and by 2 addresses nobody recognises.",
    },
    {
      id: "app-intrusion",
      label: "Check whether the booking application was broken into",
      durationMinutes: 5,
      examples: [
        "Were we hacked?",
        "Has anyone broken into the booking app?",
        "Look for signs of an intrusion",
        "Check the application and the database for a break-in",
        "Is this an attack on our systems?",
      ],
      reveals: ["no-app-breakin"],
      resultPurpose: "Rule out a break-in to the application",
      resultText:
        "Mika: Nobody broke into the booking application. No sign-in alarm fired and nothing in the database was read out of turn. The files were simply left where anyone could read them.",
    },
    {
      id: "researcher-check",
      label: "Check who the researcher is",
      durationMinutes: 3,
      examples: [
        "Who is this researcher?",
        "Is the researcher's email genuine?",
        "Is this a scam or a ransom demand?",
        "Look up Rosa Vasquez",
        "Is she asking for money?",
        "Does the researcher want paying?",
      ],
      reveals: ["researcher-genuine"],
      resultPurpose: "Show the researcher is genuine and wants nothing",
      resultText:
        "Mika: The researcher is who she says she is. She has reported flaws to other companies and asks for nothing.",
    },
    {
      id: "verify-contained",
      label: "Confirm the location is closed and nothing more is leaving",
      durationMinutes: 2,
      requires: { type: "mitigation", id: "make-private" },
      examples: [
        "Confirm the link no longer works",
        "Is the storage location really private now?",
        "Check that nothing has been downloaded since we closed it",
        "Try the researcher's link again",
        "Is the link dead?",
        ...ASKS.isItOver,
      ],
      reveals: ["contained"],
      resultPurpose: "Confirm the exposure has stopped",
      resultText:
        "Mika: The location is private, the link no longer opens anything, and nothing has been downloaded since.",
    },
  ],

  mitigations: [
    {
      id: "make-private",
      label: "Make the storage location private and keep everything in it",
      durationMinutes: 2,
      kind: "partial",
      requires: { type: "not", of: { type: "mitigation", id: "delete-store" } },
      examples: [
        "Make the bucket private",
        "Lock the storage location down but do not delete anything",
        "Turn off public access and keep the logs",
        "Close the link, leave the files where they are",
        "Restrict the storage to our own staff",
      ],
      onComplete: { mode: "closed", systems: { "export-store": "ok" } },
      resultPurpose: "Report that access is closed and the evidence is intact",
      resultText:
        "Mika: The location is private and tonight's export will stay private too. Nothing was deleted: the exports and the access logs are all still there.",
    },
    {
      id: "send-clinic-notices",
      label: "Send each clinic the list of its patients and what was taken",
      durationMinutes: 5,
      kind: "fix",
      requires: {
        type: "all",
        of: [
          { type: "mitigation", id: "make-private" },
          { type: "clue", id: "export-contents" },
          { type: "clue", id: "who-downloaded" },
        ],
      },
      examples: [
        "Send every affected clinic its list of patients",
        "Tell each clinic which of its patients were in the exports",
        "Notify the 41 clinics with the details",
        "Get the per-clinic patient lists out",
        "Write to the clinics with what was exposed and who downloaded it",
      ],
      onComplete: { mode: "accounted" },
      resultPurpose: "Report that every clinic has its list",
      resultText:
        "Mika: All 41 clinics have their list: which patients, what was in the files, and that 2 unknown addresses downloaded them.",
      facts: ["41 clinics were sent their list.", "2 unknown addresses downloaded the files."],
    },
    {
      id: "delete-store",
      label: "Delete the storage location and everything in it",
      durationMinutes: 2,
      kind: "harmful",
      examples: [
        "Delete the bucket",
        "Wipe the storage location now",
        "Remove all the exports immediately",
        "Just delete those files",
        "Get rid of the whole storage location",
      ],
      onComplete: { mode: "lost", systems: { "export-store": "down" } },
      resultPurpose: "Report that the logs went with the files",
      resultText:
        "Mika: Deleted. The access logs were kept inside the same location and went with it. We can no longer say who downloaded anything, so we have to treat all 52,000 patients on the system as exposed.",
      facts: ["52,000 patients are on the system."],
    },
    {
      id: "notify-all-clinics",
      label: "Tell every clinic that all of its patients must be treated as exposed",
      durationMinutes: 8,
      kind: "partial",
      requires: { type: "mitigation", id: "delete-store" },
      examples: [
        "Tell every clinic to treat all of its patients as exposed",
        "Notify all clinics on the worst-case basis",
        "We cannot narrow it down, so warn every clinic on the worst case",
        "Send the worst-case notice to every clinic",
        "Assume every patient is affected and write to the clinics on that basis",
      ],
      onComplete: { mode: "accounted" },
      resultPurpose: "Report that every clinic has been told to assume the worst",
      resultText:
        "Mika: Every clinic has been told to treat all of its patients as exposed. It is the only honest notice we can send without the logs.",
    },
    {
      id: "move-exports",
      label: "Move the exports to a new folder with a new link",
      durationMinutes: 3,
      kind: "noEffect",
      examples: [
        "Move the files somewhere else",
        "Change the link so the old one stops working",
        "Rename the folder",
        "Put the exports in a new location",
        "Generate a new link for the storage",
        "Change the storage link",
      ],
      onComplete: { systems: {} },
      resultPurpose: "Report that the new place is as public as the old one",
      resultText:
        "Mika: The exports are in a new folder with a new link. The folder is still readable by anyone who has the link, and the access logs now start again from empty.",
    },
  ],

  directives: [
    {
      id: "post-notice",
      label: "Post a public notice",
      toAny: ["comms"],
      examples: [
        "Tell comms to post a public notice",
        "Put a statement on our website",
        "Odile, publish a notice about the exposure",
        "Get a public statement out",
        "Post an incident notice for clinics and patients",
      ],
      effects: { systems: { notice: "degraded" } },
    },
    {
      id: "notify-regulator",
      label: "Notify the Data Protection Office",
      toAny: ["counsel", "regulator"],
      examples: [
        "Tell counsel to notify the Data Protection Office",
        "Report the breach to the regulator",
        "Samir, file the notification with the regulator today",
        "Call the data protection duty desk",
        "We need to notify the authority",
      ],
    },
    allClear(),
  ],

  claimTopics: [
    {
      id: "sensitive-data",
      statement: "Sensitive data was exposed",
      statementTrue: true,
      supportsAsserts: ["export-contents"],
      supportsDenies: [],
      phrases: ["sensitive", "medical", "health", "appointment reason", "appointment details"],
      surfacesWhen: { type: "minuteAtLeast", value: 40 },
    },
    {
      id: "only-researcher",
      statement: "Only the researcher downloaded the files",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["who-downloaded"],
      phrases: ["only researcher", "just researcher", "nobody else", "researcher alone"],
      surfacesWhen: { type: "clue", id: "who-downloaded" },
    },
    {
      id: "scope-known",
      statement: "38,000 patients across 41 clinics are affected",
      statementTrue: true,
      supportsAsserts: ["export-contents"],
      supportsDenies: [],
      phrases: ["38,000", "38000", "41 clinics"],
    },
    {
      id: "app-hacked",
      statement: "The booking application was hacked",
      statementTrue: false,
      supportsAsserts: [],
      supportsDenies: ["no-app-breakin"],
      phrases: ["hacked", "hack", "broken into", "break-in", "intrusion", "attack"],
      surfacesWhen: { type: "clue", id: "no-app-breakin" },
    },
  ],

  obligations: [
    {
      id: "public-notice",
      label: "Public notice posted",
      trigger: { type: "minuteAtLeast", value: 0 },
      withinMinutes: 30,
      satisfiedBy: { directive: "post-notice", toAny: ["comms"] },
    },
    {
      id: "notify-regulator",
      label: "Regulator notified",
      trigger: {
        type: "any",
        of: [
          { type: "clue", id: "export-contents" },
          { type: "minuteAtLeast", value: 40 },
        ],
      },
      withinMinutes: 30,
      satisfiedBy: { directive: "notify-regulator", toAny: ["counsel", "regulator"] },
    },
    allClearDuty("contained", ["cto", "comms"]),
  ],

  beats: [
    {
      id: "report",
      from: "researcher",
      channel: "email",
      when: { atMinute: 0 },
      purpose: "Open the incident with the researcher's report",
      facts: ["A file of patient appointments is readable by anyone who has the link."],
      fallbackText:
        "Rosa Vasquez: I found a file of patient appointments from your system that anyone with the link can read. I have not shared it. A journalist has the same tip from someone else. Please confirm you have this.",
    },
    {
      id: "ceo-how-bad",
      from: "cto",
      channel: "chat",
      when: { atMinute: 3 },
      purpose: "Ask how bad it is, within 10 minutes",
      facts: ["The chief executive wants to know how bad it is within 10 minutes."],
      fallbackText:
        "Helen: Samir has forwarded me a researcher's email. How bad is this? I want to know within 10 minutes.",
      variants: {
        high: "Helen: Samir has forwarded me a researcher's email. How bad is it? Give me what you have within 10 minutes.",
      },
    },
    {
      id: "journalist-deadline",
      from: "journalist",
      channel: "press",
      when: { atMinute: 8, jitter: 2 },
      purpose: "Ask for comment before publishing",
      facts: ["The story will be published at 17:20."],
      fallbackText:
        "Nate Okafor, The Ledger Post: I am told patient appointment records from Tendwell can be read on the open internet. I publish at 17:20. Do you have a comment?",
    },
    {
      id: "counsel-scope",
      from: "counsel",
      channel: "email",
      when: { atMinute: 12, jitter: 2 },
      purpose: "Ask for the scope in writing",
      facts: ["Counsel needs the scope in writing to decide on the regulator."],
      fallbackText:
        "Samir Qureshi: I need the scope in writing: what data, how many patients, and who has had it. I decide what we tell the regulator from that.",
    },
    bossAsksAgain("Helen", 13, "How bad is it?"),
    {
      id: "comms-notice",
      from: "comms",
      channel: "chat",
      when: { atMinute: 18 },
      unless: { type: "directiveSent", id: "post-notice" },
      purpose: "Point out that nothing public has been said",
      facts: ["A reporter is ringing clinics and nothing has been posted."],
      fallbackText:
        "Odile: A reporter is ringing clinics and we have said nothing in public. Do I post a notice, and what does it say?",
    },
    {
      id: "clinic-asks",
      from: "customer",
      channel: "email",
      when: { atMinute: 22 },
      unless: {
        type: "any",
        of: [
          { type: "mitigation", id: "send-clinic-notices" },
          { type: "mitigation", id: "notify-all-clinics" },
        ],
      },
      purpose: "A clinic has heard from the reporter and asks if it is true",
      facts: ["A reporter has rung a clinic's front desk about leaked appointments."],
      fallbackText:
        "Ingrid Solberg, Northgate Clinics: A reporter has just rung my front desk asking about leaked appointments. Is it true? What do I tell my patients?",
    },
    {
      id: "press-fair",
      from: "journalist",
      channel: "press",
      when: { atMinute: 40 },
      unless: {
        type: "claim",
        topic: "sensitive-data",
        stance: "denies",
        truth: "false",
        to: "journalist",
      },
      purpose: "Publish a fair story about the exposure",
      facts: ["Patient appointment records were readable online."],
      fallbackText:
        "The Ledger Post: Clinic software firm Tendwell left patient appointment records readable online. The company was told by a researcher this afternoon.",
    },
    {
      id: "press-harsh",
      from: "journalist",
      channel: "press",
      when: {
        condition: {
          type: "all",
          of: [
            { type: "minuteAtLeast", value: 40 },
            {
              type: "claim",
              topic: "sensitive-data",
              stance: "denies",
              truth: "false",
              to: "journalist",
            },
          ],
        },
      },
      purpose: "Publish a story that sets the company's denial against the files",
      facts: ["The files list patients by name with the reason for each appointment."],
      quotesClaim: "sensitive-data",
      fallbackText:
        'The Ledger Post: Tendwell said of the exposed files: "{quote}". The files seen by this paper list patients by name with the reason for each appointment.',
    },
    {
      id: "export-ran",
      from: "system",
      channel: "log",
      when: { atMinute: 50 },
      unless: {
        type: "any",
        of: [
          { type: "mitigation", id: "make-private" },
          { type: "mitigation", id: "delete-store" },
        ],
      },
      purpose: "Tonight's export has been written to the public location",
      facts: ["The nightly export has run and its file is public."],
      fallbackText:
        "NOTICE {clock}: the nightly export has run. Tonight's file is in the public location with the others.",
    },
    {
      id: "ceo-deleted",
      from: "cto",
      channel: "chat",
      when: { condition: { type: "mitigation", id: "delete-store" }, delayMinutes: 2 },
      purpose: "Ask whether the evidence is really gone",
      facts: ["The access logs were deleted with the files."],
      fallbackText:
        "Helen: Samir says the access logs went with the files. So we cannot say who has the data. Is that right?",
    },
    {
      id: "counsel-basis",
      from: "counsel",
      channel: "email",
      when: {
        condition: {
          type: "claim",
          topic: "only-researcher",
          stance: "asserts",
          supported: false,
          to: "counsel",
        },
        delayMinutes: 1,
      },
      purpose: "Ask on what basis the player said only the researcher had the files",
      facts: ["The player said only the researcher downloaded the files."],
      quotesClaim: "only-researcher",
      fallbackText:
        'Samir Qureshi: You said: "{quote}". On what basis? Have the access logs been read?',
    },
    {
      id: "counsel-hacked",
      from: "counsel",
      channel: "email",
      when: {
        condition: {
          type: "all",
          of: [
            { type: "claim", topic: "app-hacked", stance: "asserts" },
            { type: "clue", id: "no-app-breakin" },
          ],
        },
      },
      purpose: "Confront the player with an earlier claim that this was a hack",
      facts: ["Nobody broke into the booking application."],
      quotesClaim: "app-hacked",
      fallbackText:
        'Samir Qureshi: You told us: "{quote}". Nobody broke in. The files were left open by us. Which is it? The regulator will ask.',
    },
    {
      id: "regulator-calls",
      from: "regulator",
      channel: "chat",
      when: { condition: { type: "obligation", id: "notify-regulator", state: "missed" } },
      purpose: "The regulator calls because no notification arrived",
      facts: ["The regulator has read about the exposure and has received no notification."],
      fallbackText:
        "Duty desk, Data Protection Office: We have read in the press that patient records held by Tendwell were exposed, and we have no notification from you. Send one today.",
    },
    bossMissed("Helen", "The chief executive"),
    {
      id: "comms-closed",
      from: "comms",
      channel: "chat",
      when: { condition: { type: "clue", id: "contained" } },
      purpose: "Ask for wording now that it is closed",
      facts: ["The exposure is confirmed closed."],
      fallbackText:
        "Odile: If it is closed, I need a line to add to the notice. What can I say is done?",
    },
  ],

  endings: {
    ctoTrustFloor: 15,
    resolvedWhen: {
      type: "all",
      of: [
        {
          type: "any",
          of: [
            { type: "mitigation", id: "send-clinic-notices" },
            { type: "mitigation", id: "notify-all-clinics" },
          ],
        },
        {
          type: "any",
          of: [
            { type: "clue", id: "contained" },
            { type: "mitigation", id: "delete-store" },
          ],
        },
        {
          type: "any",
          of: [
            { type: "obligation", id: "all-clear", state: "met" },
            { type: "obligation", id: "all-clear", state: "late" },
            // After a deletion there is nothing left to confirm closed, so the duty never opens.
            { type: "mitigation", id: "notify-all-clinics" },
          ],
        },
      ],
    },
  },
  scoring: { rootCauseClue: "backup-job", causeTargetMinute: 12 },

  idealPath: [
    {
      atMinute: 0,
      intent: { kind: "investigate", id: "open-the-link" },
    },
    {
      atMinute: 1,
      intent: {
        kind: "communicate",
        to: ["researcher"],
        text: "Thank you. We have your report and we are acting on it now.",
      },
    },
    {
      atMinute: 3,
      why: "You do not know the size yet. Say so, and say when you will.",
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "It is real. I do not know the size yet. I will update you in ten minutes.",
        promises: [{ to: "cto", what: "an update", dueInMinutes: 10 }],
      },
    },
    {
      atMinute: 4,
      intent: { kind: "mitigate", id: "make-private" },
      why: "Close the door and touch nothing else. The files and the logs are the evidence.",
    },
    {
      atMinute: 5,
      intent: { kind: "investigate", id: "export-contents" },
      why: "Everything you say next depends on what is in the files and how many people it is.",
    },
    {
      atMinute: 10,
      intent: { kind: "investigate", id: "storage-setup" },
    },
    {
      atMinute: 11,
      why: "The press quotes you either way. Say what was exposed, plainly, before the story runs.",
      intent: {
        kind: "communicate",
        to: ["journalist"],
        text: "Files holding patient appointment details, including the reason for each appointment, were readable online. Access is closed and we are contacting the clinics.",
        claims: [
          {
            topic: "sensitive-data",
            stance: "asserts",
            text: "Files holding patient appointment details were readable online",
          },
        ],
      },
    },
    {
      atMinute: 12,
      why: "A reporter is ringing clinics. They should hear it from you first.",
      intent: {
        kind: "communicate",
        to: ["comms"],
        text: "Please post a notice: patient appointment files were readable online, access is closed, and clinics will be contacted today.",
        directives: ["post-notice"],
      },
    },
    {
      atMinute: 13,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "38,000 patients across 41 clinics: names, phone numbers and appointment reasons. Access is closed and nothing was deleted. We are reading the logs to see who downloaded.",
        claims: [
          {
            topic: "scope-known",
            stance: "asserts",
            text: "38,000 patients across 41 clinics",
          },
        ],
      },
    },
    {
      atMinute: 14,
      intent: { kind: "investigate", id: "access-logs" },
      why: "The logs say who has the data. Without them you can only assume everyone does.",
    },
    {
      atMinute: 15,
      intent: {
        kind: "communicate",
        to: ["counsel"],
        text: "Scope so far: 38,000 patients across 41 clinics, with names, phone numbers and appointment reasons. Who downloaded is not known yet. The logs are being read.",
        claims: [
          {
            topic: "scope-known",
            stance: "asserts",
            text: "38,000 patients across 41 clinics",
          },
        ],
      },
    },
    {
      atMinute: 21,
      why: "The regulator should hear it from the company on the day, not from the newspaper.",
      intent: {
        kind: "communicate",
        to: ["counsel"],
        text: "The logs show the researcher and two unknown addresses. Please notify the Data Protection Office today.",
        directives: ["notify-regulator"],
      },
    },
    {
      atMinute: 22,
      intent: { kind: "mitigate", id: "send-clinic-notices" },
      why: "Each clinic needs its own list: which patients, what was in the files, who took them.",
    },
    {
      atMinute: 23,
      intent: {
        kind: "communicate",
        to: ["customer"],
        text: "It is true. Appointment records were readable online and access is now closed. Your list of affected patients is on its way to you.",
      },
    },
    {
      atMinute: 24,
      intent: {
        kind: "communicate",
        to: ["cto"],
        text: "The logs show two unknown downloads besides the researcher. The regulator is being notified and the clinics are getting their lists.",
      },
    },
    {
      atMinute: 28,
      intent: { kind: "investigate", id: "verify-contained" },
    },
    {
      atMinute: 31,
      intent: {
        kind: "communicate",
        to: ["cto", "comms"],
        text: "It is closed and every clinic has its list. All clear.",
        directives: ["all-clear"],
      },
    },
  ],

  synonyms: {
    storage: ["bucket", "storage location", "storage bucket", "file store"],
    export: ["exports", "export file", "export files", "backup file", "backup files"],
    regulator: ["data protection office", "the office", "duty desk", "the authority"],
    private: ["non-public", "locked down", "restricted"],
  },

  lessons: [
    {
      id: "closed-and-kept",
      kind: "avoided",
      when: {
        type: "all",
        of: [
          { type: "mitigation", id: "make-private" },
          { type: "not", of: { type: "mitigation", id: "delete-store" } },
        ],
      },
      text: "You closed access and deleted nothing. The files and the logs were still there to tell you who had the data.",
      evidence: { type: "mitigation_applied", id: "make-private" },
    },
    {
      id: "deleted-the-evidence",
      kind: "fell",
      when: { type: "mitigation", id: "delete-store" },
      text: "Deleting the storage location stopped the exposure and destroyed the only record of who had downloaded from it. Close access first. Delete nothing until the logs have been read.",
      evidence: { type: "mitigation_applied", id: "delete-store" },
    },
    {
      id: "moved-not-closed",
      kind: "fell",
      when: { type: "mitigation", id: "move-exports" },
      text: "Moving the files to a new link left them as public as before, and started the access logs again from empty.",
      evidence: { type: "mitigation_applied", id: "move-exports" },
    },
    {
      id: "said-not-sensitive",
      kind: "fell",
      when: { type: "claim", topic: "sensitive-data", stance: "denies", truth: "false" },
      text: "You said no sensitive data was exposed. Why a patient booked an appointment is about as sensitive as data gets, and a reporter had the files.",
      evidence: { type: "claim", id: "sensitive-data" },
    },
    {
      id: "said-only-researcher",
      kind: "fell",
      when: { type: "claim", topic: "only-researcher", stance: "asserts" },
      text: "You said only the researcher had the files before anyone had read the logs. Two other addresses had them too.",
      evidence: { type: "claim", id: "only-researcher" },
    },
    {
      id: "said-what-it-was",
      kind: "avoided",
      when: { type: "claim", topic: "sensitive-data", stance: "asserts", supported: true },
      text: "You said plainly what was in the files once you had looked. Nobody could quote a softer version back at you.",
      evidence: { type: "claim", id: "sensitive-data" },
    },
    {
      id: "regulator-same-day",
      kind: "avoided",
      when: { type: "obligation", id: "notify-regulator", state: "met" },
      text: "The regulator heard about it from you, on the day, with the scope.",
      evidence: { type: "directive", id: "notify-regulator" },
    },
    {
      id: "regulator-missed",
      kind: "fell",
      when: { type: "obligation", id: "notify-regulator", state: "missed" },
      text: "The regulator read about the exposure in the press and had to ask you for a notification.",
      evidence: { type: "obligation", id: "notify-regulator" },
    },
    {
      id: "notice-late",
      kind: "fell",
      when: {
        type: "any",
        of: [
          { type: "obligation", id: "public-notice", state: "missed" },
          { type: "obligation", id: "public-notice", state: "late" },
        ],
      },
      text: "For the first half hour clinics heard about this from a reporter, because nothing had been posted by you.",
      evidence: { type: "obligation", id: "public-notice" },
    },
    brokePromise,
  ],
};
