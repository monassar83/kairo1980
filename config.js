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

    // Better rate for company orders that are collected in person: no driver,
    // no vehicle, so the saving is shared. Applies only when the
    // "Firmenbestellung" box is ticked AND pickup is selected; every other
    // combination gets directDiscountPercent above.
    businessPickupDiscountPercent: 15,

    // Currency symbol / locale used for every price shown by the basket.
    currency: '€',
    locale: 'de-DE'
  },

  /* --- Business / corporate catering ------------------------------------ */
  business: {
    // Shows or hides the whole "Firmenbestellungen" section, its nav link
    // and the announcement strip.
    enabled: true,

    // Order value from which the delivery fee is waived (euros). The waiver is
    // applied to the food subtotal, before the direct-order discount.
    freeDeliveryFrom: 100,

    // Who the waiver applies to.
    //   false -> any order reaching the threshold (current rule)
    //   true  -> only orders with the "Firmenbestellung" box ticked
    // Either way it is ADVERTISED only in the Firmen section — the basket
    // states the fee it charges and never promotes free delivery.
    freeDeliveryBusinessOnly: false,

    // Minimum lead time for large / corporate orders, in hours.
    leadTimeHours: 2,

    // From how many meals we treat an order as a corporate order. Used only
    // for the wording in the enquiry template.
    fromPersons: 5
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
    // Your PayPal.Me handle WITHOUT the domain, e.g. 'kairo1980' for
    // https://paypal.me/kairo1980. Leave empty ('') and every PayPal
    // element stays hidden — nothing breaks, the option simply disappears.
    paypalMe: '',

    // Offer companies payment by invoice.
    invoiceForBusiness: true
  },

  /* --- Opening hours ----------------------------------------------------- */
  hours: {

    // Lunch service is still being trialled, so it ships switched OFF.
    // Set `enabled: true` to publish it. Individual days can be left without
    // a lunch window by setting their `lunch` to null.
    lunch: {
      enabled: false
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
      tue: { closed: false, lunch: ['11:30', '14:30'], evening: ['18:00', '23:00'] },
      wed: { closed: false, lunch: ['11:30', '14:30'], evening: ['18:00', '23:00'] },
      thu: { closed: false, lunch: ['11:30', '14:30'], evening: ['18:00', '23:00'] },
      fri: { closed: false, lunch: ['11:30', '14:30'], evening: ['18:00', '23:00'] },
      sat: { closed: false, lunch: null,               evening: ['18:00', '23:00'] },
      sun: { closed: false, lunch: null,               evening: ['18:00', '23:00'] }
    }
  }
};
