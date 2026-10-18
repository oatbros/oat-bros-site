// Vercel serverless function: creates a Stripe Checkout Session.
// Prices live here (server-side) so customers can't tamper with them.
// Needs the STRIPE_SECRET_KEY environment variable set in Vercel.

const PRODUCTS = {
  'oat-hat': { name: 'Oat Enthusiast Cap (pre order)', cents: 3500 }
};

const DELIVERY_CENTS = 800; // flat-rate courier, NZD
const SITE = 'https://oatbros.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    res.status(500).json({ error: 'Checkout is not configured yet.' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const delivery = body.fulfilment === 'delivery';

  const p = new URLSearchParams();
  p.append('mode', 'payment');
  p.append('success_url', SITE + '/shop.html?success=1');
  p.append('cancel_url', SITE + '/shop.html');
  p.append('phone_number_collection[enabled]', 'true');

  let n = 0;
  items.forEach(function (it) {
    const prod = PRODUCTS[it.id];
    const qty = Math.min(Math.max(parseInt(it.qty, 10) || 0, 0), 50);
    if (!prod || !qty) return;
    p.append('line_items[' + n + '][quantity]', String(qty));
    p.append('line_items[' + n + '][price_data][currency]', 'nzd');
    p.append('line_items[' + n + '][price_data][unit_amount]', String(prod.cents));
    p.append('line_items[' + n + '][price_data][product_data][name]', prod.name);
    n++;
  });
  if (!n) {
    res.status(400).json({ error: 'Your cart is empty.' });
    return;
  }

  if (delivery) {
    p.append('shipping_address_collection[allowed_countries][0]', 'NZ');
    p.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    p.append('shipping_options[0][shipping_rate_data][display_name]', 'Courier delivery');
    p.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(DELIVERY_CENTS));
    p.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'nzd');
  } else {
    p.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
    p.append('shipping_options[0][shipping_rate_data][display_name]', 'Store pickup (free)');
    p.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', '0');
    p.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'nzd');
    p.append('custom_fields[0][key]', 'pickupstore');
    p.append('custom_fields[0][type]', 'dropdown');
    p.append('custom_fields[0][label][type]', 'custom');
    p.append('custom_fields[0][label][custom]', 'Pickup store');
    p.append('custom_fields[0][dropdown][options][0][label]', 'Grey Lynn, Auckland');
    p.append('custom_fields[0][dropdown][options][0][value]', 'greylynn');
    p.append('custom_fields[0][dropdown][options][1][label]', 'Hamilton East');
    p.append('custom_fields[0][dropdown][options][1][value]', 'hamiltoneast');
  }

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: p.toString()
    });
    const data = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: (data.error && data.error.message) || 'Stripe error' });
      return;
    }
    res.status(200).json({ url: data.url });
  } catch (e) {
    res.status(502).json({ error: 'Could not reach Stripe.' });
  }
};
