# Cambios

Qué trae cada versión de **consumo**. Para actualizar: `claude plugin update consumo` y después `/reload-plugins`.

## 0.10.0 — 2026-10-08

- **Umbral del modo ahorro configurable:** `/ahorro umbral <50-99>` cambia el porcentaje de la ventana de 5 h al que se activa el modo auto (por defecto, 85 %). Se guarda entre sesiones, y la tarjeta «Modelo y ahorro» y los mensajes muestran el umbral elegido.
- **Últimos prompts:** la tarjeta enseña como mucho 5 (antes 10); en pantallas bajas, 3 como antes. «Tokens por herramienta» no cambia.
- La mascota oculta ya no se redibuja en segundo plano.
- El progreso de la mascota se guarda al momento si hay logro o subida de nivel y, si no, al terminar cada turno y cada minuto, en vez de en cada llamada a una herramienta.
- Un `git commit --dry-run` ya no cuenta como commit, y `git -c clave=valor commit` sí se reconoce.

## 0.9.0 — 2026-10-07

- Botón **«⚙ Personalizar»** al pie de `/consumo`: cada tarjeta se sube, se baja, se oculta o se muestra, y el panel cambia al momento; Listo y Restablecer.
- **`/tarjetas`** para lo mismo escribiendo: orden, ocultar, mostrar, restablecer.
- Con un orden propio, las tarjetas van de izquierda a derecha y de arriba abajo; sin tocar nada se mantiene el reparto de siempre. La disposición se guarda en el almacén local de cada persona.
- «Por herramienta» pasa a llamarse «Tokens por herramienta».

## 0.8.1 — 2026-10-07

- Capturas nuevas en el README con la 0.8: Por herramienta, NeuroSigma con nivel y logros, Modelo y ahorro (generadas con datos de ejemplo).
- La barra de caché sale verde (o amarilla por debajo del 70 %) y la de experiencia amarilla: ya no se ponen rojas al llenarse.

## 0.8.0 — 2026-10-07

- Tarjeta **«Por herramienta»:** qué herramientas se llevan los tokens de la sesión (% del total, tokens, llamadas y errores); los subagentes cuentan en Agent y las MCP se agrupan por servidor.
- **Mascota:** experiencia, niveles de Bebé a Leyenda y 13 logros, con avisos y celebración; reacciones nuevas a `git commit` y a los tests; `/mascota logros` y tarjeta con el progreso.
- La tarjeta del modo ahorro pasa a «Modelo y ahorro» y muestra el modelo que responde ahora (con 🌱 si el ahorro lo ha cambiado).
- El botón «Siempre» del modo ahorro pasa a llamarse «Encendido» (tecla e).

## 0.7.2 — 2026-10-06

- Últimos prompts: cada columna con su ancho fijo y el texto recortado a lo que queda; ya no salta de línea ni deja huecos.
- Semana: el ritmo es la media desde que empezó la ventana y no avisa hasta el primer día, en vez de extrapolar las últimas horas.

## 0.7.1 — 2026-10-06

- Primera versión publicada: panel `/consumo` con ventanas de 5 h y semanal, predicción, precio, tokens y consumo por prompt; modo ahorro automático; mascota NeuroSigma que reacciona a Claude y a sus subagentes.
