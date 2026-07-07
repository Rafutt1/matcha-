# Sitio Matcha · Healthy Superfoods
### Misma arquitectura que creatina.healthysuperfoods.mx
Checkout Pro de Mercado Pago + pedidos en Google Sheets + Telegram/correo

## Precios (una constante, dos lugares)
| Plan | Producto | Envío | Total |
|---|---|---|---|
| 1 bolsa (500 g) | $500 | $130 | $630 |
| 3 bolsas (1.5 kg) | $1,400 | GRATIS | $1,400 |
| Prueba (oculto, con `?prueba`) | $10 | $0 | $10 |

Si cambias precios, edítalos en **DOS** archivos:
`index.html` (const PLANS) y `netlify/functions/checkout.js` (const PLANS).

## Instalación (~10 min — casi todo viene precargado)

### 1. Google Sheet nueva (tu script v2, ya adaptado)
- Crea la hoja "Pedidos Matcha" → Extensiones → Apps Script →
  pega `apps-script/pedidos_matcha.gs` COMPLETO.
- **Lo ÚNICO que pegas: SHEET_ID** (el ID de la URL de tu hoja nueva).
  Tu correo y el token de HEALTHYMX_BOT ya vienen precargados.
- Implementar → Aplicación web → Ejecutar como: Yo → Acceso: Cualquiera.
  Copia la URL /exec.
- Activadores (reloj) → Añadir → función `alEditar` → evento "Al editar".
- Ejecuta `conectarTelegram()` UNA VEZ → el chat_id se guarda solo y el
  bot te manda confirmación. (Si falla, mándale "hola" al bot y reintenta.)
- Opcional: si usas WhatsApp Cloud API, copia WA_TOKEN y WA_PHONE_ID a
  Propiedades del script, igual que en creatina.

### 2. Netlify (sitio NUEVO, separado del de creatina)
```bash
cd matcha-site
netlify init          # crea el sitio nuevo
netlify env:set MP_ACCESS_TOKEN "APP_USR-..."      # el MISMO token de creatina
netlify env:set SHEETS_WEBAPP_URL "https://script.google.com/macros/s/XXXX/exec"
netlify deploy --prod
```
Luego en Netlify → Domain settings → agrega matcha.healthysuperfoods.mx.

### 3. Subdominio
En GoDaddy agrega un CNAME: `matcha` → tu sitio de Netlify.
(SITE_URL en checkout.js ya apunta a matcha.healthysuperfoods.mx.)

### 4. Prueba antes de anunciar
1. Entra a `matcha.healthysuperfoods.mx/?prueba`
2. Aparece el botón "Compra de PRUEBA ($10)" — haz un pago real de $10.
3. Verifica: redirección a gracias.html ✓ · fila en la Sheet ✓ ·
   mensaje de Telegram ✓ · correo ✓.
4. Cancela/reembolsa el pago de prueba desde Mercado Pago si quieres.

### 5. Conversiones
- El sitio ya trae tu Google tag (AW-11025197386) y GA4 (G-N5P1NHBZ47)
  con `begin_checkout` y `purchase` (solo pagos aprobados, con monto real).
- Sugerencia: en Google Ads crea una acción de conversión NUEVA
  "Compra Matcha" para separar métricas de la de creatina.
- Meta Pixel: bloque listo pero comentado en ambos HTML — descomenta
  y pon tu Pixel ID cuando lo tengas.

## Flujo
```
Cliente → index.html → /checkout (valida precios) → Mercado Pago → paga
              Mercado Pago → /webhook → Google Sheet + Telegram + correo
Pega la guía en la columna "Guía" → se autollenan rastreo + msj WhatsApp
```

## Notas
- El webhook siempre responde 200 para que MP no reintente en bucle.
- La Sheet evita duplicados (LockService) y actualiza OXXO/SPEI
  de "ESPERANDO PAGO" → "POR EMPACAR" cuando se acredita (upsert).
- gracias.html detecta pagos pendientes y muestra el mensaje de reloj.
