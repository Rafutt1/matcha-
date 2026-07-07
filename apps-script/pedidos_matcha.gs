/**
 * PEDIDOS MATCHA · Healthy Superfoods — v2 (adaptado del script de creatina)
 * - Registra cada venta aprobada de Mercado Pago en la hoja "Pedidos".
 * - Te avisa por correo y Telegram en cada venta.
 * - Crea links de WhatsApp de UN CLIC para agradecer la compra.
 * - Al pegar la GUÍA de envío: marca ENVIADO y notifica al cliente por
 *   WhatsApp (automático con Cloud API, o link de un clic si no la tienes).
 *
 * INSTALACIÓN (solo 3 pasos, lo demás ya viene precargado):
 * 1. Google Sheet nueva "Pedidos Matcha" → Extensiones → Apps Script →
 *    pega este código → pega el ID de la hoja en SHEET_ID (abajo).
 * 2. Implementar → Nueva implementación → Aplicación web
 *    (Ejecutar como: Tú · Acceso: Cualquier usuario) → copia la URL /exec
 *    → pégala en Netlify como SHEETS_WEBAPP_URL.
 *    Luego: Activadores (reloj) → + Agregar activador → función: alEditar ·
 *    evento: De la hoja de cálculo · tipo: Al editar.
 * 3. Ejecuta conectarTelegram() UNA VEZ (el chat_id se guarda solo; si no
 *    detecta nada, mándale "hola" a t.me/HEALTHYMX_BOT y vuelve a ejecutar).
 *
 * (Opcional, WhatsApp 100% automático) Configuración del proyecto →
 * Propiedades del script → agrega WA_TOKEN y WA_PHONE_ID igual que en creatina.
 */

// ⚠️ LO ÚNICO QUE DEBES PEGAR: el ID de tu Google Sheet nueva.
// Lo sacas de la URL: https://docs.google.com/spreadsheets/d/ESTE-PEDAZO-LARGO/edit
const SHEET_ID = "PEGA_AQUI_EL_ID_DE_TU_HOJA_DE_MATCHA";

// Ya precargado (igual que en creatina):
const NOTIFICAR_EMAIL = "rafutt@gmail.com";
const TG_TOKEN = "8929494702:AAHUMHO0BE7MBtFVYsLRWC2yJj3BgXgBIh8"; // HEALTHYMX_BOT

const PRODUCTO = "Matcha Orgánica Premium";

const ENCABEZADOS = [
  "Fecha", "Referencia", "Pago ID", "Estatus pago", "Monto total",
  "Bolsas", "Servicio de envío", "Costo envío", "Cliente", "Teléfono",
  "Email", "Dirección", "Referencias", "Método de pago",
  "Estatus envío", "Guía", "Link rastreo", "WA Gracias", "WA Envío"
];
const COL = {};
ENCABEZADOS.forEach((h, i) => COL[h] = i + 1);

// ============ REGISTRO DE VENTAS (lo llama el webhook) ============
function doPost(e) {
  // Candado: evita filas duplicadas cuando MP notifica varias veces a la vez
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const d = JSON.parse(e.postData.contents);
    const hoja = obtenerHoja_();
    const esAprobado = d.estatus === "approved";

    // ¿Ya existe este pago? (upsert: OXXO/SPEI pasan de pendiente a aprobado)
    let filaExistente = 0;
    if (hoja.getLastRow() > 1) {
      const ids = hoja.getRange(2, COL["Pago ID"], hoja.getLastRow() - 1, 1).getValues().flat().map(String);
      const idx = ids.indexOf(String(d.pago_id));
      if (idx !== -1) filaExistente = idx + 2;
    }

    if (filaExistente) {
      const estatusActual = String(hoja.getRange(filaExistente, COL["Estatus pago"]).getValue());
      if (estatusActual === d.estatus) {
        return ContentService.createTextOutput("duplicado"); // misma notificación repetida
      }
      // Cambio de estatus (ej. ficha OXXO pagada): actualizar fila
      hoja.getRange(filaExistente, COL["Estatus pago"]).setValue(d.estatus);
      if (esAprobado) {
        hoja.getRange(filaExistente, COL["Estatus envío"]).setValue("POR EMPACAR");
        avisar_("✅ PAGO CONFIRMADO (ficha pagada)", d);
      }
      return ContentService.createTextOutput("actualizado");
    }

    // Pedido nuevo
    const waGracias = esAprobado ? linkWA_(d.telefono,
      "¡Hola " + primerNombre_(d.cliente) + "! 🙌 Gracias por tu compra en Healthy Superfoods " +
      "(pedido " + d.referencia + "). Estamos preparando tu " + PRODUCTO + " y te avisaremos " +
      "por aquí cuando salga tu envío. ¡Bienvenid@ al equipo! 🍵💚") : "";

    hoja.appendRow([
      d.fecha, d.referencia, d.pago_id, d.estatus, d.monto_total,
      d.plan_bolsas, d.envio_servicio, d.envio_costo, d.cliente, "'" + d.telefono,
      d.email, d.direccion, d.referencias, d.metodo_pago,
      d.estatus_envio || (esAprobado ? "POR EMPACAR" : "ESPERANDO PAGO"), "", "", waGracias, ""
    ]);

    avisar_(esAprobado ? "🍵 NUEVA VENTA DE MATCHA" : "🕓 PEDIDO PENDIENTE (OXXO/SPEI)", d);
    return ContentService.createTextOutput("ok");
  } catch (err) {
    return ContentService.createTextOutput("error: " + err);
  } finally {
    lock.releaseLock();
  }
}

// ============ AVISOS: correo + Telegram ============
function avisar_(titulo, d) {
  const n = d.plan_bolsas;
  const resumen = titulo + " · $" + d.monto_total + " MXN" +
    "\n🕐 " + d.fecha +
    "\n👤 " + d.cliente +
    "\n📦 " + n + (n == 1 ? " bolsa" : " bolsas") + " de Matcha (" + (n * 0.5) + " kg)" +
    "\n🚚 " + (d.envio_servicio || "Por definir") +
    "\n📞 " + d.telefono +
    "\n📍 " + d.direccion +
    (d.referencias ? "\n📝 " + d.referencias : "") +
    "\n🧾 " + d.referencia;

  // Correo
  try {
    const correo = (NOTIFICAR_EMAIL.indexOf("@") > 0 && NOTIFICAR_EMAIL.indexOf("PEGA_AQUI") === -1)
      ? NOTIFICAR_EMAIL : Session.getEffectiveUser().getEmail();
    if (correo) MailApp.sendEmail({
      to: correo,
      subject: titulo + " · " + d.cliente + " · $" + d.monto_total,
      body: resumen + "\n\n1) Empaca el pedido.\n2) Genera la guía en envia.com." +
            "\n3) Pega la guía en la columna 'Guía' → el cliente recibe su notificación."
    });
  } catch (err) { console.error("Email:", err); }

  // Telegram (tiempo real)
  try {
    const props = PropertiesService.getScriptProperties();
    const chat = props.getProperty("TG_CHAT_ID");
    if (TG_TOKEN && chat) {
      UrlFetchApp.fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ chat_id: chat, text: resumen }),
        muteHttpExceptions: true
      });
    }
  } catch (err) { console.error("Telegram:", err); }
}

// ============ AUTOMATIZACIÓN DE ENVÍO (activador instalable "Al editar") ============
function alEditar(e) {
  if (!e || !e.range) return;
  const hoja = e.range.getSheet();
  if (hoja.getName() !== "Pedidos") return;
  const fila = e.range.getRow(), col = e.range.getColumn();
  if (fila < 2 || col !== COL["Guía"]) return;

  const guia = String(e.range.getValue()).trim();
  if (!guia) return;

  const get = (nombre) => hoja.getRange(fila, COL[nombre]).getValue();
  const set = (nombre, v) => hoja.getRange(fila, COL[nombre]).setValue(v);

  // 1. Marcar como ENVIADO
  set("Estatus envío", "ENVIADO");

  // 2. Link de rastreo público de envia.com
  const rastreo = "https://envia.com/es-MX/rastreo?label=" + encodeURIComponent(guia);
  set("Link rastreo", rastreo);

  // 3. Notificar al cliente por WhatsApp
  const tel = String(get("Teléfono")).replace(/\D/g, "");
  const nombre = primerNombre_(String(get("Cliente")));
  const ref = String(get("Referencia"));
  const msg = "¡" + nombre + ", tu pedido " + ref + " ya va en camino! 🚚 " +
              "Tu " + PRODUCTO + " fue enviada. Guía: " + guia +
              ". Puedes rastrearla aquí: " + rastreo +
              " — Gracias por tu compra. Healthy Superfoods 🍵💚";

  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("WA_TOKEN");
  const phoneId = props.getProperty("WA_PHONE_ID");

  if (token && phoneId && tel) {
    // AUTOMÁTICO: plantilla "envio_generado" vía WhatsApp Cloud API
    try {
      UrlFetchApp.fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        payload: JSON.stringify({
          messaging_product: "whatsapp",
          to: "52" + tel,
          type: "template",
          template: {
            name: "envio_generado",
            language: { code: "es_MX" },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: nombre },
                { type: "text", text: ref },
                { type: "text", text: guia },
                { type: "text", text: rastreo }
              ]
            }]
          }
        }),
        muteHttpExceptions: true
      });
      set("WA Envío", "ENVIADO AUTOMÁTICO ✓");
    } catch (err) {
      set("WA Envío", linkWA_(tel, msg)); // fallback manual
    }
  } else {
    // MANUAL DE UN CLIC: deja el link listo para tocar y enviar
    set("WA Envío", linkWA_(tel, msg));
  }
}

// ============ UTILIDADES ============
function obtenerHoja_() {
  // Funciona tanto en scripts dentro de la hoja como en proyectos sueltos
  let ss;
  try { ss = SpreadsheetApp.openById(SHEET_ID); }
  catch (e) { ss = SpreadsheetApp.getActiveSpreadsheet(); }
  if (!ss) throw new Error("Configura SHEET_ID al inicio del código con el ID de tu Google Sheet.");
  let hoja = ss.getSheetByName("Pedidos");
  if (!hoja) {
    hoja = ss.insertSheet("Pedidos");
    hoja.appendRow(ENCABEZADOS);
    hoja.getRange(1, 1, 1, ENCABEZADOS.length)
        .setFontWeight("bold").setBackground("#12240F").setFontColor("#C8EC8F");
    hoja.setFrozenRows(1);
    // Colores por estatus de envío
    const r = hoja.getRange("O2:O1000");
    const reglas = [
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ESPERANDO PAGO")
        .setBackground("#F4C7C3").setRanges([r]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("POR EMPACAR")
        .setBackground("#FCE8B2").setRanges([r]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ENVIADO")
        .setBackground("#B7E1CD").setRanges([r]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ENTREGADO")
        .setBackground("#C9DAF8").setRanges([r]).build()
    ];
    hoja.setConditionalFormatRules(reglas);
  }
  return hoja;
}
function primerNombre_(completo) {
  return (completo || "").trim().split(" ")[0] || "cliente";
}
function linkWA_(tel, mensaje) {
  const t = String(tel || "").replace(/\D/g, "");
  if (!t) return "";
  return "https://wa.me/52" + t + "?text=" + encodeURIComponent(mensaje);
}

// ============ TELEGRAM: CONFIGURACIÓN AUTOMÁTICA ============
// PASO 1: en Telegram, mándale cualquier mensaje a tu bot (t.me/HEALTHYMX_BOT)
// PASO 2: ejecuta esta función UNA VEZ (menú de arriba → conectarTelegram → Ejecutar)
function conectarTelegram() {
  const r = UrlFetchApp.fetch("https://api.telegram.org/bot" + TG_TOKEN + "/getUpdates", { muteHttpExceptions: true });
  const data = JSON.parse(r.getContentText());
  if (!data.ok) { Logger.log("❌ Token inválido o revocado: " + r.getContentText()); return; }
  const updates = data.result || [];
  let chatId = null, nombre = "";
  for (let i = updates.length - 1; i >= 0; i--) {
    const m = updates[i].message || updates[i].edited_message;
    if (m && m.chat && m.chat.id) { chatId = String(m.chat.id); nombre = m.chat.first_name || ""; break; }
  }
  if (!chatId) {
    Logger.log("❌ No hay mensajes. Abre Telegram, mándale 'hola' a t.me/HEALTHYMX_BOT y vuelve a ejecutar esta función.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("TG_CHAT_ID", chatId);
  UrlFetchApp.fetch("https://api.telegram.org/bot" + TG_TOKEN + "/sendMessage", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId,
      text: "✅ ¡Telegram conectado, " + nombre + "! Aquí te llegarán las ventas de MATCHA de Healthy Superfoods en tiempo real. 🍵💚" })
  });
  Logger.log("✅ Listo. Tu chat_id (" + chatId + ") quedó guardado y te mandé un mensaje de confirmación.");
}

// Prueba completa de avisos (correo + Telegram) sin comprar nada
function probarAvisos() {
  avisar_("🧪 PRUEBA", {
    cliente: "Cliente de Prueba", monto_total: 630, referencia: "MTC-TEST-001",
    plan_bolsas: 1, envio_servicio: "Envío estándar", telefono: "2221234567",
    direccion: "Calle Falsa 123, Puebla", referencias: "Portón negro"
  });
  Logger.log("Aviso de prueba enviado. Revisa tu Telegram y tu correo.");
}
