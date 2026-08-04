/* ---------------------------------------------------------------------------
   KAIRO 1980 — site configuration
   ---------------------------------------------------------------------------
   This is the ONLY file you need to touch to change opening hours, to switch
   the lunch service on or off, to change the corporate delivery rules or to
   enable PayPal. No HTML and no other script has these values hardcoded.

   Everything below is plain data. Edit it, save, deploy — done.

   The visible opening-hours table AND the structured data Google reads are
   both generated from `hours` at runtime, so the two can never drift apart.
--------------------------------------------------------------------------- */

window.KAIRO_CONFIG = {

  /* --- Contact ---------------------------------------------------------- */
  whatsapp: {
    // International format, digits only — no "+", no spaces.
    number: '4917679906621'
  },

  /* --- Ordering --------------------------------------------------------- */
  order: {
    // Master switch for the website basket. Set to false and the site falls
    // back to plain "write us on WhatsApp" links, exactly as before.
    cartEnabled: true,

    // Discount for ordering directly with us instead of via a delivery
    // platform. Applies to everyone, company or private, delivery or pickup.
    // Set to 0 to remove it everywhere.
    directDiscountPercent: 10,

    // Optional better rate for company orders that are collected in person.
    // Currently OFF: one rate, 10 %, for every order placed through this site —
    // delivery or pickup, company or private. Nothing on the page promises a
    // second percentage, so this stays null unless the copy is revisited.
    //   null -> everyone gets directDiscountPercent above (the current rule)
    //   15   -> "Firmenbestellung" ticked AND pickup selected earns 15 %
    businessPickupDiscountPercent: null,

    /* Who the per-zone minimum order value applies to.
       -----------------------------------------------------------------------
       The minimum exists for one reason: to make a driver's trip worth making.
       So it applies to exactly one case — a private order that has to be
       driven out. Nobody who collects their own order pays it, because there
       is no trip to pay for; and a company order is never held to it, whatever
       it is worth, because that is the relationship we want with an office.

       The AMOUNTS live per postcode in data/delivery_zones.xlsx. This is only
       the rule about who they are asked of, and it is read by the basket, by
       the WhatsApp message, by the server's pricing and by the sentence the
       pages print — so there is one answer, not five.

       Free delivery has no such carve-out: see business.freeDeliveryFrom. */
    minimumOrder: {
      pickup: false,      // collected in person — no trip to pay for
      delivery: true,     // the ordinary case: a private order, driven out
      business: false     // a company order is never held to it
    },

    // How long a basket survives after the last change, in minutes.
    // A basket is a short-lived intention, not a saved document: it must
    // survive a reload, a phone call or a detour to the delivery-area list,
    // but a guest returning tomorrow should start fresh rather than meet an
    // order they no longer want — at prices that may since have changed.
    //   0  -> never remembered (the basket is gone as soon as the tab closes)
    //   120 -> the current rule, roughly one evening's browsing
    cartLifetimeMinutes: 120,

    // Currency symbol / locale used for every price shown by the basket.
    currency: '€',
    locale: 'de-DE'
  },

  /* --- Business / corporate catering ------------------------------------ */
  business: {
    // Shows or hides the whole "Firmenbestellungen" section, its nav link
    // and the announcement strip.
    enabled: true,

    /* Order value from which the delivery fee is waived (euros), applied to
       the food subtotal, before the direct-order discount.

       ONE THRESHOLD, EVERYONE. A company and a private guest reaching 100 €
       are the same order to a driver, so they are charged the same for it.
       There is deliberately no switch here to narrow it to company orders:
       a rule with an exception has to be explained in every place it is
       printed, and the exception was worth less than the explanation cost.

       Because it now applies to everyone, it is advertised to everyone — the
       basket says how much is missing and says so when it has been reached,
       instead of leaving it as small print in the corporate section. */
    freeDeliveryFrom: 100,

    // Minimum lead time for large / corporate orders, in hours.
    leadTimeHours: 2
  },

  /* --- Delivery area ------------------------------------------------------
     Postcode zones, not a radius. A radius needs a geocoding service (an API
     key in public JavaScript, a cost per lookup and the guest's address sent
     to a third party before they consented), and it still gets the answer
     wrong: a typo in the street becomes a rejected order, and 20 km in a
     straight line across the Rhine is a 35-minute drive. A postcode list is
     exact, free, offline and the same model Lieferando and Uber Eats use.

     The check is ADVISORY on purpose. An unknown postcode never blocks the
     order — it is flagged in the WhatsApp message so you can decide. Losing a
     €300 corporate order to an automatic rejection costs far more than
     reading one message and saying no.

     THE ZONE LIST IS NOT EDITED HERE. Its single source of truth is the
     spreadsheet data/delivery_zones.xlsx. Change a price or add a postcode
     there, then run:

         python tools/build-zones.py

     which regenerates zones.js (loaded just before this file) and refuses to
     write anything if the sheet has a duplicate or malformed postcode.
  --------------------------------------------------------------------------- */
  delivery: {
    zones: window.KAIRO_ZONES || [],
  },

  /* --- Payment ---------------------------------------------------------- */
  payment: {
    // Offer paying online while ordering — Apple Pay, Google Pay, card or
    // PayPal. Set to false and the whole online option disappears from the
    // basket in a second; the site falls back to paying in person, exactly as
    // it did before online payment existed.
    //
    // No credential belongs in this file. The client id, the secret and the
    // webhook id are Cloudflare secrets held by the Worker
    // (`wrangler secret put PAYPAL_CLIENT_ID`, …), and the page asks the
    // Worker what is switched on. That is deliberate: a client id pasted here
    // could end up naming the sandbox while the secret names production, and
    // the guest would meet a checkout that cannot take money.
    //
    // Which methods actually appear is decided by the payment account, not by
    // this file: Apple Pay and Google Pay show up only on a device that
    // supports them AND once PayPal has enabled them for the merchant. See
    // docs/payments.md.
    prepayOnline: true,

    // What can be paid in person, per order type. The FAQ, the basket, the
    // confirmation screen and the payment methods Google indexes are all
    // written from these two lists — nothing is typed twice.
    //   'cash' -> Bargeld       'giro' -> EC-/Girocard       'card' -> Kreditkarte
    // Delivery is cash only because the card terminal stands in the shop; add
    // 'giro' / 'card' to the delivery line the day a driver carries one.
    onSite: {
      pickup: ['cash', 'giro', 'card'],
      delivery: ['cash']
    },

    // Offer companies payment by invoice.
    invoiceForBusiness: true
  },

  /* --- Opening hours ----------------------------------------------------- */
  hours: {

    /* --- The lunch service (Mittagsservice) -------------------------------
       Three lines decide everything the site says about lunch. Change one,
       save, push — no build step, nothing to restart, and config.js is served
       with `must-revalidate`, so the change is live for every visitor at once.

       enabled    false -> lunch does not exist anywhere on the site.
                  true  -> lunch is published (see startsOn).

       startsOn   'YYYY-MM-DD' — the first day the service actually runs.
                  BEFORE that date the site advertises it ("New from
                  Wednesday, 5 August: …") but nothing can be ordered into a
                  lunch slot: the opening-hours table, the "open now" badge,
                  the hours Google indexes and the basket all still end with
                  the evening service. ON that date it becomes an ordinary
                  service window by itself — nobody has to touch anything.
                  Set to '' when it is running and the notice is no longer
                  needed.

       delivery   false -> lunch is COLLECTION ONLY. There is no driver at
                          midday, so the basket does not offer delivery for a
                          lunch slot, and every place that mentions lunch says
                          so. Evening delivery is unaffected.
                  true  -> lunch delivers exactly like the evening. This is
                          the one word to change once a midday driver exists.
    --------------------------------------------------------------------- */
    lunch: {
      enabled: true,
      startsOn: '2026-08-05',
      delivery: false
    },

    // One entry per weekday. Times are "HH:MM" in 24h format.
    //   closed : true          -> closed all day, any times below are ignored
    //   lunch  : ['11:30','14:30'] or null (no lunch service that day)
    //   evening: ['18:00','23:00'] or null (no evening service that day)
    //
    // To open Monday for lunch only: set closed to false and give it a
    // `lunch` window while leaving `evening` at null.
    days: {
      mon: { closed: true,  lunch: null,               evening: null },
      tue: { closed: true,  lunch: null,               evening: null },
      wed: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] },
      thu: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] },
      fri: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] },
      sat: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] },
      sun: { closed: false, lunch: ['11:00', '14:30'], evening: ['18:00', '23:00'] }
    }
  }
};
