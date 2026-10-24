# Publicidad pausada: análisis del 10 de octubre de 2026

Consulta de solo lectura en Meta Ads Manager (ContrataCR Ads) y producción Supabase. No se activaron anuncios, no se editaron presupuestos y no se publicaron cambios.

## Campaña reciente

- Campaña: Clientes - Reel Confianza - Oct 2026.
- Conjunto: Clientes - CR 25+ - Reels - Oct 2026.
- Anuncio: Reel Confianza - Post IG, actualmente apagado; campaña/conjunto conservan su interruptor encendido pero la entrega figura Ad off.
- Creado 7 de octubre, 19:25; comenzó entrega 19:42. Apagado 9 de octubre, 18:39, según historial de Meta (hora de Costa Rica).
- Presupuesto creado: US$5 diarios; no aparecieron cambios posteriores en el historial consultado.
- Gasto acumulado US$9,38; 342 visitas a página de destino; alcance 4.673; 5.601 impresiones; frecuencia 1,20. Costo calculado por visita US$0,0274, mostrado US$0,03.
- Optimización: Landing Page Views, no registro de cliente ni solicitud de servicio.
- Destino: https://contratacr.com/?utm_source=meta&utm_medium=paid&utm_campaign=clientes-oct26&utm_content=reel-confianza
- Seguimiento de eventos web activado, con ContrataCR Pixel. Esto no prueba recepción efectiva ni optimización por registros.

El historial máximo visible de las tres campañas suma US$98,72: Reel Confianza US$9,38; Clientes - Registro - Ago 2026 US$46,91; IG Seguidores - ContrataCR - Ago 2026 US$42,43. Este es el gasto de las campañas visibles consultadas, no una conciliación de toda la facturación de Meta.

## Los seis clientes del 9 de octubre

Consulta `created_at >= 2026-10-09T06:00:00Z` y `< 2026-10-10T06:00:00Z`, para el día completo de Costa Rica:

- Seis filas de clientes nuevos.
- Todas tienen acquisition_source=direct, sin medium ni campaign.
- Tres llegaron directamente al perfil /bryan-mauricio-esquivel-rodriguez; dos a /login; una a la portada.
- Cuatro de esas seis cuentas dejaron reseñas al mismo profesional ese día.
- Existe un clic a WhatsApp conservado de una de las seis cuentas. No confundir una cuenta creada para dejar una reseña con una nueva solicitud de trabajo.
- No hay filas de registro en producción con acquisition_campaign=clientes-oct26.

Interpretación: hay evidencia de actividad asociada a reseñas/perfil compartido, no atribución registrada a la campaña. «Directo» no demuestra ausencia de publicidad: pueden perderse etiquetas al cambiar de navegador/dispositivo, compartir un enlace sin parámetros o regresar por otra vía. Meta también puede atribuir exposición sin un clic etiquetado. No adjudicar las seis altas a anuncios ni calcular US$9,38/6 como costo de adquisición.

## Decisión propuesta

No reactivar únicamente por los seis registros de ayer ni por temor a perder aprendizaje. La campaña compró visitas durante menos de dos días; esto no alcanza para demostrar captación de clientes con intención de contratar.

Antes de invertir de nuevo:

1. Verificar que Meta reciba eventos reales y distinguir registro de cliente, registro profesional y registro para dejar reseña. El evento CompleteRegistration en el código se usa en más de un flujo: no basta contar ese evento sin segmentarlo.
2. Medir una acción de intención: publicar una necesidad o contactar a un profesional, junto con registro y UTM. Revisar la página de destino y el mensaje del Reel para que coincidan con esa intención.
3. Definir un costo máximo aceptable por cliente que actúa, no por visita. No hay ingresos/valor de cliente suficientes en esta revisión para determinar rentabilidad.
4. Si se decide una prueba, una sola campaña/conjunto, presupuesto estable y tope total. US$2–3 diarios durante siete días (US$14–21) es un ejemplo de prueba acotada, no garantía de aprendizaje ni de resultados. Si no se puede evaluar al menos alguna acción relevante dentro de ese tope, prolongarla a ciegas no resuelve la medición.
5. No repartir ese presupuesto entre seguidores, tráfico y varios públicos. Evaluar por contactos/solicitudes atribuibles y costo; las visitas son una métrica intermedia.

Reducir el presupuesto reduce oportunidades de entrega y hace más lento reunir evidencia; no implica automáticamente peores clientes. Una prueba de menor inversión sirve para limitar riesgo, pero puede quedar inconclusa por falta de muestra. El aprendizaje depende del objetivo configurado: actualmente visita a página. No hay evidencia aquí de que aprendiera a identificar necesidad de contratación.

## Fuentes y límites

Meta describe Landing Page Views como optimización para personas que llegan a la página después de un clic: https://about.fb.com/news/2017/06/better-understand-interactions/

Las páginas públicas de ayuda de Meta sobre learning phase y significant edits redirigieron a inicio de sesión durante la consulta web. No se verificó una regla numérica universal para cambios de presupuesto ni se asume que una pausa borre todo el aprendizaje. No se midió el incremento causal de conversiones; hace falta comparar períodos y resultados con una prueba controlada o incremental.
