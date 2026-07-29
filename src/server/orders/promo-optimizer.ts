// DP que busca, entre todas las formas posibles de combinar promociones
// activas sobre un pool de productos sueltos, la que deja el costo TOTAL más
// bajo (promos elegidas + lo que queda suelto a precio de lista). No se queda
// con la primera promo que matchea ni exige que el pedido sea EXACTAMENTE
// igual a una promo: si sobra cantidad de algo, esa promo se aplica sobre la
// parte que le corresponde y el resto queda suelto. Extraído de
// reconcilePromotions (create-order.ts) para poder usarlo también al cotizar
// un pedido ANTES de confirmarlo (ver quoteOrderItems), así la IA nunca dice
// "no hay promo" para una combinación que en los hechos sí arma una.
export type PromoPoolEntry = { categoryId: string | null; name: string; price: number };
export type PromoDef = {
  id: string;
  price: number;
  items: { kind: "FIJO" | "VARIABLE"; productId: string | null; categoryId: string | null; quantity: number }[];
};
export type PromoUse = { promotionId: string; price: number; selections: Record<string, unknown>[] };

export function optimizePromoUsage(
  initialQuantities: Map<string, number>,
  pool: Map<string, PromoPoolEntry>,
  promotions: PromoDef[],
): { cost: number; uses: PromoUse[] } {
  function stateCost(state: Map<string, number>): number {
    let cost = 0;
    for (const [productId, qty] of state) cost += qty * (pool.get(productId)?.price ?? 0);
    return cost;
  }

  function stateKey(state: Map<string, number>): string {
    return [...state.entries()]
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, qty]) => `${id}:${qty}`)
      .join(",");
  }

  const memo = new Map<string, { cost: number; uses: PromoUse[] }>();

  function solve(state: Map<string, number>): { cost: number; uses: PromoUse[] } {
    const key = stateKey(state);
    const cached = memo.get(key);
    if (cached) return cached;

    let best: { cost: number; uses: PromoUse[] } = { cost: stateCost(state), uses: [] };

    for (const promotion of promotions) {
      const fijoParts = promotion.items.filter((i) => i.kind === "FIJO");
      const variableParts = promotion.items.filter((i) => i.kind === "VARIABLE");

      const fijoOk = fijoParts.every((part) => part.productId && (state.get(part.productId) ?? 0) >= part.quantity);
      const categoryAvailable = (categoryId: string | null) =>
        [...state.entries()]
          .filter(([productId]) => pool.get(productId)?.categoryId === categoryId)
          .reduce((sum, [, qty]) => sum + qty, 0);
      const variableOk = variableParts.every((part) => categoryAvailable(part.categoryId) >= part.quantity);
      if (!fijoOk || !variableOk) continue;

      const nextState = new Map(state);
      const selections: Record<string, unknown>[] = [];

      for (const part of fijoParts) {
        if (!part.productId) continue;
        nextState.set(part.productId, (nextState.get(part.productId) ?? 0) - part.quantity);
        selections.push({
          type: "FIJO",
          productId: part.productId,
          nombre: pool.get(part.productId)?.name ?? "",
          cantidad: part.quantity,
        });
      }

      for (const part of variableParts) {
        let remaining = part.quantity;
        // Prioriza consumir para la promo los productos más caros de la
        // categoría — así lo que queda suelto (a precio de lista) es lo más
        // barato posible, en vez de al revés.
        const candidates = [...nextState.entries()]
          .filter(([productId]) => pool.get(productId)?.categoryId === part.categoryId)
          .sort(([a], [b]) => (pool.get(b)?.price ?? 0) - (pool.get(a)?.price ?? 0));

        const chosen: { productId: string; nombre: string }[] = [];
        for (const [productId, availableQty] of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(availableQty, remaining);
          if (take <= 0) continue;
          nextState.set(productId, availableQty - take);
          for (let i = 0; i < take; i++) chosen.push({ productId, nombre: pool.get(productId)?.name ?? "" });
          remaining -= take;
        }
        selections.push({ type: "VARIABLE", categoria: "", productos: chosen });
      }

      const rest = solve(nextState);
      const cost = promotion.price + rest.cost;
      if (cost < best.cost) {
        best = {
          cost,
          uses: [{ promotionId: promotion.id, price: promotion.price, selections }, ...rest.uses],
        };
      }
    }

    memo.set(key, best);
    return best;
  }

  return solve(initialQuantities);
}
