import { prisma } from "@/lib/prisma";
import type { OrderInput } from "@/lib/validation/order";

// Cuántas unidades más se pueden vender de cada producto antes de que algún
// insumo de su receta (ProductSupplyUsage) se quede sin stock en esta
// sucursal — el mínimo entre insumos si la receta usa más de uno (ej. una
// pizza que consume Prepizza + Muzzarella). Productos sin receta cargada no
// aparecen en el resultado: no tienen tope conocido (ver comentario en
// ProductSupplyUsage del schema — no todos los productos la tienen).
export async function getAvailableStock(
  productIds: string[],
  sucursalId: string,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();

  const usages = await prisma.productSupplyUsage.findMany({
    where: { productId: { in: productIds }, supply: { sucursalId } },
    include: { supply: true },
  });

  const byProduct = new Map<string, number>();
  for (const usage of usages) {
    const perUnit = usage.quantity > 0 ? usage.quantity : 1;
    const available = Math.max(0, Math.floor(usage.supply.quantity / perUnit));
    const current = byProduct.get(usage.productId);
    byProduct.set(usage.productId, current === undefined ? available : Math.min(current, available));
  }
  return byProduct;
}

// Cuántas unidades de cada producto pide un conjunto de renglones de
// pedido — mismo criterio que se usa para descontar stock real al vender
// (ver applySupplyDeductions en server/orders/create-order.ts): un producto
// suelto cuenta su cantidad; una mitad y mitad cuenta una sola vez, con la
// receta del primer sabor (insumo compartido, ej. la masa); una promo
// cuenta cada unidad elegida en sus renglones variables (los fijos no
// dependen de lo que el cliente eligió, así que no hace falta validarlos
// acá — su stock se revisa igual si aparecen sueltos en otro pedido).
export function computeRequestedQuantities(items: OrderInput["items"]): Map<string, number> {
  const requested = new Map<string, number>();
  const add = (productId: string, quantity: number) => {
    requested.set(productId, (requested.get(productId) ?? 0) + quantity);
  };
  for (const item of items) {
    if (item.kind === "PRODUCTO") {
      add(item.productId, item.quantity);
    } else if (item.kind === "MEDIA_MEDIA") {
      add(item.productId1, item.quantity);
    } else {
      for (const selection of item.variableSelections) {
        for (const productId of selection.productIds) {
          add(productId, 1);
        }
      }
    }
  }
  return requested;
}
