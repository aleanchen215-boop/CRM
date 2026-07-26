// Paracao: el reparto suma cantidad (cuánto se trajo). Almafuerte (y
// cualquier otra sucursal futura): el reparto cuenta el total final y lo
// deja tal cual (ajuste), no lo suma — pedido puntual para esa sucursal.
export function getRestockMode(sucursalSlug: string | undefined): "add" | "set" {
  return sucursalSlug === "paracao" ? "add" : "set";
}
