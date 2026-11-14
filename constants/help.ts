/**
 * The in-app help text, copied from the portal's `src/lib/help-content.ts`.
 *
 * A copy rather than a fetch because the portal keeps this in code, not behind
 * an endpoint. When the wording changes there it has to be carried across here
 * by hand — the keys are the same on both sides so the two can be compared.
 */

export interface HelpEntry {
  title: string;
  blurb: string;
}

/** The portal's main menu sections. */
export const sidebarHelp: Record<string, HelpEntry> = {
  breeders: {
    title: "Breeders",
    blurb:
      "Your directory of pigeon owners. Add or edit breeders, approve pending sign-ups, and open any breeder to see their birds and payment history.",
  },
  schemes: {
    title: "Schemes",
    blurb:
      "Reusable fee, prize and betting templates. Build them once here, then attach them to an event's seasons instead of re-entering the same numbers every time.",
  },
  events: {
    title: "Events",
    blurb:
      "The heart of the app. An event holds one or more seasons; a season is where you actually run races, register birds, basket and settle money.",
  },
  birds: {
    title: "Birds",
    blurb:
      "The global bird registry across all breeders. Search by band, view a bird's full race history, or bulk import/export via CSV.",
  },
  reports: {
    title: "Reports",
    blurb:
      "Printable PDFs — result sheets, basket labels, receipts. Pick an event and race, then generate.",
  },
  notifications: {
    title: "Notifications",
    blurb:
      "Broadcast announcements to breeders (e.g. race delays, deadlines). They appear in the mobile app.",
  },
};

/** The sections inside an event. Check-in is omitted, as it is in the portal. */
export const tabHelp: Record<string, HelpEntry> = {
  details: {
    title: "Details",
    blurb:
      "Season overview and setup: dates, location, and which fee/prize/betting schemes apply. Start here when setting up a new season.",
  },
  breeders: {
    title: "Breeders",
    blurb:
      "Who is participating this season. Register breeders, track what each owes, and drill into their entries.",
  },
  birds: {
    title: "Birds",
    blurb:
      "Every bird entered this season. Confirms bands, RFID, and which races each bird is in.",
  },
  groups: {
    title: "Groups",
    blurb:
      "Optional breeder groupings (e.g. clubs, lofts). Used for combined standings and group-level stats.",
  },
  baskets: {
    title: "Baskets",
    blurb:
      "Assign birds to transport baskets. Loft baskets are built at check-in; race baskets are auto-generated here, shuffled so one breeder's birds are spread across baskets.",
  },
  races: {
    title: "Races",
    blurb:
      "Create and run the season's races. Set liberation point, start the race to release birds, then scan arrivals to record times and positions.",
  },
  betting: {
    title: "Betting",
    blurb:
      "Manage pools for this season — Winner-Take-All, Standard, and Belgian. Track stakes, see who has paid, and view computed payouts.",
  },
  result: {
    title: "Result",
    blurb:
      "Final standings once a race is scored. Positions, times, velocities, and prize allocation.",
  },
  stations: {
    title: "Stations",
    blurb:
      "Liberation and transport points on the map, plus weather/wind context for the race route.",
  },
  messages: {
    title: "Messages",
    blurb: "Season-scoped announcements sent to participating breeders.",
  },
  history: {
    title: "History",
    blurb: "Audit trail of changes and key actions taken on this season.",
  },
  defaulters: {
    title: "Defaulters",
    blurb:
      "Breeders with outstanding balances. Record cash-later payments here to clear what they owe.",
  },
  store: {
    title: "Store",
    blurb:
      "Sell rings, feed or other items to breeders and roll the charges into their season balance.",
  },
  calcutta: {
    title: "Calcutta",
    blurb:
      "Auction-style pool where bidders buy birds; winnings pay out by finishing position.",
  },
  averages: {
    title: "Averages",
    blurb:
      "Multi-race standings — average velocity/points across the season's races to rank overall performers.",
  },
  tournaments: {
    title: "Knockout",
    blurb:
      "Bracket-style elimination across races. Birds advance round by round until a winner remains.",
  },
  classes: {
    title: "Classes",
    blurb:
      "Split entries into competition classes (e.g. by age or category) that are scored separately.",
  },
  content: {
    title: "Rules",
    blurb:
      "Rich-text rules and info shown to breeders for this season. Edit freely; it renders as formatted text.",
  },
  accounting: {
    title: "Accounting",
    blurb:
      "The money ledger for the season — fees collected, payouts owed, and net position across all pools.",
  },
};

/**
 * The portal's guided tour of an event, in the order it walks them. The portal
 * highlights each tab in turn; here it is the same steps read as a list.
 */
export const eventTour: { tab: string; title: string; blurb: string }[] = [
  { tab: "details", ...tabHelp.details },
  { tab: "breeders", ...tabHelp.breeders },
  { tab: "birds", ...tabHelp.birds },
  { tab: "baskets", ...tabHelp.baskets },
  { tab: "races", ...tabHelp.races },
  { tab: "result", ...tabHelp.result },
  { tab: "betting", ...tabHelp.betting },
  { tab: "accounting", ...tabHelp.accounting },
];
