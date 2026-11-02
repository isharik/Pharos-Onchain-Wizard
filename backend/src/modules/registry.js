import { catalog } from "../../../shared/catalog.js";
const modules = new Map(
  catalog.map((item) => [
    item.id,
    { ...item, load: () => import(`./${item.id}.js`) },
  ]),
);
export const registry = modules;
export async function resolveModule(id) {
  const meta = modules.get(id);
  if (!meta) return null;
  return { ...meta, ...(await meta.load()) };
}
