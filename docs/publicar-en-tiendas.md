# Publicar Cubica Manager en App Store y Google Play

La app de las tiendas abre el sitio publicado en `cubica.casadeleifs.cl`. Un despliegue web la actualiza; solo los cambios nativos (`capacitor.config.ts`, plugins, íconos, permisos) exigen publicar una versión nueva.

Estado: los proyectos `ios/` y `android/` están generados, pero nunca se han compilado ni abierto en un simulador o teléfono.

## 1. Antes de compilar

- [ ] Desplegar a producción el código de este repositorio. La app carga producción, así que sin esto no tiene los cambios para móvil.
- [ ] Completar `RESPONSABLE` y `VIGENCIA` en `app/privacidad/page.tsx` y revisar el texto con un abogado.
- [ ] Crear en producción una cuenta de demostración con datos de ejemplo, para que las tiendas puedan revisar la app.
- [ ] Decidir el identificador definitivo. Hoy es `cl.casadeleifs.cubica` y no se puede cambiar después de publicar.

## 2. Cuentas

| | Apple Developer Program | Google Play Console |
|---|---|---|
| Quién | Empresa (requiere D-U-N-S) o persona | Empresa (requiere D-U-N-S) o persona |
| Costo | Anual; revisar el valor vigente | Pago único; revisar el valor vigente |
| Exigencia adicional | Revisión de cada versión | Cuentas personales nuevas: prueba cerrada con 12 testers durante 14 días seguidos |

Se recomienda una cuenta de empresa: Google no le aplica la prueba de 12 testers, y la ficha de la tienda muestra el nombre de la empresa.

## 3. Herramientas en el Mac

1. Instalar Xcode desde la App Store y abrirlo una vez.
2. Instalar Android Studio, con su SDK y su JDK.
3. Activar Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

4. Actualizar los proyectos:

```bash
npx cap sync
```

## 4. Probar en simulador y teléfono real

```bash
npx cap open ios
```

```bash
npx cap open android
```

Revisar en ambos:

- [ ] Iniciar sesión, cerrar la app y volver a abrirla: la sesión sigue activa. En iOS hay reportes de fallas de cookies con un sitio remoto, así que es la primera prueba.
- [ ] Abrir con señal, activar modo avión, cerrar y volver a abrir: Terreno abre. En iOS depende de `WKAppBoundDomains`.
- [ ] Sin señal, guardar un parte; al volver la señal, llega al sistema.
- [ ] Descargar PDF y Excel: se abre el menú de compartir y el archivo se abre bien.
- [ ] Libro de obra: tomar una foto con la cámara y elegir otra de la galería.
- [ ] "¿Olvidaste tu contraseña?" abre el navegador del teléfono y la recuperación termina bien.
- [ ] Botón Atrás de Android: retrocede una pantalla, no cierra la app.
- [ ] La barra superior no queda bajo el notch ni bajo la barra de estado.
- [ ] Dictado por voz del Copiloto: si no funciona dentro de la app, ocultarlo.
- [ ] Enlaces externos, como WhatsApp o fotos: abren fuera y se puede volver a la app.

## 5. Firmar y subir

**iOS:** en Xcode, elegir el equipo en Signing & Capabilities, luego Product > Archive y Distribute App. Probar primero con TestFlight.

**Android:** en Android Studio, Build > Generate Signed Bundle, formato AAB. Guardar la clave de firma fuera del repositorio y con respaldo.

## 6. Fichas de las tiendas

Material necesario:

- Nombre: Cubica Manager
- Política de privacidad: `https://cubica.casadeleifs.cl/privacidad`
- Eliminación de cuenta y datos (Google Play): `https://cubica.casadeleifs.cl/privacidad`
- Soporte: un correo y una página de contacto
- Capturas de pantalla reales, por tamaño de pantalla que pida cada tienda
- Categoría sugerida: Negocios o Productividad
- Formularios: App Privacy (Apple) y Data Safety (Google). Declarar datos de cuenta, fotos, datos financieros y datos de trabajadores, con Supabase, Vercel y el proveedor de IA del Copiloto.

Texto sugerido para la ficha:

> Gestiona tus obras de construcción: presupuesto, avance, compras, parte diario, costos y cobros. Registra el parte diario y el avance desde la obra, incluso sin señal.

Notas para quien revisa:

> Cubica Manager es una herramienta para empresas constructoras. Las cuentas se crean en el sitio web y la app es solo para iniciar sesión. Usa la cuenta de demostración incluida. Para probar el trabajo sin conexión: abre Terreno con señal, activa el modo avión, registra un parte diario y vuelve a conectarte.

## Riesgos de rechazo

- **Apple 4.2, funcionalidad mínima.** Apple puede rechazar una app que considere solo un sitio web empaquetado. A favor están el trabajo sin señal, la cámara y compartir archivos. Si la rechazan, lo siguiente sería agregar funciones nativas, como notificaciones.
- **Apple 5.1.1(v), eliminar la cuenta.** Se exige si la app permite crear cuentas. Por eso el registro está oculto dentro de la app y sigue en la web. Si Apple o Google piden eliminar la cuenta dentro de la app, hay que construirlo y decidir qué datos se conservan por obligación legal.
- **Pagos.** La app no vende nada. Si se agrega un cobro dentro de la app, hay que revisar las reglas de compras de cada tienda.

## Actualizar íconos

Reemplazar `assets/logo.png` y ejecutar lo siguiente. Después, borrar `icons/` y `public/manifest.webmanifest`, que la herramienta crea y que chocan con `app/manifest.ts`.

```bash
npx @capacitor/assets generate --iconBackgroundColor '#131C2B' --iconBackgroundColorDark '#131C2B' --splashBackgroundColor '#131C2B' --splashBackgroundColorDark '#131C2B'
```
