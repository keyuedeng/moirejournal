// Lets plain `node` scripts import app code that uses the "@/..." alias
// (from jsconfig.json) and extensionless imports, the way Next resolves them.
import { register } from "node:module"

register("data:text/javascript," + encodeURIComponent(`
    import path from "node:path"
    const SRC = ${JSON.stringify(new URL("../src/", import.meta.url).href)}
    export async function resolve(specifier, context, next) {
        if (specifier.startsWith("@/")) specifier = SRC + specifier.slice(2)
        try {
            return await next(specifier, context)
        } catch (err) {
            if (path.extname(specifier)) throw err
            try {
                return await next(specifier + ".js", context)
            } catch {
                return next(specifier + "/index.js", context)
            }
        }
    }
`))
