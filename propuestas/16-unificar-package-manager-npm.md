# Propuesta: Unificar el gestor de paquetes en npm (eliminar rastros de pnpm)

**Estado:** 🟡 Parcial — `pnpm-lock.yaml`/`pnpm-workspace.yaml` ya se eliminaron de la raíz, pero el `Dockerfile` **no se actualizó** (sigue usando `corepack prepare pnpm` y `pnpm install --frozen-lockfile`, lo que hoy rompe el build sin el lockfile). Falta una propuesta de seguimiento para el `Dockerfile`.

## Problema

El proyecto usa NestJS + npm de forma explícita (ver `AGENTS.md`: *"Package manager: npm (nunca pnpm ni yarn)"*), y `package-lock.json` está presente y versionado. Sin embargo, el repositorio también contiene:

- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

Ambos lockfiles conviven al mismo tiempo. Esto es un riesgo real, no cosmético:

- Si un desarrollador o un pipeline de CI ejecuta `pnpm install` en vez de `npm install` (por ejemplo, porque su gestor por defecto detecta `pnpm-lock.yaml` primero, o por una herramienta que autodetecta el lockfile), se generaría un `node_modules` con resolución de dependencias distinta a la que usa el resto del equipo — mismatch de versiones transitivas que no se ve en `package.json` porque ambos archivos de lock pueden divergir con el tiempo.
- `pnpm-workspace.yaml` declara `allowBuilds` para paquetes con scripts de instalación nativos (`bcrypt`, `@swc/core`, `@nestjs/core`), configuración que no tiene efecto ni sentido si el proyecto no usa pnpm — es config muerta que puede confundir a quien la lea pensando que el proyecto es un workspace pnpm.
- Ningún script de `package.json` (`build`, `test`, `docker:*`, etc.) referencia pnpm; todos asumen npm (`npm run typeorm -- ...`).

## Solución

Eliminar los artefactos de pnpm y quedarnos únicamente con `package-lock.json`, consistente con `AGENTS.md` y con los scripts ya existentes en `package.json`.

No se modifica ninguna dependencia ni versión: `package.json` y `package-lock.json` no cambian de contenido, solo se eliminan los dos archivos de pnpm.

---

## Resumen de cambios

| Archivo | Acción |
|---------|--------|
| `pnpm-lock.yaml` | Eliminar |
| `pnpm-workspace.yaml` | Eliminar |
| `.gitignore` | Actualizar — agregar excepción explícita para evitar que un lockfile de pnpm/yarn se cuele de nuevo por error |

---

## 1. Eliminar los lockfiles de pnpm

```powershell
git rm pnpm-lock.yaml pnpm-workspace.yaml
```

## 2. `.gitignore` — actualizado

**Ruta:** `.gitignore`

Se agrega al final del archivo (no se modifica ninguna línea existente):

```gitignore
# Este proyecto usa npm exclusivamente (ver AGENTS.md).
# Se ignoran lockfiles de otros gestores para evitar que se generen/comiteen por error.
pnpm-lock.yaml
pnpm-workspace.yaml
yarn.lock
```

---

## Notas

- No se toca `node_modules/` ni se reinstalan dependencias: `package-lock.json` ya refleja el árbol de dependencias correcto instalado con npm.
- Si algún desarrollador ya tiene un `node_modules` generado por `pnpm install`, debe borrarlo y correr `npm install` de nuevo para asegurar consistencia con el lockfile único del proyecto.
- No se modifica `package.json` (scripts, dependencias) en esta propuesta.

## Orden de aplicación

1. `git rm pnpm-lock.yaml pnpm-workspace.yaml`.
2. Actualizar `.gitignore` con las líneas de arriba.
3. Confirmar que `npm install` sigue instalando sin diffs en `package-lock.json` (`git status` debe quedar limpio tras el install).
4. Commit.
