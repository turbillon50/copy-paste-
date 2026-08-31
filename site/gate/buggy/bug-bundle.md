# Bug bundle — prompts de fix

## 1. Excepción no capturada (crash de JS)

```
[BLOCKER · crash] Excepción no capturada (crash de JS)
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: guardarSesion is not defined

Tarea: Es una excepción no capturada: envuelve el punto de fallo, valida entradas nulas/undefined y añade un ErrorBoundary si es UI.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint f8e5fc56fefe) no debe reaparecer.
```

## 2. Excepción no capturada (crash de JS)

```
[BLOCKER · crash] Excepción no capturada (crash de JS)
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: guardarSesion is not defined

Tarea: Es una excepción no capturada: envuelve el punto de fallo, valida entradas nulas/undefined y añade un ErrorBoundary si es UI.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint f8e5fc56fefe) no debe reaparecer.
```

## 3. Error de consola

```
[HIGH · console] Error de consola
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: No se pudo cargar la configuración remota (config.json)

Tarea: Localiza el origen del log en el código; si es un error real, corrígelo; si es ruido, elimínalo o degrádalo a debug.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 420093fbc0c9) no debe reaparecer.
```

## 4. Elemento nunca apareció (posible spinner infinito / bloqueo)

```
[HIGH · timeout] Elemento nunca apareció (posible spinner infinito / bloqueo)
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard", paso: El dashboard debe aparecer tras login.
Síntoma observado por el ojo IA: Paso #5 (Verificar visible #dashboard — El dashboard debe aparecer tras login): locator.waitFor: Timeout 8000ms exceeded.

Tarea: Algo no aparece a tiempo (posible spinner infinito): añade timeout + estado de error, y verifica la promesa que nunca resuelve.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint d44e28efd93c) no debe reaparecer.
```

## 5. Aserción del escenario falló

```
[HIGH · functional] Aserción del escenario falló
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard", paso: El dashboard debe saludar al usuario.
Síntoma observado por el ojo IA: Paso #6 (Verificar texto "Bienvenido" — El dashboard debe saludar al usuario): Se esperaba el texto "Bienvenido", no se encontró.

Tarea: El flujo esperado no ocurrió: revisa el handler del paso, el estado y la condición que impide el resultado esperado.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 28b977d70aaa) no debe reaparecer.
```

## 6. Error de consola

```
[HIGH · console] Error de consola
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: No se pudo cargar la configuración remota (config.json)

Tarea: Localiza el origen del log en el código; si es un error real, corrígelo; si es ruido, elimínalo o degrádalo a debug.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 420093fbc0c9) no debe reaparecer.
```

## 7. Elemento nunca apareció (posible spinner infinito / bloqueo)

```
[HIGH · timeout] Elemento nunca apareció (posible spinner infinito / bloqueo)
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard", paso: El dashboard debe aparecer tras login.
Síntoma observado por el ojo IA: Paso #5 (Verificar visible #dashboard — El dashboard debe aparecer tras login): locator.waitFor: Timeout 8000ms exceeded.

Tarea: Algo no aparece a tiempo (posible spinner infinito): añade timeout + estado de error, y verifica la promesa que nunca resuelve.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint d44e28efd93c) no debe reaparecer.
```

## 8. Aserción del escenario falló

```
[HIGH · functional] Aserción del escenario falló
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard", paso: El dashboard debe saludar al usuario.
Síntoma observado por el ojo IA: Paso #6 (Verificar texto "Bienvenido" — El dashboard debe saludar al usuario): Se esperaba el texto "Bienvenido", no se encontró.

Tarea: El flujo esperado no ocurrió: revisa el handler del paso, el estado y la condición que impide el resultado esperado.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 28b977d70aaa) no debe reaparecer.
```

## 9. Imagen/recurso roto (404)

```
[MEDIUM · asset] Imagen/recurso roto (404)
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: 404 en http://127.0.0.1:34157/logo-inexistente.png

Tarea: Recurso roto: corrige la ruta del asset, o añade fallback/placeholder y lazy-loading con onError.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint d11a67ce5547) no debe reaparecer.
```

## 10. Respuesta HTTP 404

```
[MEDIUM · network] Respuesta HTTP 404
Dispositivo: desktop. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: 404 en http://127.0.0.1:34157/api/config

Tarea: Revisa el endpoint que devuelve el status: URL, método, auth y manejo de error en el cliente. Añade manejo de fallo visible al usuario.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 4bcd7fe07a10) no debe reaparecer.
```

## 11. Imagen/recurso roto (404)

```
[MEDIUM · asset] Imagen/recurso roto (404)
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: 404 en http://127.0.0.1:34157/logo-inexistente.png

Tarea: Recurso roto: corrige la ruta del asset, o añade fallback/placeholder y lazy-loading con onError.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint d11a67ce5547) no debe reaparecer.
```

## 12. Respuesta HTTP 404

```
[MEDIUM · network] Respuesta HTTP 404
Dispositivo: iphone. Ocurre en el flujo "Login y dashboard".
Síntoma observado por el ojo IA: 404 en http://127.0.0.1:34157/api/config

Tarea: Revisa el endpoint que devuelve el status: URL, método, auth y manejo de error en el cliente. Añade manejo de fallo visible al usuario.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "Login y dashboard" en Vforge Live; el hallazgo (fingerprint 4bcd7fe07a10) no debe reaparecer.
```

## 13. Falta header de seguridad: x-frame-options

```
[MEDIUM · security] Falta header de seguridad: x-frame-options
Dispositivo: http. Ocurre en el flujo "entrega".
Síntoma observado por el ojo IA: x-frame-options — evita clickjacking (o usa CSP frame-ancestors). No presente en la respuesta de http://127.0.0.1:34157.

Tarea: Investiga la causa raíz y aplica el cambio mínimo.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "entrega" en Vforge Live; el hallazgo (fingerprint f04de2f31cc3) no debe reaparecer.
```

## 14. Falta header de seguridad: x-content-type-options

```
[LOW · security] Falta header de seguridad: x-content-type-options
Dispositivo: http. Ocurre en el flujo "entrega".
Síntoma observado por el ojo IA: x-content-type-options — evita MIME sniffing (nosniff). No presente en la respuesta de http://127.0.0.1:34157.

Tarea: Investiga la causa raíz y aplica el cambio mínimo.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "entrega" en Vforge Live; el hallazgo (fingerprint 6521fd7420f6) no debe reaparecer.
```

## 15. Falta header de seguridad: content-security-policy

```
[LOW · security] Falta header de seguridad: content-security-policy
Dispositivo: http. Ocurre en el flujo "entrega".
Síntoma observado por el ojo IA: content-security-policy — mitiga XSS e inyección de contenido. No presente en la respuesta de http://127.0.0.1:34157.

Tarea: Investiga la causa raíz y aplica el cambio mínimo.
Restricciones: cambio mínimo y quirúrgico. No refactorices de más. Incluye el path exacto del archivo que tocas.
Verificación: vuelve a correr el escenario "entrega" en Vforge Live; el hallazgo (fingerprint 5daf61fe738a) no debe reaparecer.
```
