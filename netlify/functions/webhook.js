// ============================================================
//  /webhook — Recibe notificaciones de pago de Mercado Pago
//  y registra el pedido en Google Sheets (vía Apps Script).
//  Variables de entorno requeridas en Netlify:
//    MP_ACCESS_TOKEN   → mismo token que /checkout
//    SHEETS_WEBAPP_URL → URL /exec del Apps Script de pedidos
//  Responde SIEMPRE 200 para que MP no reintente en bucle.
// ============================================================

export default async (req) => {
  try {
    const url = new URL(req.url);
    let paymentId =
      url.searchParams.get("data.id") || url.searchParams.get("id") || null;
    let topic =
      url.searchParams.get("type") || url.searchParams.get("topic") || "";

    if (!paymentId && req.method === "POST") {
      try {
        const body = await req.json();
        topic = body.type || body.topic || topic;
        paymentId = body?.data?.id || body?.id || null;
      } catch {}
    }

    if (!paymentId || !String(topic).includes("payment")) {
      return new Response("ignored", { status: 200 });
    }

    // Consultar el pago real en Mercado Pago
    const resp = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    if (!resp.ok) return new Response("mp fetch failed", { status: 200 });

    const pago = await resp.json();
    const status = pago.status; // approved | pending | in_process | rejected...

    // Solo registramos aprobados y pendientes (OXXO / SPEI)
    if (!["approved", "pending", "in_process"].includes(status)) {
      return new Response("status ignored", { status: 200 });
    }

    const m = pago.metadata || {};
    const direccion = [m.calle, m.colonia, m.ciudad, m.estado, m.cp ? "CP " + m.cp : ""]
      .filter(Boolean).join(", ");
    const fecha = new Date(pago.date_approved || pago.date_created || Date.now())
      .toLocaleString("es-MX", { timeZone: "America/Mexico_City" });

    // Payload en el MISMO formato que el script v2 de pedidos (creatina)
    const pedido = {
      fecha,
      referencia: pago.external_reference || "",
      pago_id: String(pago.id),
      estatus: status,
      monto_total: pago.transaction_amount || m.total || "",
      plan_bolsas: Number(m.bolsas) || 1,
      envio_servicio: Number(m.envio) === 0 ? "Envío GRATIS ★" : "Envío estándar",
      envio_costo: Number(m.envio) || 0,
      cliente: m.nombre || "",
      telefono: m.telefono || "",
      email: m.email || "",
      direccion,
      referencias: m.referencias || "",
      metodo_pago: pago.payment_method_id || pago.payment_type_id || "",
    };

    // Registrar en Google Sheets (Apps Script)
    await fetch(process.env.SHEETS_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("error handled", { status: 200 });
  }
};
