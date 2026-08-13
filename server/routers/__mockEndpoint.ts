// Módulo auxiliar para captura dos handlers dos endpoints em testes.
// O mock do trpc registra os handlers pelos nomes das chaves do objeto
// passado a router({...}) — por isso o endpoint pode ser invocado pelo nome.
export const endpointsMap: Record<string, (opts: any) => Promise<any>> = {};

/** Registra os handlers do roteador pelo nome dos procedimentos. */
export function registerRouter(defs: Record<string, any>): Record<string, any> {
  Object.assign(endpointsMap, defs);
  return defs;
}

/** Chama o handler capturado do procedimento com o nome informado. */
export function callEndpoint(name: string, input: any, ctx: any = {}): Promise<any> {
  const fn = endpointsMap[name];
  if (!fn) throw new Error(`Endpoint '${name}' não capturado`);
  return fn({ input, ctx });
}
