# Retiro del aviso automático de publicidad

Por solicitud expresa de Isaac se retira `AdvertisingPreferences` del layout global. El componente ya no admite modo `notice` ni estilos de ventana flotante; sus controles permanecen únicamente dentro de Privacidad y los ajustes de cuenta.

No se modifica el texto de términos del login, la aceptación del registro, las versiones legales ni los consentimientos ya guardados. Quitar el aviso no concede permiso publicitario: Meta continúa desactivado cuando no existe una elección explícita vigente.

La regresión comprueba la ausencia del aviso y de una segunda pantalla de términos al entrar en búsqueda, login y registro, tanto en web como con la plataforma nativa, en Chromium escritorio, Chromium móvil y WebKit móvil. También se conservan los controles voluntarios de Privacidad, la prueba de contacto anónimo y el contrato del logo sin fuentes web.

El lint general del layout conserva un diagnóstico previo de `react-hooks/purity` por el `Date.now()` del aviso de descarga; esa línea no se modifica en esta corrección. Los archivos modificados restantes y el layout con esa regla aislada no introducen errores de lint.

Validación: 18 comprobaciones de ausencia de avisos, consentimiento voluntario y marca aprobadas en los tres proyectos de navegador; 3 pruebas adicionales de contacto anónimo aprobadas. Build de producción y security smoke aprobados. Se regenera el inventario de testing. No hay migraciones ni versiones de tienda.
