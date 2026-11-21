# Sustitución del detector de seguridad: PaxmodGuard

- Se elimina el registro y la interfaz de Vigil.
- El identificador activo pasa a ser `paxmod-guard`.
- Se añade `paxmod-guard==0.1.1` a `police-engine/requirements.txt`.
- La inferencia se ejecuta en el servicio local `127.0.0.1:8787`; KERNEL no envía conversaciones a Paxmod. Se activan las señales contextuales `secrecy` y `risk_check` documentadas por el paquete.
- La primera inicialización descarga los pesos (aprox. 220 MB según PyPI); las siguientes ejecuciones reutilizan la caché del paquete.
- Se incorpora PaxmodGuard a la suite de análisis y al gestor de modelos; la ejecución estándar del expediente lo analiza junto a Horizon y Grooming. MrBERT Legal sigue siendo opcional.
- Grooming G01-G09 permanece como detector independiente y experimental.

## Limitaciones y cautelas

El adaptador usa `Guard.check_conversation()` con turnos etiquetados por speaker. Se normalizan `scores`, `labels`, `flagged` y `latency_ms` cuando están presentes. Si el paquete cambia su API, el adaptador devuelve un error explícito; no inventa puntuaciones.

La integración todavía requiere prueba de humo con el paquete y los pesos reales, revisión de dependencias/hashes y evaluación propia con conversaciones españolas representativas. Las puntuaciones no son pruebas ni determinan culpabilidad. No debe activar sanciones automáticas ni sustituir a profesionales.
