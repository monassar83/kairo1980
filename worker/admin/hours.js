/* The opening hours, edited by the restaurant.
   ---------------------------------------------------------------------------
   These are the real, permanent hours — not a "closed today" override. What is
   saved here is what the site publishes, what the structured data declares and
   what the basket will and will not take an order into, from the moment the
   form is submitted.

   config.js keeps the hours the site launched with. They are the defaults, the
   fallback if this server cannot be reached, and what "Reset" restores.
   The page always says which of the two is in effect, because hours that might
   be one thing or another are worse than either. */

import { layout, esc, newNonce, adminHeaders } from './pages.js';
import { readSettings, writeHours, resetHours } from '../settings.js';

const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']
];

export async function page(request, env, url) {
  const { hours, hoursAreCustom } = await readSettings(env);
  const nonce = newNonce();
  return new Response(
    render({ nonce, hours, hoursAreCustom, saved: url.searchParams.has('saved'),
             failed: url.searchParams.has('failed') }),
    { headers: adminHeaders(nonce) }
  );
}

export async function save(request, env, url) {
  const form = await request.formData();

  if (form.get('reset')) {
    await resetHours(env);
    return seeOther('/admin/hours?saved=1');
  }

  const days = {};
  for (const [key] of DAYS) {
    const closed = form.get(`${key}_closed`) === '1';
    days[key] = {
      closed,
      lunch: pair(form.get(`${key}_lunch_from`), form.get(`${key}_lunch_to`)),
      evening: pair(form.get(`${key}_evening_from`), form.get(`${key}_evening_to`))
    };
  }

  const written = await writeHours(env, {
    days,
    lunch: {
      enabled: form.get('lunch_enabled') === '1',
      delivery: form.get('lunch_delivery') === '1'
    }
  });

  // Refused rather than half-saved: settings.js returns null for anything that
  // is not a complete, valid week, and a partly-understood opening time is
  // worse than the old one because nobody can see that it is wrong.
  return seeOther(written ? '/admin/hours?saved=1' : '/admin/hours?failed=1');
}

function pair(from, to) {
  const a = String(from || '').trim();
  const b = String(to || '').trim();
  return a && b ? [a, b] : null;
}

function seeOther(location) {
  // See Other, so a reload does not resubmit the form.
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
}

const CSS = `
 fieldset{border:1px solid #e6dcc9;background:#fff;padding:12px 14px;margin:0 0 10px}
 legend{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a6030;padding:0 6px}
 .day{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;align-items:end}
 .day .full{grid-column:1/-1}
 .times{display:flex;align-items:center;gap:6px}
 .times input{flex:1;min-width:0;padding:9px;font-size:16px;border:1px solid #d8cbb0;
              background:#fffdf9}
 .times span{color:#7a6030}
 label.tick{display:flex;align-items:center;gap:8px;font-size:13.5px;letter-spacing:0;
            text-transform:none;color:#1c1409;margin:0}
 label.tick input{width:20px;height:20px;flex:none}
 .cap{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a6030;margin:0 0 4px}
 .save{position:sticky;bottom:0;background:#faf7f2;padding:12px 0;margin-top:4px}
 button.save-btn{width:100%;padding:14px;font-size:15px;font-weight:600;border:0;
                 background:#1c1409;color:#f5e8cc;cursor:pointer}
 button.reset{width:100%;padding:11px;font-size:13.5px;border:1px solid #d8cbb0;background:none;
              color:#7a6030;cursor:pointer;margin-top:8px}
 .msg{padding:10px 12px;border:1px solid #bcd8b0;background:#eef6ea;color:#31601f;
      font-size:13.5px;margin-bottom:14px}
 .msg.bad{border-color:#e8c9a0;background:#fdf0e0;color:#a04a00}
 .src{font-size:12.5px;color:#7a6030;margin:0 0 14px}
`;

function times(prefix, label, value) {
  const [from, to] = value || ['', ''];
  return `<div>
    <p class="cap">${label}</p>
    <div class="times">
      <input type="time" step="300" name="${prefix}_from" value="${esc(from)}" aria-label="${label} from">
      <span>–</span>
      <input type="time" step="300" name="${prefix}_to" value="${esc(to)}" aria-label="${label} to">
    </div>
  </div>`;
}

function render({ nonce, hours, hoursAreCustom, saved, failed }) {
  const dayFields = DAYS.map(([key, label]) => {
    const day = hours.days[key] || {};
    return `<fieldset><legend>${label}</legend>
      <div class="day">
        <label class="tick full">
          <input type="checkbox" name="${key}_closed" value="1" ${day.closed ? 'checked' : ''}>
          Closed all day
        </label>
        ${times(`${key}_lunch`, 'Lunch', day.lunch)}
        ${times(`${key}_evening`, 'Evening', day.evening)}
      </div>
    </fieldset>`;
  }).join('');

  const body = `<h1>Opening hours</h1>
<div class="sub">The regular hours. Live immediately — on the website, in the
opening hours Google reads, and in the basket.</div>

${saved ? '<p class="msg">Saved. Live now.</p>' : ''}
${failed ? `<p class="msg bad">Not saved. Every time must be HH:MM and each closing time
  must come after its opening time — the previous hours are still in force.</p>` : ''}

<p class="src">${hoursAreCustom
  ? 'Using the hours saved here.'
  : 'Using the default hours from <code>config.js</code>.'}</p>

<form method="post" action="/admin/hours">
  <fieldset><legend>Lunch service</legend>
    <div class="day">
      <label class="tick full">
        <input type="checkbox" name="lunch_enabled" value="1" ${hours.lunch.enabled ? 'checked' : ''}>
        Offer a lunch service
      </label>
      <label class="tick full">
        <input type="checkbox" name="lunch_delivery" value="1" ${hours.lunch.delivery ? 'checked' : ''}>
        Deliver at lunchtime too (otherwise collection only)
      </label>
    </div>
  </fieldset>

  ${dayFields}

  <p class="note">A day with no times is closed. “Closed all day” overrides
  anything below it.</p>

  <div class="save">
    <button class="save-btn" type="submit">Save</button>
  </div>
</form>

${hoursAreCustom ? `<form method="post" action="/admin/hours">
  <button class="reset" name="reset" value="1" type="submit">Reset to the default hours</button>
</form>` : ''}`;

  return layout({
    title: 'Opening hours', nonce, body, logout: true, back: '/admin', extraCss: CSS
  });
}
