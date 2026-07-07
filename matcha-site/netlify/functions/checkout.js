// ============================================================
//  /checkout — Crea la preferencia de Mercado Pago (Checkout Pro)
//  Los precios se validan AQUÍ (servidor) para evitar manipulación.
//  Variables de entorno requeridas en Netlify:
//    MP_ACCESS_TOKEN  → Access Token de PRODUCCIÓN (APP_USR-...)
// ============================================================

// ⚙️ Si cambias precios, cámbialos TAMBIÉN en index.html (const PLANS)
const PLANS = {
  "1": {
    title: "Matcha Orgánica Premium 500 g — 1 bolsa",
    bolsas: 1,
    precio: 500,
    envio: 130,
  },
  "3": {
    title: "Matcha Orgánica Premium 500 g — 3 bolsas (envío gratis)",
    bolsas: 3,
    precio: 1400,
    envio: 0,
  },
  // Plan oculto de prueba: solo se activa visitando el sitio con ?prueba
  "prueba": {
    title: "PRUEBA — Matcha (no surtir)",
    bolsas: 1,
    precio: 10,
    envio: 0,
  },
};

const SITE_URL = "https://matcha.healthysuperfoods.mx";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const plan = PLANS[String(body.plan)];
  if (!plan) return json({ error: "Plan inválido" }, 400);

  const c = body.cliente || {};
  const requeridos = ["nombre", "telefono", "email", "calle", "colonia", "ciudad", "estado", "cp"];
  for (const campo of requeridos) {
    if (!String(c[campo] || "").trim()) {
      return json({ error: `Falta el campo: ${campo}` }, 400);
    }
  }

  const total = plan.precio + plan.envio;
  const referencia = "MTC-" + Date.now();

  const items = [
    {
      title: plan.title,
      quantity: 1,
      unit_price: plan.precio,
      currency_id: "MXN",
    },
  ];
  if (plan.envio > 0) {
    items.push({
      title: "Envío a domicilio (paquetería)",
      quantity: 1,
      unit_price: plan.envio,
      currency_id: "MXN",
    });
  }

  const preference = {
    items,
    payer: {
      name: c.nombre,
      email: c.email,
      phone: { number: String(c.telefono) },
    },
    back_urls: {
      success: `${SITE_URL}/gracias.html?monto=${total}&ref=${referencia}`,
      pending: `${SITE_URL}/gracias.html?monto=${total}&ref=${referencia}&pendiente=1`,
      failure: `${SITE_URL}/?pago=fallido`,
    },
    auto_return: "approved",
    notification_url: `${SITE_URL}/.netlify/functions/webhook`,
    external_reference: referencia,
    statement_descriptor: "HEALTHYSUPERFOODS",
    metadata: {
      producto: "Matcha Orgánica Premium 500 g",
      plan: String(body.plan),
      bolsas: plan.bolsas,
      subtotal: plan.precio,
      envio: plan.envio,
      total,
      nombre: c.nombre,
      telefono: c.telefono,
      email: c.email,
      calle: c.calle,
      colonia: c.colonia,
      ciudad: c.ciudad,
      estado: c.estado,
      cp: c.cp,
      referencias: c.referencias || "",
    },
  };

  const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(preference),
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    console.error("Error MP:", detalle);
    return json({ error: "No se pudo crear el pago. Intenta de nuevo." }, 502);
  }

  const data = await resp.json();
  return json({ init_point: data.init_point, referencia });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
