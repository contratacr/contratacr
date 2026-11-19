# Correos del directorio: cómo activarlos

Esta guía es para el dueño de ContrataCR. El código ya está listo: usted solo tiene que crear la cuenta del proveedor, verificar el dominio y pegar cuatro variables. **Hasta que lo haga, no sale ningún correo real.**

## Qué correos son

Pasan por el adaptador `src/lib/email/provider.ts`. Las plantillas en español e inglés están en `src/lib/directory/launch-email.ts`.

- El código para reclamar un negocio.
- Las reservas: solicitud recibida, confirmada, cambiada, rechazada y la cancelación (que se le avisa al negocio).
- La lista de espera: «su mesa está lista» y «salió de la lista» (que se le avisa al negocio).

Todos son **transaccionales**: los provoca algo que la persona hizo, y al pie dicen por qué le llegó el correo. Ninguno lleva enlace de baja porque no son publicidad. Si algún día se agrega uno de promoción, la plantilla ya sabe poner la baja y la cabecera `List-Unsubscribe`.

La verificación de la cuenta (registro, código para entrar, recuperar contraseña) **no** pasa por aquí. Esos correos los manda Supabase con su propio SMTP, que se configura en el panel de Supabase. Allí ya se usa Resend: revise si ya tiene una cuenta de Resend antes de abrir otra.

## Los tres modos

| `EMAIL_MODE` | Qué pasa |
|---|---|
| `mock` (o sin poner) | Nada sale a internet. El correo queda en una bandeja de memoria (el buzón de prueba local). Es lo que se usa en desarrollo. |
| `sandbox` | Llama de verdad a Resend, pero **cambia el destinatario** por `delivered@resend.dev`, la bandeja de prueba de Resend. No le llega nada a nadie. |
| `live` | Entrega real. Solo funciona si **a la vez** `EMAIL_MODE=live`, el servidor corre en producción (`NODE_ENV=production`) y están la clave y el remitente. Si falta una de esas cosas, vuelve solo a `mock`. |

Además, en cualquier modo:

- Cada mensaje lleva una clave de idempotencia, así que el mismo aviso no sale dos veces (Resend también lo descarta si se repite dentro de 24 horas).
- Si falla, se reintenta hasta 3 veces (espera 0,5 s y después 1 s), pero solo cuando el error es de red, un 429 o un 5xx.
- Hay un límite de 8 correos por destinatario cada 10 minutos, con `src/lib/rate-limit.ts`.
- En los registros la dirección aparece enmascarada (`is***@g***.com`) y nunca se registra el código.

## Paso 1: crear la cuenta

1. Entre a https://resend.com y regístrese con el correo de la empresa.
2. Active la verificación en dos pasos en *Settings › Security*.

## Paso 2: verificar el dominio contratacr.com

1. En Resend vaya a *Domains › Add domain* y escriba `contratacr.com`. Si le deja escoger región, elija `us-east-1`.
2. Resend le mostrará unos registros DNS. Cópielos **tal como aparecen** en el panel donde administra el DNS de contratacr.com (por ejemplo Cloudflare). Si es Cloudflare, déjelos en «DNS only» (nube gris).

| Registro | Tipo | Nombre (aproximado) | Para qué sirve, en simple |
|---|---|---|---|
| **SPF** | TXT | `send` | Le dice a Gmail y Outlook: «Resend tiene permiso de mandar correo en nombre de contratacr.com». |
| (rebotes) | MX | `send` | Permite que Resend reciba los rebotes. Va en el subdominio `send`, así que **no toca** el correo normal de la empresa. |
| **DKIM** | TXT | `resend._domainkey` | Una firma digital en cada correo que prueba que nadie lo alteró y que de verdad viene de ustedes. |
| **DMARC** | TXT | `_dmarc` | La regla que dice qué hacer con los correos que no pasan SPF/DKIM. |

3. Sobre el DMARC:
   - Si ya existe un registro `_dmarc` (Brevo ya manda correo con este dominio), **no cree otro**. Solo puede haber uno.
   - Si no existe, empiece con `v=DMARC1; p=none; rua=mailto:soporte@contratacr.com`. Después de unas semanas sin problemas, cámbielo a `p=quarantine`.
4. Sobre el SPF: el de Resend va en `send.contratacr.com`, así que no choca con el SPF que Brevo tiene en la raíz del dominio. **No edite** el SPF de la raíz.
5. Vuelva a Resend y pulse *Verify*. Puede tardar de unos minutos a unas horas, hasta que diga **Verified**.

## Paso 3: crear la clave

1. En Resend vaya a *API Keys › Create API key*.
2. Escoja el permiso **Sending access**, limitado al dominio contratacr.com.
3. Copie la clave (empieza con `re_`). Resend la muestra **una sola vez**.

## Paso 4: pegar las variables

Péguelas en el panel del hosting (las variables y secretos del Worker de Cloudflare o de Vercel, según dónde corra el sitio). **No las ponga en el repositorio ni en archivos que se suban.**

| Variable | Valor |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_MODE` | `sandbox` para probar; `live` cuando ya quiera enviar de verdad |
| `RESEND_API_KEY` | la clave `re_…`, guardada como **secreto** |
| `EMAIL_FROM` | `ContrataCR <avisos@contratacr.com>` (tiene que ser del dominio verificado) |

Para probar en su computadora, ponga las mismas variables en `.env.local` con `EMAIL_MODE=sandbox`.

## Paso 5: probar en sandbox

1. Con `EMAIL_MODE=sandbox`, reclame un negocio de prueba o haga una reserva de prueba.
2. En Resend, abra *Emails*. Debe aparecer el correo enviado a `delivered@resend.dev` con estado *Delivered*. La persona real no recibe nada.
3. Revise que el asunto y el texto salgan bien en español y en inglés.
4. Cuando todo esté bien, cambie a `EMAIL_MODE=live` **solo en producción** y vuelva a desplegar.

Para apagar los correos en cualquier momento, quite `EMAIL_MODE` o póngalo en `mock`. El sistema vuelve al modo de prueba sin tocar código.

## Costos

Precios de https://resend.com/pricing, consultados el 18 de noviembre de 2026:

- **Gratis:** 3.000 correos al mes, con un máximo de 100 por día y hasta 3 dominios. Alcanza para el lanzamiento.
- **Pro:** US$20 al mes por 50.000 correos, o US$35 por 100.000. Sin límite diario y hasta 10 dominios. Cada 1.000 correos de más cuestan US$0,90.
- **Scale:** desde US$90 al mes por 100.000 correos, para volúmenes grandes.

## Alternativa: Amazon SES

Amazon SES cuesta unos US$0,10 por cada 1.000 correos. Es más barato si el volumen crece mucho, pero tiene sus pegas:

- Hay que pedir que saquen la cuenta del «sandbox» de AWS.
- La configuración en AWS es más trabajo (IAM, regiones).
- Las métricas son menos cómodas.

Para usarlo habría que agregar un adaptador `SesEmailProvider` en `src/lib/email/provider.ts`. El resto del código no cambia.

Brevo ya se usa para los otros correos de la app (`src/lib/email/send.ts`). Seguir con Brevo también es posible, pero el directorio quedó preparado para Resend.

## Decisión 2026-11-19: usar Brevo (ya activo en producción)

Producción ya manda todos los correos del app con Brevo (`BREVO_API_KEY`, vía
`src/lib/email/send.ts` → `outbox.ts`: remitente verificado, cuota diaria,
recibos y webhook). El adaptador acepta `EMAIL_PROVIDER=brevo` y reutiliza ese
mismo camino, así que **no hace falta cuenta nueva**. Para lanzar basta con
agregar en producción:

    EMAIL_PROVIDER=brevo
    EMAIL_MODE=live

`sandbox` usa la cabecera `X-Sib-Sandbox: drop` de Brevo (valida y no entrega).
Ojo: el plan gratis de Brevo son 300 correos al día compartidos con todo el
app; los códigos de reclamo y avisos de reservas salen como `critico`.
Resend queda como alternativa (`EMAIL_PROVIDER=resend`).
